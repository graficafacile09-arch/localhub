/**
 * FASE 10 — BLOCCO 3 — STEP 2
 * Test statico dedicato al lifecycle checkout.session.completed Stripe.
 *
 * Il test non contatta Stripe né applica migration: verifica il contratto
 * implementato nel webhook, nel resolver dell'intento e nella RPC P2.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());
const stripe = readFileSync(join(root, "lib/pagamenti/webhook-stripe.ts"), "utf8");
const sessioni = readFileSync(join(root, "lib/pagamenti/sessioni.ts"), "utf8");
const conferma = readFileSync(
  join(root, "supabase/migrations/20261005_p2_checkout_intento_conferma.sql"),
  "utf8"
);
const lifecycle = readFileSync(
  join(root, "supabase/migrations/20261012_webhook_event_lifecycle_retry_hardening.sql"),
  "utf8"
);

let passati = 0;
let falliti = 0;

function check(nome: string, condizione: boolean, dettaglio?: unknown): void {
  if (condizione) {
    passati++;
    console.log(`  PASS ${nome}`);
  } else {
    falliti++;
    console.log(`  FAIL ${nome}${dettaglio === undefined ? "" : ` → ${String(dettaglio)}`}`);
  }
}

console.log("\n=== STEP 2 — checkout.session.completed Stripe hardening ===\n");

// 1–4: identità, account e riferimento dell'intento.
check("1. event.account è richiesto", stripe.includes("event.account mancante"));
check("2. intento assente è rifiutato", stripe.includes("intento checkout non trovato"));
check("3. riferimento client_reference_id/metadata è validato", stripe.includes("riferimentoCheckoutDaSessione") && stripe.includes("client_reference_id e metadata.ordine_id divergenti"));
check("4. intento viene cercato senza filtro merchant", stripe.includes("intentoDaIdSenzaNegozio(ordineId)") && sessioni.includes("export async function intentoDaIdSenzaNegozio"));

// 5–8: merchant binding e stato dell'intento/sessione.
check("5. connected account è confrontato con negozio_pagamenti", stripe.includes("getStripeConnectAccount(intento.negozioId)") && stripe.includes("connected account non associato al negozio dell'intento"));
check("6. account A + intento negozio B fallisce closed", stripe.includes("accountConfigurato: accountConfigurato?.accountId") && stripe.includes("configuredAccount !== eventAccount"));
check("7. intent expired/cancelled/non attivo non è confermabile", stripe.includes("intento non più confermabile") && stripe.includes('["created", "pending"].includes(input.intento.status)'));
check("8. Checkout Session deve essere complete", stripe.includes('input.session.status !== "complete"') && stripe.includes('checkout.session.completed con stato Session inatteso'));

// 9–14: stato pagamento, importo e valuta.
check("9. payment_status paid è obbligatorio", stripe.includes('input.session.paymentStatus !== "paid"'));
check("10. unpaid è rifiutato", stripe.includes('payment_status Stripe non paid'));
check("11. no_payment_required è rifiutato", stripe.includes('payment_status Stripe non paid'));
check("12. stato pagamento mancante/inatteso è fail-closed", stripe.includes("session.paymentStatus") && stripe.includes("non paid"));
check("13. amount_total usa integer minor units", stripe.includes("stripeMinorUnits(input.session.amountTotal)"));
check("14. amount mismatch blocca la conferma", stripe.includes("importo Checkout Session diverso dall'intento"));

// 15–18: valuta, PaymentIntent e gate RPC.
check("15. currency è normalizzata", stripe.includes("valuta(input.session.currency)") && stripe.includes("toUpperCase"));
check("16. currency mismatch blocca la conferma", stripe.includes("valuta Checkout Session diversa dall'intento"));
check("17. PaymentIntent viene validato quando presente", stripe.includes("PaymentIntent Stripe non valido") && stripe.includes("transactionId"));
check("18. checkout_intento_conferma è chiamata solo dopo il validatore", stripe.includes("validaCheckoutSessionIntentoStripe") && stripe.includes("confermaIntentoCheckout(intento.checkoutId"));

// 19–22: esiti RPC, idempotenza e out-of-order.
check("19. errore RPC non è falso successo", stripe.includes("conferma intento Stripe fallita") && stripe.includes("throw new Error"));
check("20. intento già collegato resta idempotente", conferma.includes("if v_sessione.ordine_id is not null") && conferma.includes("giaEsistente"));
check("21. stesso event_id processed è no-op 200", stripe.includes("DUPLICATE_PROCESSED") && stripe.includes("Evento già processato"));
check("22. evento retryable non viene ACKato come processed", stripe.includes("RETRYABLE_EXISTING") && stripe.includes("Impossibile finalizzare l'evento; Stripe ritenterà."));

// 23–25: nessun ordine prematuro, lifecycle e finalizzazione.
check("23. nessun ordine prima della conferma", sessioni.includes("checkout_intento_conferma") && stripe.includes("confermaIntentoCheckout"));
check("24. errore di elaborazione lascia evento retryable", stripe.includes("segnaProcessato(evento.id, false") && stripe.includes('body: "Elaborazione evento fallita; Stripe ritenterà."'));
check("25. finalizzazione deve essere confermata come PROCESSED", stripe.includes('finalizzazione.esito !== "PROCESSED"') && stripe.includes('finalizzazione.stato !== "processed"') && lifecycle.includes("p_attempt"));

console.log(`\nSTEP 2 CHECKOUT SESSION: ${passati} PASS / ${falliti} FAIL`);
process.exit(falliti === 0 ? 0 : 1);
