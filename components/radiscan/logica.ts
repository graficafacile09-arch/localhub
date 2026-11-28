import {
  LIVELLI,
  type EsitoAnalisi,
  type EsitoRicercaDocumentale,
  type Livello,
  type RicercaWeb,
  type RiconoscimentoAi,
} from "@/lib/radiscan/tipi";

/**
 * RadiciScan — logica pura dell'interfaccia.
 *
 * Questo modulo non importa React, moduli Node o l'index `@/lib/radiscan`:
 * può essere eseguito anche dai test con `node --experimental-strip-types`.
 * Le uniche dipendenze sono i tipi e la costante `LIVELLI` di `tipi.ts`, che
 * non contiene codice server.
 */

/** Formati che il browser può inviare; la route accetta JPEG, PNG e WebP. */
export const MIME_AMMESSI_UI = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

/** Stesso limite della route: 3 MiB di immagine dopo la normalizzazione. */
export const MAX_IMMAGINE_BYTES = 3 * 1024 * 1024;

/**
 * Tetto del file originale: le foto degli smartphone superano spesso i 3 MiB
 * e devono poter essere ridimensionate nel browser, non rifiutate in partenza.
 */
export const MAX_FILE_ORIGINALE_BYTES = 25 * 1024 * 1024;

/**
 * Lato massimo della ricodifica: 1800 px. Riduce il payload inviato al modello
 * mantenendo una risoluzione adatta alla lettura delle etichette.
 */
export const LATO_MASSIMO = 1800;
export const LATO_MINIMO = 1200;

export type GruppoEsito =
  | "verificato"
  | "non_documentato"
  | "non_verificato"
  | "incongruenza";

export const ETICHETTE_GRUPPO: Record<
  GruppoEsito,
  { titolo: string; descrizione: string }
> = {
  verificato: {
    titolo: "Denominazione verificata",
    descrizione:
      "La denominazione letta corrisponde a una fonte ufficiale registrata e completa.",
  },
  non_documentato: {
    titolo: "Riscontro parziale",
    descrizione:
      "Sono stati trovati documenti pertinenti, ma non bastano a confermare il prodotto specifico.",
  },
  non_verificato: {
    titolo: "Non verificato",
    descrizione:
      "Il riconoscimento non ha trovato una conferma documentale nel registro ufficiale.",
  },
  incongruenza: {
    titolo: "Possibile incongruenza",
    descrizione:
      "Alcuni dati non coincidono con la fonte ufficiale e vanno controllati; non è una conclusione.",
  },
};

/**
 * Una DOP è riconosciuta solo con una prova ufficiale registrata e una
 * corrispondenza esatta della denominazione. Un risultato informativo o una
 * denominazione affine non basta, e non autentica la singola confezione.
 */
export function denominazioneUfficialmenteRegistrata(
  prove: readonly {
    tipo: string;
    stato: string;
    schemaQualita: string | null;
    relazione: string;
  }[]
): boolean {
  return prove.some(
    (prova) =>
      prova.tipo === "ufficiale" &&
      prova.stato === "registrata" &&
      (prova.schemaQualita === "DOP" ||
        prova.schemaQualita === "IGP" ||
        prova.schemaQualita === "STG") &&
      prova.relazione.startsWith("Corrispondenza esatta")
  );
}

/** Compatibilità per i controlli e i test che chiedono specificamente una DOP. */
export function dopRiconosciuta(
  prove: readonly {
    tipo: string;
    stato: string;
    schemaQualita: string | null;
    relazione: string;
  }[]
): boolean {
  return denominazioneUfficialmenteRegistrata(
    prove.filter((prova) => prova.schemaQualita === "DOP")
  );
}

export function gruppoDaLivello(livello: Livello): GruppoEsito {
  switch (livello) {
    case "verificato":
      return "verificato";
    case "coerente_non_verificato":
      return "non_documentato";
    case "incongruenza_possibile":
      return "incongruenza";
    case "non_verificato":
    default:
      return "non_verificato";
  }
}

export interface FileLocale {
  type: string;
  size: number;
  name?: string;
}

export type EsitoValidazioneFile =
  | { ok: true }
  | { ok: false; messaggio: string };

/** Controlli locali prima di toccare canvas o rete. */
export function validaFileLocale(file: FileLocale | null | undefined): EsitoValidazioneFile {
  if (!file || typeof file.type !== "string" || typeof file.size !== "number") {
    return { ok: false, messaggio: "Nessuna immagine selezionata." };
  }

  const tipo = file.type.trim().toLowerCase();
  if (!(MIME_AMMESSI_UI as readonly string[]).includes(tipo)) {
    return {
      ok: false,
      messaggio: "Formato non supportato. Usa una foto JPEG, PNG o WebP.",
    };
  }

  if (file.size <= 0) {
    return { ok: false, messaggio: "Il file selezionato è vuoto." };
  }

  if (file.size > MAX_FILE_ORIGINALE_BYTES) {
    return {
      ok: false,
      messaggio:
        "La foto è troppo grande per essere preparata (massimo 25 MB). Scegline una più leggera.",
    };
  }

  return { ok: true };
}

/** Ridimensiona mantenendo le proporzioni e senza ingrandire le foto piccole. */
export function calcolaLato(
  larghezza: number,
  altezza: number,
  massimo: number = LATO_MASSIMO
): { larghezza: number; altezza: number } {
  if (
    !Number.isFinite(larghezza) ||
    !Number.isFinite(altezza) ||
    !Number.isFinite(massimo) ||
    larghezza <= 0 ||
    altezza <= 0 ||
    massimo <= 0
  ) {
    return { larghezza: 0, altezza: 0 };
  }

  const rapporto = Math.min(1, massimo / Math.max(larghezza, altezza));
  return {
    larghezza: Math.max(1, Math.round(larghezza * rapporto)),
    altezza: Math.max(1, Math.round(altezza * rapporto)),
  };
}

export function formattaAttesa(secondi: number): string {
  const valore = Math.max(0, Math.round(secondi));
  if (valore <= 0) return "pochi secondi";
  if (valore < 60) return `${valore} second${valore === 1 ? "o" : "i"}`;

  if (valore < 3600) {
    const minuti = Math.ceil(valore / 60);
    return `${minuti} minut${minuti === 1 ? "o" : "i"}`;
  }

  const ore = Math.ceil(valore / 3600);
  return `${ore} or${ore === 1 ? "a" : "e"}`;
}

export interface QuotaApi {
  usatiOggi: number;
  limiteGiorno: number;
  limiteMinuto: number;
}

export interface ErroreApi {
  codice: string;
  messaggio: string;
  /** Codice tecnico diagnostico del server (es. MISSING_KEYS), mai segreti. */
  dettaglio?: string;
  quota?: QuotaApi;
  /** Secondi indicati dal server in `Retry-After`, quando presenti. */
  riprovaSecondi?: number;
}

export interface RispostaAnalisi {
  esito: EsitoAnalisi;
  cache: boolean;
}

function leggiQuota(valore: unknown): QuotaApi | undefined {
  if (!valore || typeof valore !== "object" || Array.isArray(valore)) {
    return undefined;
  }

  const quota = valore as Record<string, unknown>;
  const usatiOggi = quota.usatiOggi;
  const limiteGiorno = quota.limiteGiorno;
  const limiteMinuto = quota.limiteMinuto;

  if (
    typeof usatiOggi !== "number" ||
    typeof limiteGiorno !== "number" ||
    typeof limiteMinuto !== "number" ||
    !Number.isInteger(usatiOggi) ||
    !Number.isInteger(limiteGiorno) ||
    !Number.isInteger(limiteMinuto) ||
    usatiOggi < 0 ||
    limiteGiorno < 0 ||
    limiteMinuto < 0
  ) {
    return undefined;
  }

  return { usatiOggi, limiteGiorno, limiteMinuto };
}

/** Legge un errore pubblico della route senza assumere la forma del body. */
export function estraiErrore(dati: unknown): ErroreApi | null {
  if (!dati || typeof dati !== "object" || Array.isArray(dati)) return null;

  const record = dati as Record<string, unknown>;
  const errore = record.errore;
  if (!errore || typeof errore !== "object" || Array.isArray(errore)) {
    return null;
  }

  const dettaglio = errore as Record<string, unknown>;
  const codice =
    typeof dettaglio.codice === "string" && dettaglio.codice.trim()
      ? dettaglio.codice.trim()
      : "ERRORE_INTERNO";
  const messaggio =
    typeof dettaglio.messaggio === "string" && dettaglio.messaggio.trim()
      ? dettaglio.messaggio.trim()
      : "Errore non specificato.";

  const debugCode =
    typeof dettaglio.dettaglio === "string" && dettaglio.dettaglio.trim()
      ? dettaglio.dettaglio.trim()
      : undefined;

  const quota = leggiQuota(record.quota);
  return {
    codice,
    messaggio,
    ...(debugCode ? { dettaglio: debugCode } : {}),
    ...(quota ? { quota } : {}),
  };
}

/** Verifica minima ma sufficiente a non far crashare la UI su una risposta strana. */
export function estraiRisposta(dati: unknown): RispostaAnalisi {
  if (!dati || typeof dati !== "object" || Array.isArray(dati)) {
    throw new Error("Risposta non valida.");
  }

  const record = dati as Record<string, unknown>;
  if (record.success !== true) {
    throw new Error("Risposta non valida.");
  }

  const esito = record.esito;
  if (!esito || typeof esito !== "object" || Array.isArray(esito)) {
    throw new Error("Esito mancante.");
  }

  const dettaglio = esito as Record<string, unknown>;
  if (
    typeof dettaglio.livello !== "string" ||
    !(LIVELLI as readonly string[]).includes(dettaglio.livello)
  ) {
    throw new Error("Livello non riconosciuto.");
  }

  if (
    !dettaglio.riconoscimento ||
    typeof dettaglio.riconoscimento !== "object" ||
    Array.isArray(dettaglio.riconoscimento)
  ) {
    throw new Error("Riconoscimento mancante.");
  }

  if (
    !dettaglio.verifica ||
    typeof dettaglio.verifica !== "object" ||
    Array.isArray(dettaglio.verifica)
  ) {
    throw new Error("Verifica mancante.");
  }

  return {
    esito: esito as unknown as EsitoAnalisi,
    cache: record.cache === true,
  };
}

/** Messaggi pubblici, senza dettagli interni né segreti. */
export function messaggioErrore(input: {
  stato: number;
  codice: string;
  messaggio?: string;
  riprovaSecondi?: number;
  dettaglio?: string;
}): string {
  const { stato, codice, riprovaSecondi, dettaglio } = input;

  if (stato === 429 || codice === "QUOTA_SUPERATA") {
    return `Hai raggiunto il limite di analisi disponibili.${
      riprovaSecondi && riprovaSecondi > 0
        ? ` Riprova tra ${formattaAttesa(riprovaSecondi)}.`
        : " Riprova più tardi."
    }`;
  }

  if (stato === 413 || codice === "IMMAGINE_TROPPO_GRANDE") {
    return "L'immagine è troppo grande. Scegli una foto più leggera o scatta di nuovo.";
  }

  if (stato === 415 || codice === "FORMATO_NON_SUPPORTATO") {
    return "Formato non supportato. Usa una foto JPEG, PNG o WebP.";
  }

  if (stato === 400 || codice === "RICHIESTA_NON_VALIDA") {
    return "La richiesta non è valida. Scegli di nuovo l'immagine e riprova.";
  }

  if (stato === 401 || codice === "SESSIONE_NON_VALIDA") {
    return "La sessione non è più valida. Ricarica la pagina e riprova.";
  }

  if (stato === 504 || codice === "ANALISI_SCADUTA") {
    return "L'analisi ha impiegato troppo tempo. Riprova con la stessa foto.";
  }

  if (codice === "MODELLO_NON_DISPONIBILE") {
    return "Il modello di riconoscimento non è disponibile in questo momento. Riprova tra poco.";
  }

  if (codice === "CONFIGURAZIONE_NON_DISPONIBILE") {
    return "Il servizio di riconoscimento non è configurato correttamente. Riprova più tardi.";
  }

  if (
    stato >= 500 ||
    codice === "ANALISI_NON_DISPONIBILE" ||
    codice === "ANALISI_NON_RIUSCITA" ||
    codice === "QUOTA_NON_DISPONIBILE" ||
    codice === "SERVIZIO_NON_DISPONIBILE" ||
    codice === "REGISTRO_NON_DISPONIBILE" ||
    codice === "REGISTRAZIONE_NON_DISPONIBILE" ||
    codice === "IDENTIFICAZIONE_NON_DISPONIBILE"
  ) {
    const base = "Il servizio di analisi non è disponibile in questo momento. Riprova tra poco.";
    return dettaglio ? `${base} [${dettaglio}]` : base;
  }

  const messaggio = input.messaggio?.trim();
  return messaggio || "Non è stato possibile completare l'analisi.";
}

export function descriviQuota(quota: QuotaApi | undefined): string {
  if (!quota) return "";
  return `Oggi hai usato ${quota.usatiOggi} analisi su ${quota.limiteGiorno}; il limite è ${quota.limiteMinuto} al minuto.`;
}

// ─── Trasporto progressivo (NDJSON) ───────────────────────────────────────
//
// Ogni riga è un evento autonomo emesso quando il dato è realmente
// disponibile. `preliminare: true` indica un dato non ancora verificato:
// l'interfaccia lo mostra separatamente e non lo usa per dichiarare un esito.

export type EventoProgressivoClient =
  | {
      evento: "riconoscimento";
      preliminare: true;
      riconoscimento: RiconoscimentoAi;
      provider: string;
      modello: string;
      durataMs: number;
    }
  | {
      evento: "documentale";
      preliminare: true;
      ricerca: EsitoRicercaDocumentale;
      durataMs: number;
    }
  | { evento: "web"; preliminare: true; web: RicercaWeb }
  | {
      evento: "esito";
      preliminare: false;
      esito: EsitoAnalisi;
      meta: unknown;
      cache: boolean;
    }
  | { evento: "errore"; errore: ErroreApi; stato: number };

/** Dati parziali già leggibili, distinti dall'esito definitivo. */
export interface StatoProgressivo {
  riconoscimento: RiconoscimentoAi | null;
  documentale: EsitoRicercaDocumentale | null;
  web: RicercaWeb | null;
}

export const STATO_PROGRESSIVO_VUOTO: StatoProgressivo = {
  riconoscimento: null,
  documentale: null,
  web: null,
};

function oggetto(valore: unknown): Record<string, unknown> | null {
  if (!valore || typeof valore !== "object" || Array.isArray(valore)) return null;
  return valore as Record<string, unknown>;
}

/** Valida il minimo indispensabile: una riga strana viene ignorata. */
export function estraiEvento(valore: unknown): EventoProgressivoClient | null {
  const record = oggetto(valore);
  if (!record) return null;

  if (record.evento === "riconoscimento") {
    const riconoscimento = oggetto(record.riconoscimento);
    if (!riconoscimento || typeof riconoscimento.prodotto !== "string") return null;
    return {
      evento: "riconoscimento",
      preliminare: true,
      riconoscimento: riconoscimento as unknown as RiconoscimentoAi,
      provider: typeof record.provider === "string" ? record.provider : "",
      modello: typeof record.modello === "string" ? record.modello : "",
      durataMs: typeof record.durataMs === "number" ? record.durataMs : 0,
    };
  }

  if (record.evento === "documentale") {
    const ricerca = oggetto(record.ricerca);
    if (!ricerca || typeof ricerca.stato !== "string") return null;
    return {
      evento: "documentale",
      preliminare: true,
      ricerca: ricerca as unknown as EsitoRicercaDocumentale,
      durataMs: typeof record.durataMs === "number" ? record.durataMs : 0,
    };
  }

  if (record.evento === "web") {
    const web = oggetto(record.web);
    if (!web || typeof web.stato !== "string") return null;
    return { evento: "web", preliminare: true, web: web as unknown as RicercaWeb };
  }

  if (record.evento === "esito") {
    try {
      const risposta = estraiRisposta({
        success: true,
        esito: record.esito,
        cache: record.cache,
      });
      return {
        evento: "esito",
        preliminare: false,
        esito: risposta.esito,
        meta: record.meta ?? null,
        cache: risposta.cache,
      };
    } catch {
      return null;
    }
  }

  if (record.evento === "errore") {
    const errore = estraiErrore({ errore: record.errore, quota: record.quota });
    return {
      evento: "errore",
      errore: errore ?? { codice: "ERRORE_INTERNO", messaggio: "Errore non specificato." },
      stato: typeof record.stato === "number" ? record.stato : 0,
    };
  }

  return null;
}

/** Legge lo stream riga per riga: nessun evento parziale viene interpretato. */
export async function* leggiEventiProgressivi(
  corpo: ReadableStream<Uint8Array>
): AsyncGenerator<EventoProgressivoClient> {
  const lettore = corpo.getReader();
  const decodifica = new TextDecoder();
  let residuo = "";

  const consuma = (riga: string): EventoProgressivoClient | null => {
    const testo = riga.trim();
    if (!testo) return null;
    try {
      return estraiEvento(JSON.parse(testo) as unknown);
    } catch {
      return null;
    }
  };

  try {
    for (;;) {
      const { done, value } = await lettore.read();
      if (done) break;
      residuo += decodifica.decode(value, { stream: true });
      let taglio = residuo.indexOf("\n");
      while (taglio >= 0) {
        const evento = consuma(residuo.slice(0, taglio));
        residuo = residuo.slice(taglio + 1);
        if (evento) yield evento;
        taglio = residuo.indexOf("\n");
      }
    }
    const ultimo = consuma(residuo);
    if (ultimo) yield ultimo;
  } finally {
    lettore.releaseLock();
  }
}
