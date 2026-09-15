/**
 * FASE 10 — BLOCCO 3 — STEP 3
 * Test statico del contratto charge.refunded.
 * Non contatta Stripe e non applica migration/database remoto.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const stripe = readFileSync(join(root, "lib/pagamenti/webhook-stripe.ts"), "utf8");
const gateway = readFileSync(join(root, "lib/pagamenti/stripe.ts"), "utf8");
const refunds = readFileSync(join(root, "lib/pagamenti/rimborsi.ts"), "utf8");
const atomic = readFileSync(join(root, "supabase/migrations/20260927_webhook_refund_atomic.sql"), "utf8");
const operations = readFileSync(join(root, "supabase/migrations/20260928_webhook_refund_operations.sql"), "utf8");

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

console.log("\n=== STEP 3 — Stripe charge.refunded hardening ===\n");

// Account, Charge e binding.
check("1. event.account obbligatorio", stripe.includes("charge.refunded senza event.account"));
check("2. account Connect confrontato", stripe.includes("accountConfigurato.accountId !== eventAccount"));
check("3. Charge ID richiesto", stripe.includes("Charge ID mancante"));
check("4. PaymentIntent richiesto", stripe.includes("PaymentIntent mancante"));
check("5. Charge e PaymentIntent non sono intercambiabili", stripe.includes("Charge ID e PaymentIntent non sono intercambiabili"));
check("6. ordine risolto dal PaymentIntent senza fallback ambiguo", stripe.includes("eq(\"payment_transaction_id\", transactionId)") && stripe.includes("ordini.length !== 1"));
check("7. account A / ordine B fail-closed", atomic.includes("REFUND_BINDING_MISMATCH") && stripe.includes("connected account refund non associato al negozio"));

// Refund ID e coerenza Stripe.
check("8. Refund ID reale richiesto", stripe.includes("Refund ID mancante, duplicato o non distinto dal Charge"));
check("9. refund ID distinto da Charge e PaymentIntent", stripe.includes("refundId === chargeId || refundId === paymentIntentId"));
check("10. Refund ID duplicato nel Charge rifiutato", stripe.includes("refundIds.includes(refundId)"));
check("11. Charge amount/refunded/captured validati", stripe.includes("amountRefundedMinor") && stripe.includes("amountCapturedMinor") && stripe.includes("Importo catturato non coerente"));
check("12. Refund amount individuale validato", stripe.includes("Importo Refund individuale non valido"));
check("13. somma Refund coerente con amount_refunded", stripe.includes("refundSumMinor !== amountRefundedMinor"));
check("14. currency normalizzata e verificata", stripe.includes("Valuta refund non coerente") && stripe.includes("toUpperCase"));
check("15. flag Charge refunded coerente", stripe.includes("Flag Charge refunded incoerente con il cumulativo"));

// Partial/full e finalizzazione.
check("16. partial refund distinto", stripe.includes('refundType: amountRefundedMinor === amountPaidMinor ? "full" : "partial"'));
check("17. full refund distinto", stripe.includes('"full" : "partial"'));
check("18. RPC atomica verifica PaymentIntent e valuta", atomic.includes("REFUND_PAYMENTINTENT_MISMATCH") && atomic.includes("REFUND_CURRENCY_MISMATCH"));
check("19. RPC atomica non regredisce il cumulativo", atomic.includes("p_amount_refunded <= v_rimborsato") && atomic.includes("cumulative_amount_non_crescente"));
check("20. ordine non viene marcato refunded indiscriminatamente", atomic.includes("when p_amount_refunded = v_pagato then 'refunded'"));
check("21. stato ordine di consegna non viene modificato", !atomic.includes("set stato =") && !stripe.includes("update({ stato:"));

// Idempotenza/out-of-order/refund operations.
check("22. stesso event_id è no-op dopo processed", stripe.includes("DUPLICATE_PROCESSED") && stripe.includes("Evento già processato"));
check("23. stesso Refund ID usa la unique constraint", operations.includes("pagamenti_rimborso_operazioni_refund_id_unq"));
check("24. operation già succeeded è no-op", operations.includes("v_operazione.stato = 'succeeded'") && operations.includes("'duplicate', true"));
check("25. retry dopo failed è riconciliabile", operations.includes("'failed', 'reconciliation_required'") && refunds.includes("Rimborso eseguito dal provider"));
check("26. partial successivo conserva cumulativo", stripe.includes("p_amount_refunded: amountRefunded") && atomic.includes("payment_refunded_amount = p_amount_refunded"));
check("27. refund non associato non inventa operation", stripe.includes("No synthetic operation") && operations.includes("No operation is created for an external Stripe refund"));
check("28. Charge/Refund lookup server-side", gateway.includes("refundsDaCharge") && stripe.includes("await arricchisciChargeStripe"));

// Failure safety/logging.
check("29. finalizzazione fallita non è 200", stripe.includes("finalizzazione refund operation fallita") && stripe.includes("body: \"Elaborazione evento fallita; Stripe ritenterà.\""));
check("30. mismatch non aggiorna ordine", stripe.includes("charge.refunded rifiutato") && atomic.includes("jsonb_build_object(") && atomic.includes("'ok', false"));
check("31. log minimali senza payload completo", stripe.includes("eventId: evento.id") && !stripe.includes("console.log(evento"));
check("32. refund operations resta il ledger esistente", stripe.includes("pagamenti_webhook_rimborso_operazione_finalizza") && refunds.includes("pagamenti_prepara_rimborso"));

console.log(`\nSTEP 3 CHARGE REFUNDED: ${passati} PASS / ${falliti} FAIL`);
process.exit(falliti === 0 ? 0 : 1);
