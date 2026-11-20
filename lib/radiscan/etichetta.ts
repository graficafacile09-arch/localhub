import { validaBarcode } from "./barcode";
import type {
  CampoEtichetta,
  Discrepanza,
  EtichettaEstratta,
  OcrRisultato,
  RiconoscimentoAi,
} from "./tipi";

/**
 * RadiciScan — estrazione strutturata dell'etichetta e controllo incrociato.
 *
 * Fonte primaria: il testo OCR. Il modello visivo fornisce solo un secondo
 * parere, conservato separatamente. Se i due non concordano, il campo resta
 * con entrambi i valori e viene prodotta una `Discrepanza`: nessuna scelta
 * arbitraria, nessuna fusione silenziosa.
 *
 * I campi non leggibili restano `null`: non si completa un'etichetta con
 * dati plausibili ma non letti.
 */

const RE_SIGLE =
  /\b(d\s*\.?\s*o\s*\.?\s*p\s*\.?|i\s*\.?\s*g\s*\.?\s*p\s*\.?|s\s*\.?\s*t\s*\.?\s*g\s*\.?|d\s*\.?\s*o\s*\.?\s*c\s*\.?|i\s*\.?\s*g\s*\.?\s*t\s*\.?|p\s*\.?\s*a\s*\.?\s*t\s*\.?)\b/gi;

const TERRITORI = [
  "calabria",
  "cosenza",
  "crotone",
  "catanzaro",
  "vibo valentia",
  "reggio calabria",
  "sila",
  "aspromonte",
  "pollino",
  "tropea",
  "senise",
  "silano",
  "silana",
] as const;

const QUALITA = ["DOP", "IGP", "STG", "DOC", "DOCG", "IGT", "PAT"] as const;

function normalizza(valore: string): string {
  return valore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compatta(valore: string): string {
  return valore.replace(/\s*\.\s*/g, "").replace(/\s+/g, " ").trim();
}

function righe(testo: string): string[] {
  return testo
    .split("\n")
    .map((riga) => riga.replace(/\s+/g, " ").trim())
    .filter((riga) => riga.length > 0);
}

function dopoEtichetta(righeTesto: readonly string[], etichette: RegExp): string | null {
  for (const riga of righeTesto) {
    const trovato = etichette.exec(riga);
    if (!trovato) continue;
    const resto = riga.slice(trovato.index + trovato[0].length).replace(/^[\s:\-–]+/, "").trim();
    if (resto.length >= 2) return resto.slice(0, 160);
  }
  return null;
}

function valoriUnici(valori: readonly string[], massimo = 8): string[] {
  const visti = new Set<string>();
  const risultato: string[] = [];
  for (const valore of valori) {
    const pulito = valore.replace(/\s+/g, " ").trim();
    const chiave = normalizza(pulito);
    if (!chiave || visti.has(chiave)) continue;
    visti.add(chiave);
    risultato.push(pulito);
    if (risultato.length >= massimo) break;
  }
  return risultato;
}

function certificazioniDa(testo: string): string[] {
  const trovate: string[] = [];
  for (const trovato of testo.matchAll(RE_SIGLE)) {
    const sigla = compatta(trovato[0]).toUpperCase().replace(/[^A-Z]/g, "");
    const canonica = QUALITA.find((voce) => voce === sigla);
    if (canonica) trovate.push(canonica);
  }
  if (/\bbiologic[oa]\b|\borganic\b/i.test(testo)) trovate.push("BIO");
  return valoriUnici(trovate, 6);
}

function territorioDa(testo: string): string[] {
  const normale = normalizza(testo);
  const trovati: string[] = [];
  for (const territorio of TERRITORI) {
    if (normale.includes(territorio)) {
      trovati.push(territorio.replace(/\b\w/g, (lettera) => lettera.toUpperCase()));
    }
  }
  return valoriUnici(trovati, 6);
}

function barcodeDa(testo: string): string | null {
  const candidate = testo.match(/\b(?:\d[\s-]?){7,13}\d\b/g) ?? [];
  for (const candidato of candidate) {
    const validazione = validaBarcode(candidato);
    if (validazione.valido && validazione.normalizzato) return validazione.normalizzato;
  }
  return null;
}

function ingredientiDa(righeTesto: readonly string[]): string[] {
  for (let indice = 0; indice < righeTesto.length; indice += 1) {
    const riga = righeTesto[indice];
    const trovato = /ingredienti\s*[:\-]?\s*(.*)$/i.exec(riga);
    if (!trovato) continue;
    const parti = [trovato[1]];
    for (let successivo = indice + 1; successivo < righeTesto.length; successivo += 1) {
      if (
        /^(conservare|scadenza|da consumarsi|lotto|prodotto|stabilimento|ean|regione|ingredienti)/i.test(
          righeTesto[successivo]
        )
      ) {
        break;
      }
      parti.push(righeTesto[successivo]);
      if (parti.join(" ").length > 400) break;
    }
    const testo = parti.join(" ").replace(/\s+/g, " ").trim();
    if (!testo) continue;
    return testo
      .split(/[,;]/)
      .map((voce) => voce.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function campo(valore: string | null, fonte: CampoEtichetta["fonte"]): CampoEtichetta {
  return { valore: valore && valore.trim() ? valore.trim() : null, fonte: valore ? fonte : null };
}

/**
 * Compatibilità simmetrica: confronta il testo breve con quello lungo in
 * entrambe le direzioni, altrimenti una denominazione di tre parole contro
 * un'intera etichetta verrebbe sempre dichiarata incompatibile.
 */
function compatibili(a: string, b: string): boolean {
  const na = normalizza(a);
  const nb = normalizza(b);
  if (!na || !nb) return true;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;

  const pa = na.split(" ").filter((parola) => parola.length > 2);
  const pb = nb.split(" ").filter((parola) => parola.length > 2);
  if (pa.length === 0 || pb.length === 0) return true;

  const setA = new Set(pa);
  const setB = new Set(pb);
  const coperturaB = pb.filter((parola) => setA.has(parola)).length / pb.length;
  const coperturaA = pa.filter((parola) => setB.has(parola)).length / pa.length;
  return Math.max(coperturaA, coperturaB) >= 0.6;
}

function confronta(
  campoNome: string,
  ocr: string | null,
  ai: string | null | undefined,
  gravita: Discrepanza["gravita"],
  nota: string
): Discrepanza | null {
  if (!ocr || !ai) return null;
  if (compatibili(ocr, ai)) return null;
  return {
    campo: campoNome,
    ocr,
    ai,
    gravita,
    messaggio: `${nota} OCR: "${ocr}". Modello visivo: "${ai}".`,
  };
}

/**
 * Estrae i campi dall'OCR e confrontali con il modello visivo.
 * Restituisce sempre un'etichetta, anche quando l'OCR non è disponibile.
 */
export function estraiEtichetta(
  ocr: OcrRisultato | null | undefined,
  riconoscimento: RiconoscimentoAi
): { etichetta: EtichettaEstratta; discrepanze: Discrepanza[] } {
  const testo = ocr?.stato === "ok" ? ocr.testo : "";
  const righeTesto = righe(testo);
  const testoCompatto = testo.replace(/\n+/g, " ");

  const produttoreOcr = dopoEtichetta(righeTesto, /(?:prodotto\s+(?:e\s+confezionato\s+)?da|produttore|azienda\s+agricola|caseificio|oleificio|salumificio|pastificio)\s*[:\-]?/i);
  const stabilimentoOcr = dopoEtichetta(righeTesto, /(?:stabilimento(?:\s+di\s+produzione)?|opificio)\s*(?:di|:|\-)?\s*/i);
  const lottoOcr = dopoEtichetta(righeTesto, /\b(?:lotto|lotto\s+n\.?|l\.)\s*[:\-]?\s*/i)?.match(/[A-Z0-9][A-Z0-9./-]{2,24}/i)?.[0] ?? null;
  const denominazioneGrezza = dopoEtichetta(
    righeTesto,
    /denominazione(?:\s+legale)?\s*[:\-]?\s*/i
  );
  // "D.O.P. Denominazione di Origine Protetta" non è una denominazione
  // legale: è la descrizione dello schema. In quel caso vale il modello.
  const denominazioneOcr =
    denominazioneGrezza && !/^di\s+origine/i.test(denominazioneGrezza)
      ? denominazioneGrezza
      : null;
  const indirizzoOcr =
    righeTesto.find((riga) =>
      /\b(?:via|viale|piazza|corso|contrada|località|localita|s\.s\.|ss)\b/i.test(riga) &&
      /\d/.test(riga)
    ) ?? null;

  const nomeCommercialeOcr =
    righeTesto.find(
      (riga) =>
        riga.length >= 3 &&
        riga.length <= 90 &&
        !/^(ingredienti|prodotto|stabilimento|lotto|scadenza|da consumarsi|conservare)/i.test(riga) &&
        !/\b(?:via|viale|piazza|corso)\b/i.test(riga)
    ) ?? null;

  const barcodeOcr = barcodeDa(testo);
  const certificazioni = certificazioniDa(testo);
  const territorio = territorioDa(testoCompatto);

  const aiBarcode = riconoscimento.codiceBarre ? validaBarcode(riconoscimento.codiceBarre) : null;

  const discrepanze: Discrepanza[] = [];

  const schemaAi = riconoscimento.schemaProposto;
  if (schemaAi && testo.length > 0 && !certificazioni.includes(schemaAi)) {
    discrepanze.push({
      campo: "certificazione",
      ocr: certificazioni.length > 0 ? certificazioni.join(", ") : "nessuna sigla di qualità",
      ai: schemaAi,
      gravita: "media",
      messaggio:
        `Il modello visivo propone ${schemaAi}, ma l'OCR non legge quella sigla in etichetta. ` +
        "La denominazione non è confermata dalla lettura testuale.",
    });
  }
  if (
    schemaAi &&
    certificazioni.length > 0 &&
    !certificazioni.includes(schemaAi) &&
    certificazioni.some((sigla) => QUALITA.includes(sigla as (typeof QUALITA)[number]))
  ) {
    discrepanze.push({
      campo: "schema_qualita",
      ocr: certificazioni.join(", "),
      ai: schemaAi,
      gravita: "media",
      messaggio:
        "OCR e modello visivo indicano sigle di qualità diverse: serve un controllo umano, nessuna delle due viene scelta d'ufficio.",
    });
  }

  if (schemaAi === "PAT") {
    discrepanze.push({
      campo: "natura_pat",
      ocr: "PAT",
      ai: "PAT",
      gravita: "bassa",
      messaggio:
        "PAT indica un prodotto agroalimentare tradizionale, non è una certificazione di origine: " +
        "non va presentato come DOP/IGP né come prova di autenticità.",
    });
  }

  if (
    riconoscimento.denominazioneProposta &&
    testo.length > 0 &&
    !compatibili(riconoscimento.denominazioneProposta, testoCompatto)
  ) {
    discrepanze.push({
      campo: "denominazione",
      ocr: null,
      ai: riconoscimento.denominazioneProposta,
      gravita: "bassa",
      messaggio:
        "La denominazione proposta dal modello non compare nel testo OCR: può dipendere da un'etichetta poco leggibile o da un'ipotesi del modello. " +
        "Il dato resta non verificato.",
    });
  }

  const produttoreAi = riconoscimento.produttore ?? null;
  if (produttoreOcr && produttoreAi && !compatibili(produttoreOcr, produttoreAi)) {
    discrepanze.push({
      campo: "produttore",
      ocr: produttoreOcr,
      ai: produttoreAi,
      gravita: "media",
      messaggio:
        "Produttore letto dall'OCR e produttore indicato dal modello non coincidono: " +
        "entrambi restano visibili, nessuno viene scelto automaticamente.",
    });
  }

  const lottoAi = riconoscimento.lotto ?? null;
  if (lottoOcr && lottoAi && normalizza(lottoOcr) !== normalizza(lottoAi)) {
    discrepanze.push({
      campo: "lotto",
      ocr: lottoOcr,
      ai: lottoAi,
      gravita: "media",
      messaggio: "Lotto letto dall'OCR diverso da quello indicato dal modello: da controllare sulla confezione.",
    });
  }

  const barcodeAi = aiBarcode?.valido ? aiBarcode.normalizzato : null;
  if (barcodeOcr && barcodeAi && barcodeOcr !== barcodeAi) {
    discrepanze.push({
      campo: "codice_a_barre",
      ocr: barcodeOcr,
      ai: barcodeAi,
      gravita: "media",
      messaggio: "Codice a barre OCR diverso da quello indicato dal modello: nessuna interrogazione automatica.",
    });
  }

  const territorioAi = riconoscimento.territorioProposto;
  if (
    territorioAi &&
    territorio.length > 0 &&
    !territorio.some((voce) => compatibili(voce, territorioAi))
  ) {
    discrepanze.push({
      campo: "territorio",
      ocr: territorio.join(", "),
      ai: territorioAi,
      gravita: "bassa",
      messaggio: "Il territorio letto dall'OCR non coincide con quello proposto dal modello.",
    });
  }

  const confidenza = ocr?.stato === "ok" ? ocr.confidenza : 0;
  const leggibilita =
    ocr?.stato !== "ok"
      ? "sconosciuta"
      : confidenza >= 75
        ? "buona"
        : confidenza >= 45
          ? "parziale"
          : "scarsa";

  return {
    etichetta: {
      nomeCommerciale: campo(nomeCommercialeOcr, "ocr"),
      denominazioneLegale:
        denominazioneOcr || riconoscimento.denominazioneProposta
          ? campo(denominazioneOcr ?? riconoscimento.denominazioneProposta ?? null, denominazioneOcr ? "ocr" : "ai")
          : campo(null, null),
      produttore:
        produttoreOcr && produttoreAi
          ? compatibili(produttoreOcr, produttoreAi)
            ? campo(produttoreOcr, "ocr_e_ai")
            : campo(produttoreOcr, "ocr")
          : campo(produttoreOcr ?? produttoreAi, produttoreOcr ? "ocr" : produttoreAi ? "ai" : null),
      stabilimento: campo(stabilimentoOcr, "ocr"),
      indirizzo: campo(indirizzoOcr, "ocr"),
      lotto: campo(lottoOcr ?? riconoscimento.lotto ?? null, lottoOcr ? "ocr" : riconoscimento.lotto ? "ai" : null),
      codiceBarre: campo(
        barcodeOcr ?? (barcodeAi ?? null),
        barcodeOcr ? "ocr" : barcodeAi ? "ai" : null
      ),
      ingredienti: ingredientiDa(righeTesto),
      certificazioni,
      territorioDichiarato: territorio,
      leggibilita,
    },
    discrepanze,
  };
}
