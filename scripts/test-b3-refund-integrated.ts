/**
 * FASE 10 — BLOCCO 3 — STEP 5
 * Verifica integrata read-only del flusso Stripe charge.refunded.
 *
 * Il test non contatta Stripe, non usa il database remoto e non applica
 * migration. Verifica staticamente che STEP 3 e STEP 4 condividano i binding,
 * gli stessi identificatori e gli stessi invarianti economici.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const webhook = readFileSync(join(root, "lib/pagamenti/webhook-stripe.ts"), "utf8");
const stripe = readFileSync(join(root, "lib/pagamenti/stripe.ts"), "utf8");
const lifecycle = readFileSync(join(root, "supabase/migrations/20261012_webhook_event_lifecycle_retry_hardening.sql"), "utf8");
const operations = readFileSync(join(root, "supabase/migrations/20260925_refund_operations.sql"), "utf8");
const atomic = readFileSync(join(root, "supabase/migrations/20260927_webhook_refund_atomic.sql"), "utf8");
const operationFinalizer = readFileSync(join(root, "supabase/migrations/20260928_webhook_refund_operations.sql"), "utf8");
const hardening = readFileSync(join(root, "supabase/migrations/20261013_refund_operations_hardening.sql"), "utf8");
const step3Test = readFileSync(join(root, "scripts/test-b3-charge-refunded.ts"), "utf8");
const step4Test = readFileSync(join(root, "scripts/test-b3-refund-operations.ts"), "utf8");

let passati = 0;
let falliti = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    passati++;
    console.log(`  PASS ${label}`);
  } else {
    falliti++;
    console.log(`  FAIL ${label}`);
  }
}

console.log("\n=== STEP 5 — Verifica integrata Stripe refund ===\n");

// A. Event lifecycle.
check("1. event_id entra nel lifecycle di acquisizione", webhook.includes("pagamenti_evento_acquisisci") && webhook.includes("p_event_id: e.eventId"));
check("2. duplicate processed è no-op", webhook.includes("DUPLICATE_PROCESSED") && webhook.includes("Evento già processato"));
check("3. retryable/error resta retryable", lifecycle.includes("received/error: retryable") && lifecycle.includes("RETRYABLE_EXISTING"));
check("4. processing live non viene eseguito in parallelo", webhook.includes("Evento in elaborazione; Stripe ritenterà.") && lifecycle.includes("IN_PROGRESS"));
check("5. processed arriva solo dopo il business handler", webhook.includes("segnaProcessato(evento.id, true, acquisizione.attempts)") && webhook.includes("finalizzazione.esito !== \"PROCESSED\""));
check("6. errore business finalizza error e risponde 503", webhook.includes("segnaProcessato(evento.id, false, acquisizione.attempts, msg)") && webhook.includes("Elaborazione evento fallita; Stripe ritenterà."));
check("7. tentativo stale non può finalizzare", lifecycle.includes("ATTEMPT_NOT_CURRENT") && lifecycle.includes("p_attempt"));

// B. Account and merchant binding.
check("8. event.account è obbligatorio", webhook.includes("charge.refunded senza event.account"));
check("9. event.account risolve il negozio Connect", webhook.includes("getNegozioIdByStripeAccount(account)"));
check("10. account Connect è ricontrollato prima del refund", webhook.includes("accountConfigurato.accountId !== eventAccount"));
check("11. merchant mismatch è fail-closed", webhook.includes("connected account non associato al negozio") && hardening.includes("REFUND_BINDING_MISMATCH"));
check("12. nessun fallback verso un altro ordine", webhook.includes("ordini.length !== 1") && webhook.includes("ordine non associato in modo univoco"));
check("13. provider locale deve essere Stripe", atomic.includes("v_ordine.payment_provider <> 'stripe'") && hardening.includes("v_ordine.payment_provider <> 'stripe'"));

// C. Charge, PaymentIntent, order.
check("14. Charge ID è richiesto", webhook.includes("senza PaymentIntent o Charge ID") && step3Test.includes("Charge ID richiesto"));
check("15. PaymentIntent ID è distinto dal Charge ID", webhook.includes("idPagamentoDaValore(chargeOriginale.payment_intent)") && webhook.includes("Charge ID e PaymentIntent non sono intercambiabili"));
check("16. ordine risolto tramite PaymentIntent", webhook.includes("eq(\"payment_transaction_id\", transactionId)"));
check("17. PaymentIntent RPC deve coincidere con l'ordine", atomic.includes("REFUND_PAYMENTINTENT_MISMATCH") && hardening.includes("REFUND_PAYMENTINTENT_MISMATCH"));
check("18. session/order binding non usa un ordine casuale", atomic.includes("REFUND_SESSION_AMBIGUA") && atomic.includes("v_sessioni_count <> 1"));
check("19. Charge lookup server-side è disponibile", webhook.includes("arricchisciChargeStripe") && stripe.includes("refundsDaCharge"));

// D. Refund identity and matching.
check("20. refund_id reale viene estratto dal Refund", webhook.includes("match.refundId") && webhook.includes("refundIds.push(refundId)"));
check("21. refund_id è distinto da Charge e PaymentIntent", webhook.includes("refundId === chargeId || refundId === paymentIntentId"));
check("22. refund_id duplicato viene rifiutato", webhook.includes("refundIds.includes(refundId)"));
check("23. duplicate refund locale è no-op", operationFinalizer.includes("'duplicate', true") && webhook.includes("kind: \"duplicate\""));
check("24. Refund non espanso usa lookup verificato", webhook.includes("refund object non espanso") && webhook.includes("await arricchisciChargeStripe"));
check("25. metadata operation non è sufficiente da solo", webhook.includes("metadataBound") && webhook.includes("operationMatch") && operationFinalizer.includes("REFUND_ID_MISMATCH"));
check("26. refund appartenente a un altro PaymentIntent è rifiutato", webhook.includes("Refund non associato al Charge/PaymentIntent") && webhook.includes("Refund con PaymentIntent diverso"));

// E. Amounts, currency and state transitions.
check("27. importi Stripe sono validati in minor units", webhook.includes("stripeMinorUnits") && webhook.includes("amountRefundedMinor"));
check("28. partial/full sono distinti", webhook.includes('refundType: amountRefundedMinor === amountPaidMinor ? "full" : "partial"'));
check("29. over-refund è rifiutato", atomic.includes("p_amount_refunded > v_pagato") && hardening.includes("p_refund_amount > v_ordine.payment_amount"));
check("30. cumulative mismatch è rifiutato", webhook.includes("refundSumMinor !== amountRefundedMinor") && hardening.includes("REFUND_AMOUNT_INVALID"));
check("31. accounting locale è monotono", atomic.includes("p_amount_refunded <= v_rimborsato") && atomic.includes("cumulative_amount_non_crescente"));
check("32. full non regredisce a partial", atomic.includes("A refunded order must never regress") && atomic.includes("v_ordine.payment_status = 'refunded'"));
check("33. stale cumulative non completa operation non rappresentata", hardening.includes("REFUND_CUMULATIVE_STALE") && hardening.includes("operation non finalizzata"));
check("34. currency mismatch è fail-closed", webhook.includes("Valuta refund non coerente") && hardening.includes("REFUND_CURRENCY_MISMATCH"));

// F. Operation identity, retry and lease.
check("35. operation durevole usa idempotency_key", operations.includes("idempotency_key") && operations.includes("text not null unique"));
check("36. stesso importo attivo sullo stesso ordine converge", operations.includes("ordine_importo_attivo_unq") && operations.includes("stessa operation già attiva"));
check("37. retry failed/reconciliation è consentito", hardening.includes("'pending', 'processing', 'failed', 'reconciliation_required'") && operations.includes("pagamenti_rimborso_operazione_fallita"));
check("38. lease scaduto può essere recuperato senza refund cieco", operations.includes("lease scaduto") && operations.includes("reconciliation_required"));
check("39. attempts vengono incrementati nel claim", operations.includes("attempts = attempts + 1") && operations.includes("for update"));
check("40. operation succeeded non esegue di nuovo accounting", hardening.includes("v_operazione.stato = 'succeeded'") && hardening.includes("'duplicate', true"));
check("41. operation di un altro ordine è rifiutata", hardening.includes("REFUND_OPERATION_BINDING_MISMATCH"));
check("42. Refund ID non può essere trasferito tra operation", hardening.includes("REFUND_ID_CONFLICT") && hardening.includes("refund_id = btrim(p_refund_id)"));

// G. Atomicity and failure behavior.
check("43. ordine viene lockato prima dell'operation", hardening.indexOf("from public.ordini") < hardening.indexOf("from public.pagamenti_rimborso_operazioni"));
check("44. operation finalizer usa la RPC cumulativa atomica", hardening.includes("pagamenti_webhook_rimborso_finalizza("));
check("45. UPDATE operation è confermato", hardening.includes("returning id into v_updated_id") && hardening.includes("OPERATION_FINALIZE_NOT_CONFIRMED"));
check("46. RPC failure non produce falso succeeded", webhook.includes("finalizzazione refund operation rifiutata") && hardening.includes("'ok', false"));
check("47. ordine non viene modificato su binding ambiguo", webhook.includes("match.kind === \"ambiguous\" || match.kind === \"invalid\"") && webhook.includes("throw new Error"));
check("48. stato consegna/preparazione non viene modificato", !hardening.includes("update public.ordini\n  set stato =") && !atomic.includes("update public.ordini\n  set stato =") && !webhook.includes("update({ stato:"));
check("49. accounting e operation sono nella stessa transazione RPC", operationFinalizer.includes("3C owns cumulative accounting") && operationFinalizer.includes("update public.pagamenti_rimborso_operazioni"));
check("50. finalizzazione evento avviene solo dopo successo refund", webhook.includes("const finalizzazione = await segnaProcessato(evento.id, true") && webhook.includes("finalizzazione refund operation rifiutata"));

// H. Migration safety and regression coverage.
check("51. lifecycle migration è additive/idempotente", lifecycle.includes("Additive/idempotent") && !lifecycle.includes("drop table") && !lifecycle.includes("drop column"));
check("52. refund migration è additive/idempotente", hardening.includes("Additive, idempotent") && !hardening.includes("drop table") && !hardening.includes("drop column"));
check("53. migration non modifica dati esistenti automaticamente", hardening.includes("No tables or data are changed here") && !hardening.match(/\bdelete\s+from\b/i));
check("54. test STEP 3 e STEP 4 restano inclusi", step3Test.includes("STEP 3 CHARGE REFUNDED") && step4Test.includes("STEP 4 REFUND OPERATIONS"));
check("55. nessun percorso refund Stripe alternativo nel webhook", webhook.includes("case \"charge.refunded\":") && webhook.split("case \"charge.refunded\":").length === 2);

console.log(`\nSTEP 5 REFUND INTEGRATED: ${passati} PASS / ${falliti} FAIL`);
process.exit(falliti === 0 ? 0 : 1);
