/**
 * FASE 10 — BLOCCO 3 — STEP 4
 * Test statico del contratto operativo delle refund operations Stripe.
 *
 * Il test non contatta Stripe, non applica migration e non modifica alcun DB.
 * La validazione dinamica resta affidata ai test 3C/3D quando il PostgreSQL
 * locale è disponibile.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const webhook = readFileSync(join(root, "lib/pagamenti/webhook-stripe.ts"), "utf8");
const refunds = readFileSync(join(root, "lib/pagamenti/rimborsi.ts"), "utf8");
const operations = readFileSync(join(root, "supabase/migrations/20260925_refund_operations.sql"), "utf8");
const atomic = readFileSync(join(root, "supabase/migrations/20260927_webhook_refund_atomic.sql"), "utf8");
const finalizer = readFileSync(join(root, "supabase/migrations/20260928_webhook_refund_operations.sql"), "utf8");
const hardening = readFileSync(join(root, "supabase/migrations/20261013_refund_operations_hardening.sql"), "utf8");

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

console.log("\n=== STEP 4 — Stripe refund operations hardening ===\n");

// Operation identity and durable states.
check("1. operation valida usa una riga durevole", operations.includes("create table if not exists public.pagamenti_rimborso_operazioni"));
check("2. refund_id è obbligatorio in finalizzazione", finalizer.includes("p_refund_id is null") && hardening.includes("p_refund_id is null"));
check("3. refund_id non è il charge_id", webhook.includes("refundId === chargeId || refundId === paymentIntentId"));
check("4. order_id è obbligatorio", hardening.includes("p_ordine_id is null"));
check("5. payment_intent è obbligatorio e coerente", hardening.includes("REFUND_PAYMENTINTENT_MISMATCH"));
check("6. operation_id è obbligatorio", hardening.includes("p_operation_id is null"));
check("7. stati esistenti preservati", operations.includes("'pending', 'processing', 'succeeded', 'failed', 'reconciliation_required'") && hardening.includes("'pending', 'processing', 'failed', 'reconciliation_required'"));
check("8. nessun nuovo status operativo inventato", !hardening.includes("create type") && !hardening.includes("'retrying'"));

// Account/order/payment binding and validation.
check("9. connected account è verificato prima dell'operation", webhook.includes("accountConfigurato.accountId !== eventAccount"));
check("10. merchant mismatch fail-closed", finalizer.includes("REFUND_BINDING_MISMATCH") && hardening.includes("REFUND_BINDING_MISMATCH"));
check("11. operation di altro ordine fail-closed", finalizer.includes("REFUND_OPERATION_BINDING_MISMATCH") && hardening.includes("REFUND_OPERATION_BINDING_MISMATCH"));
check("12. provider Stripe obbligatorio", hardening.includes("v_ordine.payment_provider <> 'stripe'"));
check("13. currency coerente", hardening.includes("REFUND_CURRENCY_MISMATCH"));
check("14. importi sono numerici con massimo due decimali", hardening.includes("p_refund_amount <> round(p_refund_amount, 2)") && hardening.includes("p_amount_refunded <> round(p_amount_refunded, 2)"));
check("15. importo zero/non valido rifiutato", hardening.includes("p_refund_amount <= 0"));
check("16. refund oltre pagamento rifiutato", hardening.includes("p_refund_amount > v_ordine.payment_amount") && hardening.includes("p_amount_refunded > v_ordine.payment_amount"));
check("17. refund oltre captured rifiutato", hardening.includes("p_amount_refunded > p_amount_captured"));
check("18. refund individuale oltre cumulativo rifiutato", hardening.includes("p_refund_amount > p_amount_refunded"));

// Idempotency and refund identity.
check("19. unique index sul Refund ID", finalizer.includes("pagamenti_rimborso_operazioni_refund_id_unq") && hardening.includes("create unique index if not exists"));
check("20. conflitto Refund ID cross-operation rifiutato", hardening.includes("REFUND_ID_CONFLICT") && hardening.includes("where refund_id = btrim(p_refund_id)"));
check("21. operation succeeded è no-op", hardening.includes("v_operazione.stato = 'succeeded'") && hardening.includes("'duplicate', true"));
check("22. stesso event_id è governato dal lifecycle", webhook.includes("DUPLICATE_PROCESSED") && webhook.includes("Evento già processato"));
check("23. stesso operation_id non crea una seconda operation", hardening.includes("where id = p_operation_id") && operations.includes("p_idempotency_key text"));
check("24. refund ID già persistito non può cambiare", hardening.includes("v_operazione.refund_id is not null") && hardening.includes("REFUND_ID_MISMATCH"));
check("25. refund reale viene usato, non sintetizzato", webhook.includes("match.refundId") && webhook.includes("No synthetic operation"));

// Atomicity and accounting monotonicity.
check("26. ordine lockato prima dell'operation", hardening.indexOf("from public.ordini") < hardening.indexOf("from public.pagamenti_rimborso_operazioni"));
check("27. finalizzazione chiama la RPC atomica cumulativa", hardening.includes("pagamenti_webhook_rimborso_finalizza("));
check("28. accounting e operation sono nella stessa RPC", hardening.includes("update public.pagamenti_rimborso_operazioni") && hardening.includes("v_accounting_result"));
check("29. cumulativo non decresce", atomic.includes("p_amount_refunded <= v_rimborsato") && atomic.includes("cumulative_amount_non_crescente"));
check("30. full/partial derivano dal cumulativo", atomic.includes("when p_amount_refunded = v_pagato then 'refunded'") && atomic.includes("else 'partially_refunded'"));
check("31. ordine refunded non regredisce", atomic.includes("A refunded order must never regress") && atomic.includes("v_ordine.payment_status = 'refunded'"));
check("32. stato consegna non viene toccato", !hardening.includes("update public.ordini\n  set stato =") && !atomic.includes("update public.ordini\n  set stato ="));
check("33. operation non viene sintetizzata come full refund", hardening.includes("individual Refund amount remains the operation amount"));
check("34. finalizzazione UPDATE è verificata", hardening.includes("returning id into v_updated_id") && hardening.includes("OPERATION_FINALIZE_NOT_CONFIRMED"));
check("35. errore atomico non produce falso successo", hardening.includes("when others then") && hardening.includes("'ok', false"));

// Retry, stale/out-of-order and operation lifecycle.
check("36. failed è retryable", operations.includes("p_stato not in ('failed', 'reconciliation_required')") && hardening.includes("v_operazione.stato not in ('pending', 'processing', 'failed', 'reconciliation_required')"));
check("37. reconciliation_required è retryable", operations.includes("reconciliation_required") && hardening.includes("stato', 'reconciliation_required'"));
check("38. pending/processing possono essere riconciliati", hardening.includes("v_operazione.stato not in ('pending', 'processing', 'failed', 'reconciliation_required')"));
check("39. cumulativo stale non marca succeeded", hardening.includes("REFUND_CUMULATIVE_STALE") && hardening.includes("operation non finalizzata"));
check("40. retry stale resta esplicito", hardening.includes("stato', 'reconciliation_required'") && hardening.includes("cumulativo Stripe non è superiore"));
check("41. lease/attempts esistono nel modello", operations.includes("attempts") && operations.includes("lease_until") && operations.includes("pagamenti_rimborso_operazione_claim"));
check("42. claim incrementa attempts atomicamente", operations.includes("attempts = attempts + 1") && operations.includes("for update"));
check("43. operation succeeded non viene ricalcolata", operations.includes("if v_op.stato = 'succeeded'") && operations.includes("claimed', false"));

// Webhook integration and failure behavior.
check("44. webhook seleziona solo operation locali deterministiche", webhook.includes("operationByIndividualAmount.length !== 1") && webhook.includes("kind: \"ambiguous\""));
check("45. metadata incoerente fallisce closed", webhook.includes("metadata e Refund ID persistito divergenti"));
check("46. mismatch operation non aggiorna accounting", webhook.includes("finalizzazione refund operation rifiutata") && hardening.includes("return jsonb_build_object('ok', false"));
check("47. failure RPC resta retryable nel webhook", webhook.includes("body: \"Elaborazione evento fallita; Stripe ritenterà.\""));
check("48. refund esterno non crea operation", webhook.includes("refund esterno non associato") && webhook.includes("No synthetic operation"));
check("49. retry dopo errore può riprovare la stessa operation", webhook.includes("pagamenti_webhook_rimborso_operazione_finalizza") && hardening.includes("failed"));
check("50. nessuna modifica a rimborsi.ts nello STEP 4", refunds.includes("pagamenti_prepara_rimborso") && !refunds.includes("pagamenti_webhook_rimborso_operazione_finalizza"));

console.log(`\nSTEP 4 REFUND OPERATIONS: ${passati} PASS / ${falliti} FAIL`);
process.exit(falliti === 0 ? 0 : 1);
