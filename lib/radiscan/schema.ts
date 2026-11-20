import { SCHEMI_QUALITA } from "./fonti";
import type { RiconoscimentoAi } from "./tipi";

/**
 * RadiciScan — schema rigoroso dell'output del modello.
 *
 * Nessuna libreria di validazione: le dipendenze sono già quelle del
 * progetto. Il parser è volutamente severo sui tipi e tollerante solo dove
 * il modello può essere impreciso (enum sconosciuti, numeri fuori scala):
 * in quei casi il campo diventa null e viene registrato un avviso.
 *
 * Le fonti proposte dal modello non esistono in questo schema: RadiciScan
 * usa esclusivamente il registro ufficiale. Un eventuale campo `fonti` o
 * `url` nell'output viene ignorato e segnalato.
 */

const MAX_TESTO = 200;
const MAX_TESTO_BREVE = 120;
const MAX_VOCI = 8;
const MAX_VOCE = 160;

/**
 * Estrazione JSON autonoma di RadiciScan.
 *
 * Replica il comportamento atteso dal modello (oggetto nudo, fence markdown
 * o testo attorno all'oggetto) senza dipendere dal parser del percorso
 * venditori: RadiciScan resta isolato dalle funzionalità Vision.
 */
function estraiTestoJson(testo: string): string {
  const ritagliato = testo.trim();
  try {
    JSON.parse(ritagliato);
    return ritagliato;
  } catch {
    // prosegue con il ritaglio tra la prima graffa e l'ultima
  }
  const inizio = ritagliato.indexOf("{");
  const fine = ritagliato.lastIndexOf("}");
  if (inizio !== -1 && fine > inizio) {
    return ritagliato.slice(inizio, fine + 1);
  }
  return ritagliato;
}

type EsitoJson = { ok: true; value: unknown } | { ok: false };

function analizzaJson(testo: string): EsitoJson {
  try {
    return { ok: true, value: JSON.parse(estraiTestoJson(testo)) };
  } catch {
    return { ok: false };
  }
}

export interface OutputModelloValido {
  riconoscimento: RiconoscimentoAi;
  avvisi: string[];
}

export type EsitoSchema =
  | { ok: true; valore: OutputModelloValido }
  | { ok: false; motivo: string };

function testoNormalizzato(valore: unknown, max: number): string | null {
  if (typeof valore !== "string") return null;
  const pulito = valore
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!pulito) return null;
  return pulito.length > max ? pulito.slice(0, max).trim() : pulito;
}

function elencoTesti(valore: unknown, avvisi: string[], etichetta: string): string[] {
  if (valore === null || valore === undefined) return [];
  if (!Array.isArray(valore)) {
    avvisi.push(`${etichetta}: atteso un elenco, valore ignorato`);
    return [];
  }
  const voci: string[] = [];
  for (const voce of valore.slice(0, MAX_VOCI)) {
    const testo = testoNormalizzato(voce, MAX_VOCE);
    if (testo) voci.push(testo);
  }
  if (valore.length > MAX_VOCI) {
    avvisi.push(`${etichetta}: limite di ${MAX_VOCI} voci applicato`);
  }
  return voci;
}

/** Diciture del bollino, non nomi di denominazione. */
function denominazioneGenerica(valore: string): boolean {
  const chiave = valore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return [
    "dop",
    "igp",
    "stg",
    "pdo",
    "pgi",
    "tsg",
    "denominazione di origine protetta",
    "denominazione di origine controllata",
    "denominazione di origine controllata e garantita",
    "indicazione geografica protetta",
    "specialita tradizionale garantita",
    "prodotto dop",
    "prodotto igp",
  ].includes(chiave);
}

function schemaQualita(valore: unknown, avvisi: string[]): RiconoscimentoAi["schemaProposto"] {
  if (valore === null || valore === undefined) return null;
  if (typeof valore !== "string") {
    avvisi.push("schema_proposto: tipo non valido, valore ignorato");
    return null;
  }
  const normalizzato = valore.trim().toUpperCase();
  const trovato = (SCHEMI_QUALITA as readonly string[]).includes(normalizzato);
  if (!trovato) {
    avvisi.push("schema_proposto: valore non riconosciuto, impostato a null");
    return null;
  }
  return normalizzato as RiconoscimentoAi["schemaProposto"];
}

function confidenza(valore: unknown, avvisi: string[]): number {
  if (typeof valore !== "number" || !Number.isFinite(valore)) {
    if (valore !== null && valore !== undefined) {
      avvisi.push("confidenza: valore non numerico, impostata a 0");
    }
    return 0;
  }
  const arrotondata = Math.round(valore);
  if (arrotondata < 0 || arrotondata > 100) {
    avvisi.push("confidenza: fuori intervallo, riportata a 0-100");
  }
  return Math.max(0, Math.min(100, arrotondata));
}

/** Estrae e valida il riconoscimento da un testo del modello. */
export function analizzaOutputModello(testo: string): EsitoSchema {
  if (typeof testo !== "string" || testo.trim() === "") {
    return { ok: false, motivo: "risposta vuota" };
  }

  const parsed = analizzaJson(testo);
  if (!parsed.ok) return { ok: false, motivo: "risposta non JSON" };

  const valore = parsed.value;
  if (valore === null || typeof valore !== "object" || Array.isArray(valore)) {
    return { ok: false, motivo: "JSON non è un oggetto" };
  }

  const payload = valore as Record<string, unknown>;
  const avvisi: string[] = [];

  if ("fonti" in payload || "fonti_proposte" in payload || "url" in payload) {
    avvisi.push("fonti proposte dal modello ignorate: si usa solo il registro ufficiale");
  }

  const prodotto = testoNormalizzato(payload.prodotto, MAX_TESTO_BREVE);
  if (!prodotto) return { ok: false, motivo: "campo prodotto assente o vuoto" };

  // Il modello a volte scambia la dicitura del bollino per il nome della
  // denominazione. In quel caso il nome del prodotto è l'unico dato leggibile:
  // usarlo è più corretto che cercare nel registro "Denominazione di Origine
  // Protetta". L'avviso rende esplicita la sostituzione.
  let denominazioneProposta = testoNormalizzato(
    payload.denominazione_proposta,
    MAX_TESTO_BREVE
  );
  if (denominazioneProposta && denominazioneGenerica(denominazioneProposta)) {
    avvisi.push(
      "denominazione_proposta generica: usato il nome del prodotto come denominazione"
    );
    denominazioneProposta = prodotto;
  }

  return {
    ok: true,
    valore: {
      riconoscimento: {
        prodotto,
        categoria: testoNormalizzato(payload.categoria, MAX_TESTO),
        denominazioneProposta,
        territorioProposto: testoNormalizzato(payload.territorio_proposto, MAX_TESTO),
        schemaProposto: schemaQualita(payload.schema_proposto, avvisi),
        indicatoriEtichetta: elencoTesti(
          payload.indicatori_etichetta,
          avvisi,
          "indicatori_etichetta"
        ),
        confidenza: confidenza(payload.confidenza, avvisi),
        note: testoNormalizzato(payload.note, MAX_TESTO),
        incongruenzeRilevate: elencoTesti(
          payload.incongruenze_rilevate,
          avvisi,
          "incongruenze_rilevate"
        ),
        produttore: testoNormalizzato(payload.produttore, MAX_TESTO_BREVE),
        stabilimento: testoNormalizzato(payload.stabilimento, MAX_TESTO_BREVE),
        indirizzo: testoNormalizzato(payload.indirizzo, MAX_TESTO),
        lotto: testoNormalizzato(payload.lotto, 40),
        codiceBarre: (() => {
          const codice = testoNormalizzato(payload.codice_barre, 20);
          if (!codice) return null;
          const cifre = codice.replace(/[\s-]/g, "");
          if (!/^\d{8,14}$/.test(cifre)) {
            avvisi.push("codice_barre: valore non numerico o lunghezza non valida, ignorato");
            return null;
          }
          return cifre;
        })(),
        ingredienti: elencoTesti(payload.ingredienti, avvisi, "ingredienti"),
        certificazioni: elencoTesti(payload.certificazioni, avvisi, "certificazioni"),
      },
      avvisi,
    },
  };
}
