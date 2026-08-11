/**
 * TEST MACCHINA A STATI PAGAMENTI — PURA, nessuna chiamata esterna.
 *
 * Verifica lib/pagamenti/stati.ts:
 *   - transizioni consentite (pending→authorized, authorized→paid, ...);
 *   - transizioni vietate (paid→pending, refunded→paid, ...);
 *   - idempotenza (stesso stato = no-op);
 *   - isFinalPaymentStatus / isPaymentPagato.
 *
 * Esecuzione: npx tsx scripts/test-pagamenti-stati.ts
 */

import {
  canTransitionPayment,
  transitionPayment,
  isFinalPaymentStatus,
  isPaymentPagato,
  isPaymentStatus,
} from "../lib/pagamenti/stati";
import type { PaymentStatus } from "../lib/pagamenti/types";

let passati = 0;
let falliti = 0;
const fallitiNomi: string[] = [];

function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  PASS ${nome}`);
  } else {
    falliti++;
    fallitiNomi.push(nome);
    console.log(`  FAIL ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

console.log("\n[T1] Transizioni CONSENTITE (canTransitionPayment = true)");
{
  const casi: Array<[PaymentStatus, PaymentStatus]> = [
    ["pending", "authorized"],
    ["pending", "paid"],
    ["pending", "failed"],
    ["pending", "expired"],
    ["pending", "canceled"],
    ["authorized", "paid"],
    ["authorized", "failed"],
    ["authorized", "canceled"],
    ["paid", "refunded"],
    ["paid", "partially_refunded"],
    ["partially_refunded", "refunded"],
    ["partially_refunded", "partially_refunded"],
  ];
  for (const [da, a] of casi) {
    check(`canTransition ${da} → ${a}`, canTransitionPayment(da, a) === true);
  }
}

console.log("\n[T2] Transizioni VIETATE (canTransitionPayment = false)");
{
  const casi: Array<[PaymentStatus, PaymentStatus]> = [
    ["paid", "pending"],
    ["refunded", "paid"],
    ["failed", "paid"],
    ["expired", "paid"],
    ["canceled", "authorized"],
    ["pending", "refunded"],
    ["paid", "failed"],
    ["authorized", "expired"],
    ["refunded", "partially_refunded"],
  ];
  for (const [da, a] of casi) {
    check(`canTransition ${da} → ${a} = false`, canTransitionPayment(da, a) === false);
  }
}

console.log("\n[T3] transitionPayment — transizioni consentite (ok, cambiato=true)");
{
  const esito = transitionPayment("pending", "authorized");
  check("pending → authorized ok", esito.ok === true && esito.cambiato === true);
  check("stato risultante", esito.ok === true && esito.stato === "authorized");

  const esito2 = transitionPayment("authorized", "paid");
  check("authorized → paid ok", esito2.ok === true && esito2.stato === "paid");
}

console.log("\n[T4] transitionPayment — pending → paid direttamente = OK");
{
  const esito = transitionPayment("pending", "paid");
  check("pending → paid ok", esito.ok === true && esito.stato === "paid");
}

console.log("\n[T5] transitionPayment — rimborsi");
{
  const r1 = transitionPayment("paid", "refunded");
  check("paid → refunded ok", r1.ok === true && r1.stato === "refunded");

  const r2 = transitionPayment("paid", "partially_refunded");
  check("paid → partially_refunded ok", r2.ok === true && r2.stato === "partially_refunded");

  const r3 = transitionPayment("partially_refunded", "refunded");
  check("partially_refunded → refunded ok", r3.ok === true && r3.stato === "refunded");
}

console.log("\n[T6] transitionPayment — pending → expired / canceled");
{
  const e = transitionPayment("pending", "expired");
  check("pending → expired ok", e.ok === true && e.stato === "expired");

  const c = transitionPayment("pending", "canceled");
  check("pending → canceled ok", c.ok === true && c.stato === "canceled");
}

console.log("\n[T7] transitionPayment — transizioni VIETATE (ok=false, errore, mai throw)");
{
  const casi: Array<[PaymentStatus, PaymentStatus]> = [
    ["paid", "pending"],
    ["refunded", "paid"],
    ["failed", "paid"],
    ["expired", "paid"],
    ["canceled", "paid"],
  ];
  for (const [da, a] of casi) {
    let esito = null;
    let lanciato = false;
    try {
      esito = transitionPayment(da, a);
    } catch {
      lanciato = true;
    }
    check(
      `${da} → ${a} = { ok: false } senza throw`,
      !lanciato && esito !== null && esito.ok === false && typeof esito.errore === "string"
    );
  }
}

console.log("\n[T8] Idempotenza — stesso stato = no-op (cambiato=false)");
{
  for (const stato of ["pending", "authorized", "paid", "failed", "expired", "canceled", "refunded", "partially_refunded"] as PaymentStatus[]) {
    const esito = transitionPayment(stato, stato);
    check(
      `${stato} → ${stato} idempotente (cambiato=false)`,
      esito.ok === true && esito.cambiato === false && esito.stato === stato
    );
  }
}

console.log("\n[T9] isFinalPaymentStatus");
{
  for (const stato of ["refunded", "failed", "expired", "canceled"] as PaymentStatus[]) {
    check(`${stato} è finale`, isFinalPaymentStatus(stato) === true);
  }
  for (const stato of ["pending", "authorized", "paid", "partially_refunded"] as PaymentStatus[]) {
    check(`${stato} NON è finale`, isFinalPaymentStatus(stato) === false);
  }
}

console.log("\n[T10] isPaymentPagato / isPaymentStatus");
{
  check("paid → pagato", isPaymentPagato("paid") === true);
  check("pending → non pagato", isPaymentPagato("pending") === false);
  check("isPaymentStatus('paid')", isPaymentStatus("paid") === true);
  check("isPaymentStatus('boh')", isPaymentStatus("boh") === false);
  check("isPaymentStatus(null)", isPaymentStatus(null) === false);
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(`STATI PAGAMENTO TEST: ${passati} passati, ${falliti} falliti`);
if (falliti > 0) {
  console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
  process.exit(1);
}
console.log("TUTTI I TEST PASSATI ✓");
