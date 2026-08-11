/**
 * PAGAMENTI — MACCHINA A STATI (PURA, Fase 1 Foundation).
 *
 * Specchia ESATTAMENTE le transizioni che verranno implementate nella RPC
 * `aggiorna_payment_status` (fase successiva): nessuna logica duplicata di
 * fatto, ma una proiezione TS usata da UI, orchestrazione e test. Le
 * transizioni verranno SEMPRE validate di nuovo lato DB.
 *
 * Stati:
 *   pending → authorized → paid → refunded
 *   pending → paid (cattura immediata, es. Scalapay/Stripe)
 *   pending → failed | expired | canceled
 *   authorized → paid | failed | canceled
 *   paid → refunded | partially_refunded
 *   partially_refunded → refunded | partially_refunded
 *
 * Regole:
 *   - stato identico → no-op idempotente (sempre consentito);
 *   - stati finali: paid NON è finale (può essere rimborsato);
 *     refunded, failed, expired, canceled sono terminali.
 */

import type { PaymentStatus } from "./types";

/** Transizioni consentite (coppie da → a, escluso l'identità). */
export const TRANSIZIONI_PAGAMENTO: ReadonlyArray<{
  da: PaymentStatus;
  a: PaymentStatus;
}> = [
  { da: "pending", a: "authorized" },
  { da: "pending", a: "paid" },
  { da: "pending", a: "failed" },
  { da: "pending", a: "expired" },
  { da: "pending", a: "canceled" },
  { da: "authorized", a: "paid" },
  { da: "authorized", a: "failed" },
  { da: "authorized", a: "canceled" },
  { da: "paid", a: "refunded" },
  { da: "paid", a: "partially_refunded" },
  { da: "partially_refunded", a: "refunded" },
  // NOTA: lo stato identico (es. partially_refunded → partially_refunded)
  // non è in lista perché è già la regola di idempotenza in
  // canTransitionPayment / transitionPayment (da === a → no-op).
];

/** True se il valore è uno stato di pagamento valido. */
export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    typeof value === "string" &&
    ([
      "pending",
      "authorized",
      "paid",
      "failed",
      "expired",
      "canceled",
      "refunded",
      "partially_refunded",
    ] as const).includes(value as PaymentStatus)
  );
}

/**
 * True se la transizione da → a è consentita.
 * Lo stato identico è SEMPRE consentito (no-op idempotente, come la RPC).
 */
export function canTransitionPayment(da: PaymentStatus, a: PaymentStatus): boolean {
  if (da === a) return true;
  return TRANSIZIONI_PAGAMENTO.some((t) => t.da === da && t.a === a);
}

/** Esito della transizione (stile RPC: mai throw per business rules). */
export type EsitoTransitionPayment =
  | { ok: true; stato: PaymentStatus; cambiato: boolean }
  | { ok: false; errore: string };

/**
 * Applica la transizione da → a.
 * - stato identico → { ok: true, cambiato: false } (idempotente);
 * - transizione valida → { ok: true, cambiato: true, stato: a };
 * - transizione NON consentita → { ok: false, errore } (mai throw).
 * Specchiabile direttamente in una RPC PostgreSQL.
 */
export function transitionPayment(da: PaymentStatus, a: PaymentStatus): EsitoTransitionPayment {
  if (da === a) {
    return { ok: true, stato: da, cambiato: false };
  }
  if (canTransitionPayment(da, a)) {
    return { ok: true, stato: a, cambiato: true };
  }
  return {
    ok: false,
    errore: `Transizione di stato pagamento non consentita: ${da} → ${a}.`,
  };
}

/**
 * True se lo stato è terminale (nessuna transizione in uscita):
 * refunded, failed, expired, canceled. NOTA: paid NON è finale (può
 * diventare refunded/partially_refunded); partially_refunded non è finale
 * (può diventare refunded).
 */
export function isFinalPaymentStatus(stato: PaymentStatus): boolean {
  return (
    stato === "refunded" ||
    stato === "failed" ||
    stato === "expired" ||
    stato === "canceled"
  );
}

/** Stati visibili come "pagamento concluso positivamente". */
export function isPaymentPagato(stato: PaymentStatus): boolean {
  return stato === "paid";
}
