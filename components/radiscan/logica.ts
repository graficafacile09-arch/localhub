import { LIVELLI, type EsitoAnalisi, type Livello } from "@/lib/radiscan/tipi";

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

/**
 * DE.CO. è un riconoscimento comunale, distinto dagli schemi UE DOP/IGP/STG.
 * Si considera riscontrato solo con una fonte ufficiale e corrispondenza esatta.
 */
export function decoRiconosciuta(
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
      prova.schemaQualita === "DECO" &&
      prova.relazione.startsWith("Corrispondenza esatta")
  );
}

/**
 * La Cipolla Bianca di Castrovillari è documentata come DE.CO. da ARSAC,
 * non come DOP. Questo blocco impedisce che risultati web generici o prove
 * associate in modo errato la promuovano a denominazione UE.
 */
export function èCipollaBiancaCastrovillari(...campi: Array<string | null | undefined>): boolean {
  const testo = campi
    .filter((campo): campo is string => typeof campo === "string")
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /\bcipolla bianca (?:di )?castrovillari\b/.test(testo);
}
/** Rileva la sigla DE.CO. in campi estratti, senza attribuirle valore certificativo. */
export function decoRilevata(
  schemaProposto: string | null,
  indicatori: readonly string[] = [],
  certificazioni: readonly string[] = []
): boolean {
  if (schemaProposto?.toUpperCase() === "DECO") return true;
  return [...indicatori, ...certificazioni].some((valore) =>
    /\bde\s*\.?\s*co\.?\b/i.test(valore)
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

  const quota = leggiQuota(record.quota);
  return { codice, messaggio, ...(quota ? { quota } : {}) };
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
}): string {
  const { stato, codice, riprovaSecondi } = input;

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
    return "Il servizio di analisi non è disponibile in questo momento. Riprova tra poco.";
  }

  const messaggio = input.messaggio?.trim();
  return messaggio || "Non è stato possibile completare l'analisi.";
}

export function descriviQuota(quota: QuotaApi | undefined): string {
  if (!quota) return "";
  return `Oggi hai usato ${quota.usatiOggi} analisi su ${quota.limiteGiorno}; il limite è ${quota.limiteMinuto} al minuto.`;
}
