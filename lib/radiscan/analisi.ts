import { creaDettaglioEtichetta } from "./dettaglio";
import { estraiEtichetta } from "./etichetta";
import { erroreInput, erroreSchema } from "./errori";
import type { FonteUfficiale } from "./fonti";
import { componiEsito } from "./livelli";
import { leggiEtichettaOcr, type MotoreOcr } from "./ocr";
import { buildPromptRadiciScan, VERSIONE_PROMPT } from "./prompt";
import { verificaProduttore } from "./produttore";
import { ricercaNonDisponibile, ricercaNonEseguita } from "./ricerca";
import { analizzaOutputModello } from "./schema";
import {
  MIME_AMMESSI,
  type Discrepanza,
  type EsitoAnalisi,
  type IngressoAnalisi,
  type MetaAnalisi,
  type MimeAmmesso,
  type EsitoRicercaDocumentale,
  type ProviderRadiciScan,
  type ProviderRicercaDocumentale,
  type SchedaProdottoBarcode,
  type TempiAnalisi,
} from "./tipi";
import type { ProviderRicercaWeb } from "./web";
import { sintetizzaFontiWeb } from "./web";
import { verificaDenominazione } from "./verifica";

/**
 * RadiciScan — pipeline multi-metodo.
 *
 * Fasi indipendenti, eseguite in parallelo quando possibile:
 *   1. modello visivo + OCR (in parallelo, stessa immagine);
 *   2. registro eAmbrosia (con lettura documentale) + ricerca web + banca
 *      dati prodotti, in parallelo;
 *   3. estrazione etichetta, controllo incrociato e verifica;
 *   4. composizione dell'esito con tempi reali.
 *
 * Nessuna fase può alzare il livello oltre quello della verifica documentale.
 * Una divergenza OCR/modello di gravità media abbassa un eventuale
 * `verificato`, perché il dato in etichetta non è confermato dalla lettura.
 *
 * Il modello non vede il registro e non può citare fonti. Nessuna immagine
 * viene scritta, salvata o conservata.
 */

const RE_IMPRONTA = /^[0-9a-f]{16}$/;

function validaIngresso(ingresso: IngressoAnalisi): {
  base64: string;
  mime: MimeAmmesso;
  impronta: string | null;
} {
  const base64 = ingresso.immagineBase64?.trim() ?? "";
  if (!base64) throw erroreInput("Immagine assente.");
  if (base64.startsWith("data:")) {
    throw erroreInput("Immagine non valida: attesa la sola codifica base64.");
  }

  const mime = ingresso.mimeType?.trim().toLowerCase() ?? "";
  if (!(MIME_AMMESSI as readonly string[]).includes(mime)) {
    throw erroreInput("Formato immagine non supportato.");
  }

  const impronta = ingresso.improntaImmagine?.trim().toLowerCase();
  if (impronta && !RE_IMPRONTA.test(impronta)) {
    throw erroreInput("Impronta immagine non valida.");
  }

  return { base64, mime: mime as MimeAmmesso, impronta: impronta || null };
}

export interface DipendenzeAnalisi {
  provider: ProviderRadiciScan;
  /** Provider documentale: se assente la ricerca è dichiarata non eseguita. */
  ricerca?: ProviderRicercaDocumentale;
  /** Ricerca web generalista e sulle fonti istituzionali. */
  web?: ProviderRicercaWeb;
  /** Motore OCR: iniettabile nei test, nessun download nei test. */
  ocr?: MotoreOcr;
  /** Interrogazione della banca dati prodotti per codice a barre. */
  cercaBarcode?: (codice: string) => Promise<SchedaProdottoBarcode>;
  registro: readonly FonteUfficiale[];
  adesso?: Date;
  /** Interruzione richiesta dalla route (timeout complessivo). */
  signal?: AbortSignal;
}

export interface RisultatoAnalisi {
  esito: EsitoAnalisi;
  meta: MetaAnalisi;
  avvisiSchema: string[];
  improntaImmagine: string | null;
}

/** Esegue una singola analisi. Non persiste nulla e non conserva immagini. */
export async function analizzaProdotto(
  ingresso: IngressoAnalisi,
  dipendenze: DipendenzeAnalisi
): Promise<RisultatoAnalisi> {
  const { base64, mime, impronta } = validaIngresso(ingresso);
  const { provider, registro, signal } = dipendenze;
  const inizio = Date.now();

  // OCR e modello visivo partono insieme: due metodi indipendenti.
  const ocrAvvio = Date.now();
  const ocrPromise = dipendenze.ocr
    ? leggiEtichettaOcr(Buffer.from(base64, "base64"), {
        motore: dipendenze.ocr,
        signal,
      })
    : Promise.resolve(null);

  // Il dettaglio ingrandito è facoltativo: `null` significa che Sharp non è
  // disponibile o che l'immagine non è ritagliabile. In quel caso si invia
  // solo l'originale, senza interrompere l'analisi.
  const immagineDettaglioBase64 =
    (await creaDettaglioEtichetta(base64)) ?? undefined;

  const aiAvvio = Date.now();
  const rispostaAi = await provider.genera({
    prompt: buildPromptRadiciScan(),
    immagineBase64: base64,
    mimeType: mime,
    immagineDettaglioBase64,
    signal,
  });
  const testo = rispostaAi.testo;
  const modelloUsato = rispostaAi.modello ?? provider.modello;
  const identificazioneMs = Date.now() - aiAvvio;

  const schema = analizzaOutputModello(testo);
  if (!schema.ok) {
    throw erroreSchema(`Output del modello non conforme: ${schema.motivo}`);
  }

  const ocr = await ocrPromise;
  const ocrMs = ocr ? ocr.durataMs : Date.now() - ocrAvvio;

  const riconoscimento = schema.valore.riconoscimento;
  const codiceBarre =
    ingresso.codiceBarre?.trim() ||
    (riconoscimento.codiceBarre ?? "").trim() ||
    null;

  // Fase documentale e web in parallelo: nessuna attesa inutile.
  const documentiAvvio = Date.now();
  const ricercaPromise: Promise<EsitoRicercaDocumentale> = dipendenze.ricerca
    ? dipendenze.ricerca.cerca({ riconoscimento, signal }).catch(() => ricercaNonDisponibile())
    : Promise.resolve(ricercaNonEseguita());

  const webPromise = dipendenze.web      ? dipendenze.web.cerca({ riconoscimento, signal }).catch(() => ({
        stato: "non_disponibile" as const,
        consultataIl: null,
        query: [],
        fonti: [],
        messaggio:
          "La ricerca web non è stata completata: nessun risultato è stato letto.",
        durataMs: 0,
        motore: "nessuno",
        sintesi: null,
      }))
    : Promise.resolve(null);

  const barcodePromise =
    codiceBarre && dipendenze.cercaBarcode
      ? dipendenze
          .cercaBarcode(codiceBarre)
          .catch(() => null)
      : Promise.resolve(null);

  const [ricerca, web, barcode] = await Promise.all([
    ricercaPromise,
    webPromise,
    barcodePromise,
  ]);
  const documentiMs = Date.now() - documentiAvvio;

  const { etichetta, discrepanze } = estraiEtichetta(ocr, riconoscimento);

  const verifica = verificaDenominazione(riconoscimento, registro, ricerca);
  // La sintesi A-E viene calcolata dopo la verifica: la denominazione può
  // usare la prova ufficiale eAmbrosia, mentre le altre voci usano solo le
  // pagine web realmente lette. La confezione resta sempre separata.
  if (web) {
    web.sintesi = sintetizzaFontiWeb(riconoscimento, web.fonti, verifica.prove);
  }
  const esito = componiEsito({
    riconoscimento,
    verifica,
    versionePrompt: VERSIONE_PROMPT,
  });

  const produttore = verificaProduttore({
    riconoscimento,
    etichetta,
    ocr,
    web,
    prove: verifica.prove,
    lettura: ricerca.lettura,
    discrepanze,
  });

  // Una divergenza media non viene ignorata: abbassa un verificato, perché
  // il dato in etichetta non è confermato da entrambi i metodi.
  const divergenzeMedia = discrepanze.filter((voce) => voce.gravita === "media");
  if (esito.livello === "verificato" && divergenzeMedia.length > 0) {
    esito.livello = "incongruenza_possibile";
    esito.denominazioneVerificata = null;
    esito.verifica = {
      ...esito.verifica,
      livello: "incongruenza_possibile",
      motivazione:
        `${esito.verifica.motivazione} OCR e modello visivo divergono su ${divergenzeMedia.length} ` +
        "campo/i dell'etichetta: il livello verificato non viene mantenuto.",
    };
  }

  const tempi: TempiAnalisi = {
    identificazioneMs,
    ocrMs,
    documentiMs,
    webMs: web?.durataMs ?? 0,
    totaleMs: Date.now() - inizio,
  };

  esito.ocr = ocr;
  esito.etichetta = etichetta;
  esito.discrepanze = discrepanze;
  esito.web = web;
  esito.barcode = barcode;
  esito.produttore = produttore;
  esito.tempi = tempi;

  return {
    esito,
    meta: {
      provider: provider.nome,
      modello: modelloUsato,
      durataMs: identificazioneMs,
      versionePrompt: VERSIONE_PROMPT,
      fasi: tempi,
    },
    avvisiSchema: schema.valore.avvisi,
    improntaImmagine: impronta,
  };
}

export type { Discrepanza };
