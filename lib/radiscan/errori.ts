/**
 * RadiciScan — errori tipizzati.
 *
 * I messaggi non contengono mai chiavi, URL con credenziali o contenuto
 * dell'immagine: il chiamante (route della 2C) mappa il codice su una
 * risposta HTTP, senza esporre dettagli interni.
 */

export const CODICI_ERRORE = {
  INPUT_NON_VALIDO: "RADICSCAN_INPUT_NON_VALIDO",
  SCHEMA_NON_VALIDO: "RADICSCAN_SCHEMA_NON_VALIDO",
  PROVIDER_CONFIGURAZIONE: "RADICSCAN_PROVIDER_CONFIGURAZIONE",
  PROVIDER_QUOTA: "RADICSCAN_PROVIDER_QUOTA",
  PROVIDER_RETE: "RADICSCAN_PROVIDER_RETE",
  PROVIDER_TIMEOUT: "RADICSCAN_PROVIDER_TIMEOUT",
  PROVIDER_RISPOSTA: "RADICSCAN_PROVIDER_RISPOSTA",
  PROVIDER_MODELLO: "RADICSCAN_PROVIDER_MODELLO",
  QUOTA_NON_DISPONIBILE: "RADICSCAN_QUOTA_NON_DISPONIBILE",
  QUOTA_CONFIGURAZIONE: "RADICSCAN_QUOTA_CONFIGURAZIONE",
  SESSIONE_NON_VALIDA: "RADICSCAN_SESSIONE_NON_VALIDA",
  IMMAGINE_TROPPO_GRANDE: "RADICSCAN_IMMAGINE_TROPPO_GRANDE",
  MIME_NON_SUPPORTATO: "RADICSCAN_MIME_NON_SUPPORTATO",
} as const;

export type CodiceErrore = (typeof CODICI_ERRORE)[keyof typeof CODICI_ERRORE];

export class ErroreRadiciScan extends Error {
  readonly codice: CodiceErrore;

  constructor(codice: CodiceErrore, messaggio: string) {
    super(messaggio);
    this.name = "ErroreRadiciScan";
    this.codice = codice;
  }
}

export function erroreInput(messaggio: string): ErroreRadiciScan {
  return new ErroreRadiciScan(CODICI_ERRORE.INPUT_NON_VALIDO, messaggio);
}

export function erroreSchema(messaggio: string): ErroreRadiciScan {
  return new ErroreRadiciScan(CODICI_ERRORE.SCHEMA_NON_VALIDO, messaggio);
}

export function erroreQuotaNonDisponibile(): ErroreRadiciScan {
  return new ErroreRadiciScan(
    CODICI_ERRORE.QUOTA_NON_DISPONIBILE,
    "Quota non disponibile: analisi non eseguibile in questo momento."
  );
}
