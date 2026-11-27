import { SCHEMI_QUALITA } from "./fonti";
import type { RiconoscimentoAi } from "./tipi";

/**
 * RadiciScan — schema dell'output del modello.
 *
 * Il parser è tollerante sulla *forma* e rigoroso sul *significato*:
 * - accetta JSON racchiuso in Markdown, testo prima o dopo, BOM, chiavi in
 *   camelCase o con spazi, campi facoltativi mancanti o null, numeri scritti
 *   come stringhe, elenchi scritti come stringa separata da virgole;
 * - ripara un JSON troncato chiudendo stringhe e parentesi già aperte, senza
 *   inventare alcun valore;
 * - rifiuta un output senza nome prodotto, perché senza prodotto non c'è
 *   riconoscimento;
 * - non accetta schemi di qualità fuori elenco e non usa mai il modello come
 *   fonte: le fonti proposte vengono ignorate e segnalate.
 *
 * Sicurezza invariata: `denominazione_proposta` generica viene sostituita dal
 * nome prodotto (con avviso), `schema_proposto` resta un enum chiuso,
 * `certificazioni` resta ciò che il modello dichiara di aver letto o
 * riconosciuto, mai una certificazione aggiunta dal codice.
 */

const MAX_TESTO = 200;
const MAX_TESTO_BREVE = 120;
const MAX_VOCI = 8;
const MAX_VOCE = 160;

/** Chiave confrontabile: minuscola, senza accenti, spazi o underscore. */
function normalizzaChiave(chiave: string): string {
  return chiave
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Chiude stringhe e parentesi rimaste aperte in un JSON troncato.
 * Non aggiunge campi né valori: rende soltanto parsabile ciò che il modello
 * ha già scritto. Restituisce `null` se il testo non è un oggetto.
 */
function riparaJsonTroncato(testo: string): string | null {
  const inizio = testo.indexOf("{");
  if (inizio === -1) return null;

  const frammento = testo.slice(inizio);
  let inStringa = false;
  let escape = false;
  const pila: string[] = [];

  for (const carattere of frammento) {
    if (inStringa) {
      if (escape) {
        escape = false;
      } else if (carattere === "\\") {
        escape = true;
      } else if (carattere === '"') {
        inStringa = false;
      }
      continue;
    }
    if (carattere === '"') {
      inStringa = true;
    } else if (carattere === "{" || carattere === "[") {
      pila.push(carattere);
    } else if (carattere === "}" || carattere === "]") {
      pila.pop();
    }
  }

  let riparato = frammento;
  if (inStringa) riparato += '"';
  // Una virgola o i due punti finali non sono validi prima della chiusura.
  riparato = riparato.replace(/[,:\s]+$/, "");
  for (let indice = pila.length - 1; indice >= 0; indice -= 1) {
    riparato += pila[indice] === "{" ? "}" : "]";
  }
  return riparato;
}

function candidatiJson(testo: string): string[] {
  const ritagliato = testo.replace(/^\uFEFF/, "").trim();
  const senzaFence = ritagliato.replace(/```(?:json)?/gi, "").trim();
  const inizio = senzaFence.indexOf("{");
  const fine = senzaFence.lastIndexOf("}");
  const oggetto =
    inizio !== -1 && fine > inizio
      ? senzaFence.slice(inizio, fine + 1)
      : senzaFence;
  const riparato = riparaJsonTroncato(senzaFence);

  const candidati = [ritagliato, senzaFence, oggetto, riparato ?? ""];
  return [...new Set(candidati.filter((candidato) => candidato.trim() !== ""))];
}

function analizzaJson(testo: string): { ok: true; value: unknown } | { ok: false } {
  for (const candidato of candidatiJson(testo)) {
    try {
      return { ok: true, value: JSON.parse(candidato) };
    } catch {
      // si prova il candidato successivo
    }
  }
  return { ok: false };
}

export interface OutputModelloValido {
  riconoscimento: RiconoscimentoAi;
  avvisi: string[];
}

export type EsitoSchema =
  | { ok: true; valore: OutputModelloValido }
  | { ok: false; motivo: string };

function testoNormalizzato(valore: unknown, max: number): string | null {
  if (typeof valore === "number" && Number.isFinite(valore)) {
    return String(valore);
  }
  if (typeof valore !== "string") return null;
  const pulito = valore
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!pulito) return null;
  return pulito.length > max ? pulito.slice(0, max).trim() : pulito;
}

/** Elenco di stringhe: array, oppure stringa separata da virgole/punti e virgola. */
function elencoTesti(valore: unknown, avvisi: string[], etichetta: string): string[] {
  if (valore === null || valore === undefined) return [];

  let voci: unknown[];
  if (Array.isArray(valore)) {
    voci = valore;
  } else if (typeof valore === "string") {
    voci = valore.split(/[,;\n]/);
  } else {
    avvisi.push(`${etichetta}: atteso un elenco, valore ignorato`);
    return [];
  }

  const risultato: string[] = [];
  for (const voce of voci.slice(0, MAX_VOCI)) {
    const testo = testoNormalizzato(voce, MAX_VOCE);
    if (testo) risultato.push(testo);
  }
  if (voci.length > MAX_VOCI) {
    avvisi.push(`${etichetta}: limite di ${MAX_VOCI} voci applicato`);
  }
  return risultato;
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

function schemaQualita(
  valore: unknown,
  avvisi: string[]
): RiconoscimentoAi["schemaProposto"] {
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

/**
 * Codice dell'organismo di controllo biologico: due lettere, `BIO`, tre cifre
 * (es. `IT-BIO-006`). Separatori spuri vengono normalizzati; un codice con
 * parti mancanti non viene mai completato e finisce negli avvisi.
 */
function codiceOrganismo(valore: unknown, avvisi: string[]): string | null {
  const testo = testoNormalizzato(valore, 40);
  if (!testo) return null;
  const trovato = /\b([A-Z]{2})\s*[-–—.\/]?\s*BIO\s*[-–—.\/]?\s*(\d{3})\b/i.exec(testo);
  if (!trovato) {
    avvisi.push("codice_organismo: formato non riconosciuto, valore ignorato");
    return null;
  }
  return `${trovato[1].toUpperCase()}-BIO-${trovato[2]}`;
}

/**
 * Origine delle materie prime biologiche: le diciture ammesse dal regolamento
 * UE vengono ricondotte alla forma canonica, un'altra dicitura resta com'è.
 */
function origineMateriePrime(valore: unknown, avvisi: string[]): string | null {
  const testo = testoNormalizzato(valore, 60);
  if (!testo) return null;

  const minuscola = testo.toLowerCase().replace(/\s+/g, " ");
  const nonUe = /non\s*(?:ue|eu|comunit\w*)/.test(minuscola);
  const ue = /(?:^|[^a-z])(?:ue|eu)(?:[^a-z]|$)|union\w*\s+europea/.test(minuscola);
  const italia = /\bitalia\b|\bitalian[oa]\b/.test(minuscola);

  if (nonUe && ue) return "Agricoltura UE / non UE";
  if (nonUe) return "Agricoltura non UE";
  if (italia) return "Agricoltura Italia";
  if (ue) return "Agricoltura UE";

  // Dicitura diversa (per esempio in un'altra lingua): si conserva il testo
  // letto invece di forzarlo in una categoria non dichiarata.
  avvisi.push("origine_materie_prime: dicitura mantenuta come letta");
  return testo;
}

/** Confidenza: accetta 85, "85", "85%". Fuori scala viene riportata a 0-100. */
function confidenza(valore: unknown, avvisi: string[]): number {
  let numero: number;
  if (typeof valore === "number") {
    numero = valore;
  } else if (typeof valore === "string" && valore.trim() !== "") {
    const estratto = Number(valore.replace(/[^0-9.,-]/g, "").replace(",", "."));
    numero = estratto;
  } else {
    if (valore !== null && valore !== undefined) {
      avvisi.push("confidenza: valore non numerico, impostata a 0");
    }
    return 0;
  }

  if (!Number.isFinite(numero)) {
    avvisi.push("confidenza: valore non numerico, impostata a 0");
    return 0;
  }

  const arrotondata = Math.round(numero);
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

  // Le chiavi vengono confrontate ignorando maiuscole, underscore e accenti:
  // il modello scrive indifferentemente `denominazione_proposta` o
  // `denominazioneProposta`.
  const campi = new Map<string, unknown>();
  for (const [chiave, contenuto] of Object.entries(payload)) {
    const normalizzata = normalizzaChiave(chiave);
    if (!campi.has(normalizzata)) campi.set(normalizzata, contenuto);
  }
  const leggi = (...nomi: string[]): unknown => {
    for (const nome of nomi) {
      const trovato = campi.get(normalizzaChiave(nome));
      if (trovato !== undefined) return trovato;
    }
    return undefined;
  };

  if (campi.has("fonti") || campi.has("fontiproposte") || campi.has("url")) {
    avvisi.push("fonti proposte dal modello ignorate: si usa solo il registro ufficiale");
  }

  const prodotto = testoNormalizzato(
    leggi("prodotto", "nome", "nome_prodotto", "product_name", "product"),
    MAX_TESTO_BREVE
  );
  if (!prodotto) return { ok: false, motivo: "campo prodotto assente o vuoto" };

  // Il modello a volte scambia la dicitura del bollino per il nome della
  // denominazione. In quel caso il nome del prodotto è l'unico dato leggibile:
  // usarlo è più corretto che cercare nel registro "Denominazione di Origine
  // Protetta". L'avviso rende esplicita la sostituzione.
  let denominazioneProposta = testoNormalizzato(
    leggi("denominazione_proposta", "denominazione", "denominazione_prodotta"),
    MAX_TESTO_BREVE
  );
  if (denominazioneProposta && denominazioneGenerica(denominazioneProposta)) {
    avvisi.push(
      "denominazione_proposta generica: usato il nome del prodotto come denominazione"
    );
    denominazioneProposta = prodotto;
  }

  const codiceBarreGrezzo = testoNormalizzato(
    leggi("codice_barre", "codicebarre", "codice_ean", "ean", "barcode"),
    20
  );

  return {
    ok: true,
    valore: {
      riconoscimento: {
        prodotto,
        categoria: testoNormalizzato(leggi("categoria", "category"), MAX_TESTO),
        denominazioneProposta,
        territorioProposto: testoNormalizzato(
          leggi("territorio_proposto", "territorio", "zona_produzione", "zona"),
          MAX_TESTO
        ),
        schemaProposto: schemaQualita(leggi("schema_proposto", "schema", "qualita"), avvisi),
        indicatoriEtichetta: elencoTesti(
          leggi("indicatori_etichetta", "indicatori", "indicatori_grafici"),
          avvisi,
          "indicatori_etichetta"
        ),
        confidenza: confidenza(leggi("confidenza", "confidence", "affidabilita"), avvisi),
        note: testoNormalizzato(leggi("note", "notes", "osservazioni"), MAX_TESTO),
        incongruenzeRilevate: elencoTesti(
          leggi("incongruenze_rilevate", "incongruenze", "anomalie"),
          avvisi,
          "incongruenze_rilevate"
        ),
        produttore: testoNormalizzato(leggi("produttore", "producer"), MAX_TESTO_BREVE),
        stabilimento: testoNormalizzato(leggi("stabilimento", "plant"), MAX_TESTO_BREVE),
        indirizzo: testoNormalizzato(leggi("indirizzo", "address"), MAX_TESTO),
        lotto: testoNormalizzato(leggi("lotto", "batch", "lot"), 40),
        codiceBarre: (() => {
          if (!codiceBarreGrezzo) return null;
          const cifre = codiceBarreGrezzo.replace(/[\s-]/g, "");
          if (!/^\d{8,14}$/.test(cifre)) {
            avvisi.push("codice_barre: valore non numerico o lunghezza non valida, ignorato");
            return null;
          }
          return cifre;
        })(),
        ingredienti: elencoTesti(leggi("ingredienti"), avvisi, "ingredienti"),
        certificazioni: elencoTesti(leggi("certificazioni"), avvisi, "certificazioni"),
        codiceOrganismo: codiceOrganismo(
          leggi("codice_organismo", "codice_organismo_controllo", "codice_ente"),
          avvisi
        ),
        origineMateriePrime: origineMateriePrime(
          leggi("origine_materie_prime", "origine_materie", "origine_biologica"),
          avvisi
        ),
      },
      avvisi,
    },
  };
}
