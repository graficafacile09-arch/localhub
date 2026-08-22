/**
 * PAGAMENTI — CRYPTO SERVICE (Fase 2).
 *
 * Centralizza per il SERVER (Node) la gestione della chiave di cifratura,
 * la cifratura/decifratura dei secret dei negozi e la validazione della
 * configurazione (allowlist provider/metodi).
 *
 * Sicurezza:
 *   - la chiave arriva ESCLUSIVAMENTE da process.env.PAYMENTS_ENCRYPTION_KEY
 *     (mai nel DB, mai nel codice, mai al client);
 *   - cifratura AES-256-GCM (chiave derivata via SHA-256 della passphrase);
 *   - i secret NON vengono MAI restituiti dalle API (write-only);
 *   - i secret NON compaiono MAI nei log (mascheraSegreto).
 *
 * NOTA: la cifratura dei secret salvati nel DB avviene nelle RPC PostgreSQL
 * (pgp_sym_encrypt, migration 20260819) con la STESSA chiave. Questo modulo
 * serve per: test, cifratura/decifratura lato server quando necessaria e
 * validazione configurazione. La chiave è unica: PAYMENTS_ENCRYPTION_KEY.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Nome della variabile d'ambiente con la chiave di cifratura. */
export const PAYMENTS_ENCRYPTION_KEY_ENV = "PAYMENTS_ENCRYPTION_KEY";

/** Provider configurabili da un negozio (tabella negozio_pagamenti). */
export const PROVIDER_PAGAMENTO_VALIDI = [
  "klarna",
  "scalapay",
  "paypal",
  "stripe",
  "bonifico",
] as const;

/** Metodi mostrabili al checkout (tabella negozio_metodi_pagamento). */
export const METODI_PAGAMENTO_VALIDI = [
  "carta",
  "paypal",
  "klarna",
  "scalapay",
  "bonifico",
] as const;

export type ProviderPagamentoValido = (typeof PROVIDER_PAGAMENTO_VALIDI)[number];
export type MetodoPagamentoValido = (typeof METODI_PAGAMENTO_VALIDI)[number];

/**
 * Legge la chiave di cifratura dall'ambiente.
 * Lancia se manca: il salvataggio di secret NON deve mai avvenire con una
 * chiave assente (fail-closed). Mai loggata.
 */
export function getPaymentsEncryptionKey(): string {
  const key = process.env[PAYMENTS_ENCRYPTION_KEY_ENV];
  if (!key || key.trim().length === 0) {
    throw new Error("PAYMENTS_ENCRYPTION_KEY non configurata");
  }
  return key.trim();
}

/** Deriva una chiave AES-256 (32 byte) dalla passphrase. */
export function derivaChiaveAes(passphrase: string): Buffer {
  return createHash("sha256").update(passphrase, "utf8").digest();
}

/**
 * Cifra un secret con AES-256-GCM.
 * Formato: "v1:ivB64:tagB64:dataB64" (IV 12 byte casuale per messaggio).
 * `passphrase` di default = chiave da env (getPaymentsEncryptionKey).
 */
export function cifraSegreto(plaintext: string, passphrase?: string): string {
  const pass = passphrase ?? getPaymentsEncryptionKey();
  if (!pass || pass.length === 0) {
    throw new Error("PAYMENTS_ENCRYPTION_KEY non configurata");
  }
  const key = derivaChiaveAes(pass);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

/**
 * Decifra un secret cifrato con cifraSegreto.
 * Chiave/passphrase errata → lancia (autenticazione GCM fallita, fail-closed).
 * Payload malformato → lancia.
 */
export function decifraSegreto(payload: string, passphrase?: string): string {
  const pass = passphrase ?? getPaymentsEncryptionKey();
  if (!pass || pass.length === 0) {
    throw new Error("PAYMENTS_ENCRYPTION_KEY non configurata");
  }
  const parts = String(payload ?? "").split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Payload cifrato non valido");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");
  const key = derivaChiaveAes(pass);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * True se la stringa è un secret cifrato valido (formato v1). Non decifra:
 * usata per distinguere "configurato" da un eventuale valore non cifrato.
 */
export function isSegretoCifrato(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value);
}

/** Maschera un valore nei log: mai il secret in chiaro. */
export function mascheraSegreto(value: string | null | undefined): string {
  if (!value) return "(non configurato)";
  return value.length > 6 ? `${value.slice(0, 2)}***` : "***";
}

// ── Validazione configurazione (allowlist rigorosa) ──────────────────────────

export function isProviderPagamentoValido(value: unknown): value is ProviderPagamentoValido {
  return (
    typeof value === "string" &&
    (PROVIDER_PAGAMENTO_VALIDI as readonly string[]).includes(value)
  );
}

export function isMetodoPagamentoValido(value: unknown): value is MetodoPagamentoValido {
  return (
    typeof value === "string" &&
    (METODI_PAGAMENTO_VALIDI as readonly string[]).includes(value)
  );
}

/** Campi pubblici di una riga negozio_pagamenti (MAI i secret). */
export type CredenzialiPubbliche = {
  provider: string;
  attivo: boolean;
  test_mode: boolean;
  client_id: string | null;
  payee_email: string | null;
  iban: string | null;
  has_secret: boolean;
  /** Account collegato (Stripe Connect: stripe_user_id `acct_…`). Non sensibile. */
  account_id: string | null;
  /** Nome business dell'account collegato (solo per la UI). Non sensibile. */
  account_name: string | null;
  /** Stato onboarding Connect Express (not_started/pending/complete/restricted). */
  onboarding_status: string | null;
  /** True se Stripe ha abilitato i payout sul connected account. */
  payouts_enabled: boolean;
  /** True se Stripe ha abilitato l'incasso (charges) sul connected account. */
  charges_enabled: boolean;
};

/**
 * Estrae SOLO i dati pubblici/configurativi da una riga negozio_pagamenti.
 * Le chiavi secret_encrypted / webhook_secret_encrypted NON compaiono MAI.
 */
export function credenzialiPubbliche(
  riga: Record<string, unknown> | null | undefined
): CredenzialiPubbliche | null {
  if (!riga) return null;
  return {
    provider: String(riga.provider ?? ""),
    attivo: riga.attivo === true,
    test_mode: riga.test_mode !== false,
    client_id: riga.client_id ? String(riga.client_id) : null,
    payee_email: riga.payee_email ? String(riga.payee_email) : null,
    iban: riga.iban ? String(riga.iban) : null,
    account_id: riga.account_id ? String(riga.account_id) : null,
    account_name: riga.account_name ? String(riga.account_name) : null,
    onboarding_status: riga.onboarding_status ? String(riga.onboarding_status) : null,
    payouts_enabled: riga.payouts_enabled === true,
    charges_enabled: riga.charges_enabled === true,
    // La RPC (pagamenti_credenziali_leggi) è la fonte autorevole per
    // has_secret: calcola il flag sui secret cifrati nel DB senza MAI
    // restituirli (write-only). Se il flag è presente nel payload lo
    // rispettiamo; il calcolo diretto sui campi secret_encrypted resta
    // solo come fallback per payload legacy che non lo espongono.
    has_secret: riga.has_secret !== undefined
      ? riga.has_secret === true
      : Boolean(
          (typeof riga.secret_encrypted === "string" && riga.secret_encrypted.length > 0) ||
          (typeof riga.webhook_secret_encrypted === "string" && riga.webhook_secret_encrypted.length > 0)
        ),
  };
}
