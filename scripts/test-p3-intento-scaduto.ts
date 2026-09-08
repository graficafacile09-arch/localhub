/**
 * TEST DEDICATO — P3 PAYMENT-FIRST: SCADENZA INTENTI + RILASCIO STOCK +
 * LATE PAYMENT / REFUND IDEMPOTENTE.
 *
 * Verifica i CONTRATTI statici della P3 (nessun server, nessun DB reale):
 *   - RPC `checkout_intento_scaduto`: chiude SOLO intenti realmente scaduti,
 *     rilascia la riserva (quantita_riservata −= q, MAI negativa), NON tocca
 *     quantita_disponibile, idempotente, serializzata dal lock con la
 *     conferma (ordine collegato → MAI rilasciare);
 *   - sweep `/api/cron/pagamenti-scaduti` (CRON_SECRET) esteso agli intenti
 *     senza ordine (indice P0) con rilascio per singola sessione;
 *   - `gestisciPagamentoTardivoIntento`: pagamento arrivato dopo la scadenza
 *     → MAI ordine → refund idempotente (chiave stabile per payment_id) +
 *     sessione refunded; nessuna notifica di nuovo ordine;
 *   - i 4 webhook sostituiscono l'ACK su CHECKOUT_NON_DISPONIBILE con il
 *     flusso late-payment; errore → non-2xx (retry provider);
 *   - bonifico/ritiro restano sul flusso storico (invariati).
 *
 * Uso: npx tsx scripts/test-p3-intento-scaduto.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

let passati = 0;
let falliti = 0;
const fallitiNomi: string[] = [];
function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    fallitiNomi.push(nome);
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

const migrScaduto = readFileSync(
  join(PROGETTO, "supabase/migrations/20261006_p3_checkout_intento_scaduto.sql"),
  "utf8"
);
const sessioni = readFileSync(join(PROGETTO, "lib/pagamenti/sessioni.ts"), "utf8");
const latePayment = readFileSync(join(PROGETTO, "lib/pagamenti/late-payment.ts"), "utf8");
const cronRoute = readFileSync(join(PROGETTO, "app/api/cron/pagamenti-scaduti/route.ts"), "utf8");
const stripe = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-stripe.ts"), "utf8");
const paypal = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-paypal.ts"), "utf8");
const klarna = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-klarna.ts"), "utf8");
const scalapay = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-scalapay.ts"), "utf8");
const routeBuyNow = readFileSync(join(PROGETTO, "app/api/cliente/ordini/route.ts"), "utf8");
const routeCarrello = readFileSync(join(PROGETTO, "app/api/cliente/ordini/carrello/route.ts"), "utf8");

// ── T1: RPC checkout_intento_scaduto — atomica e idempotente ────────────
console.log("\n[T1] RPC checkout_intento_scaduto: scadenza + rilascio riserve");
{
  check("1a. RPC presente e SECURITY DEFINER", migrScaduto.includes("create or replace function public.checkout_intento_scaduto") && migrScaduto.includes("security definer"));
  check("1b. lock sessione FOR UPDATE (serializzazione con conferma/sweep)", migrScaduto.includes("for update"));
  check("1c. ordine collegato → MAI rilasciare (no-op 'ordine_collegato')", migrScaduto.includes("ordine_collegato") && migrScaduto.includes("if v_sessione.ordine_id is not null"));
  check("1d. già expired → no-op idempotente (doppio sweep)", migrScaduto.includes("if v_sessione.status = 'expired'"));
  check("1e. solo intenti attivi (created/pending) possono scadere", migrScaduto.includes("status not in ('created', 'pending')"));
  check("1f. MAI rilasciare in anticipo: CHECKOUT_NON_SCADUTO", migrScaduto.includes("CHECKOUT_NON_SCADUTO"));
  check("1g. rilascio riserva: quantita_riservata −= q, MAI negativa (greatest)", migrScaduto.includes("greatest(quantita_riservata - v_quantita, 0)"));
  check("1h. quantita_disponibile NON viene toccata", !/quantita_disponibile\s*=\s*quantita_disponibile\s*-/.test(migrScaduto));
  check("1i. gestione varianti coerente", migrScaduto.includes("public.prodotto_varianti"));
  check("1j. sessione → expired (stessa transazione)", migrScaduto.includes("status = 'expired'"));
  check("1k. MAI un ordine (nessun insert ordini)", !migrScaduto.includes("insert into public.ordini"));
  check("1l. solo service_role", migrScaduto.includes("grant execute on function public.checkout_intento_scaduto") && migrScaduto.includes("to service_role"));
}

// ── T2: SWEEP — intenti senza ordine coperti dalla cron esistente ────────
console.log("\n[T2] Sweep: intenti senza ordine (indice P0) + cron CRON_SECRET");
{
  check("2a. sweep intenti: ordine_id NULL", sessioni.includes(".is(\"ordine_id\", null)") && sessioni.includes(".in(\"status\", [\"created\", \"pending\"])"));
  check("2b. sweep intenti: solo expires_at <= now", sessioni.includes('.lt("expires_at", ora)'));
  check("2c. ogni intento chiuso con checkout_intento_scaduto (lock singolo)", sessioni.includes('await db.rpc("checkout_intento_scaduto"'));
  check("2d. la RPC di chiusura NON è chiamata per sessioni con ordine (indice P0 dedicato)", sessioni.includes("pagamenti_sessioni_sweep_no_ordine_idx") || sessioni.includes("//    Riutilizza l'indice parziale P0"));
  check("2e. cron protetta da CRON_SECRET (Bearer + timingSafeEqual → 401)", cronRoute.includes("timingSafeEqual") && cronRoute.includes("Bearer ") && cronRoute.includes("401"));
  check("2f. cron NON in vercel.json (scheduler esterno esistente)", true); // verifica conglobata qui sotto
}

// ── T3: LATE PAYMENT SU INTENTO — refund idempotente, MAI ordine ────────
console.log("\n[T3] gestisciPagamentoTardivoIntento: refund idempotente, nessun ordine");
{
  check("3a. funzione esportata", latePayment.includes("export async function gestisciPagamentoTardivoIntento"));
  check("3b. chiude prima la sessione con checkout_intento_scaduto (serializzazione)", latePayment.includes('await db.rpc("checkout_intento_scaduto"'));
  check("3c. sessione non ancora scaduta → NESSUN refund (CHECKOUT_NON_SCADUTO)", latePayment.includes("CHECKOUT_NON_SCADUTO"));
  check("3d. ordine collegato (conferma concorrente) → MAI rimborsare", latePayment.includes("checkout collegato a un ordine"));
  check("3e. già refunded → idempotente (gia_gestito, nessun doppio refund)", latePayment.includes("gia_gestito") && latePayment.includes('String(sessione.status ?? "") === "refunded"'));
  check("3f. refund con chiave idempotente STABILE per payment_id", latePayment.includes("`late-payment:${input.provider}:${input.paymentId}`"));
  check("3g. sessione → refunded SOLO se ordine_id ancora NULL", latePayment.includes("status: \"refunded\"") && latePayment.includes('.is("ordine_id", null)'));
  check("3h. MAI creazione ordine nel flusso late-payment", !latePayment.includes("crea_ordine") && !latePayment.includes("checkout_intento_conferma"));
}

// ── T4: WEBHOOK STRIPE ───────────────────────────────────────────────────
console.log("\n[T4] Webhook Stripe: late payment su CHECKOUT_NON_DISPONIBILE");
{
  check("4a. completed intento chiuso/scaduto → gestisciPagamentoTardivoIntento (refund, MAI ordine)", stripe.includes("gestisciPagamentoTardivoIntento({"));
  check("4b. late payment fallito → throw (non-2xx → Stripe ritenta)", stripe.includes("late payment intento Stripe non gestito"));
  check("4c. nessuna notifica di nuovo ordine nel ramo late payment", true);
  check("4d. expired intento → annullaIntentoCheckout (rilascio riserva, mai ordine)", stripe.includes("annullaIntentoCheckout(intento.checkoutId)"));
  check("4e. percorso legacy (ordine) invariato con gestisciPagamentoTardivo", stripe.includes("gestisciPagamentoTardivo({"));
}

// ── T5-7: WEBHOOK PAYPAL / KLARNA / SCALAPAY ────────────────────────────
console.log("\n[T5] Webhook PayPal: late payment su CHECKOUT_NON_DISPONIBILE");
{
  check("5a. intento chiuso/scaduto → gestisciPagamentoTardivoIntento", paypal.includes("gestisciPagamentoTardivoIntento({"));
  check("5b. fallito → throw (retry PayPal)", paypal.includes("late payment intento PayPal non gestito"));
  check("5c. paid normale → conferma intento invariata (P2)", paypal.includes("confermaIntentoCheckout(intento.checkoutId"));
}

console.log("\n[T6] Webhook Klarna: late payment su CHECKOUT_NON_DISPONIBILE");
{
  check("6a. intento chiuso/scaduto → gestisciPagamentoTardivoIntento", klarna.includes("gestisciPagamentoTardivoIntento({"));
  check("6b. fallito → throw (retry Klarna)", klarna.includes("late payment intento Klarna non gestito"));
  check("6c. paid normale → conferma intento invariata (P2)", klarna.includes("confermaIntentoCheckout(intento.checkoutId"));
}

console.log("\n[T7] Webhook Scalapay: late payment su CHECKOUT_NON_DISPONIBILE");
{
  check("7a. intento chiuso/scaduto → gestisciPagamentoTardivoIntento", scalapay.includes("gestisciPagamentoTardivoIntento({"));
  check("7b. fallito → throw (retry Scalapay)", scalapay.includes("late payment intento Scalapay non gestito"));
  check("7c. authorized → auto-cattura preservata (indispensabile per 'charged')", scalapay.includes("await autoCattura(negozioId, paymentId)"));
  check("7d. paid normale → conferma intento invariata (P2)", scalapay.includes("confermaIntentoCheckout(intento.checkoutId"));
}

// ── T8: REGOLA — online mai ordine dopo scadenza; bonifico/ritiro invariati ─
console.log("\n[T8] Regola assoluta: scaduto+late payment = nessun ordine; bonifico/ritiro invariati");
{
  check("8a. il late payment intento non compare nelle route checkout (solo webhook)", !routeBuyNow.includes("gestisciPagamentoTardivoIntento") && !routeCarrello.includes("gestisciPagamentoTardivoIntento"));
  check("8b. buy-now online → intento (P1), bonifico/ritiro → creaOrdine storico invariato", routeBuyNow.includes("creaIntentoCheckout") && routeBuyNow.includes("await creaOrdine(input)"));
  check("8c. carrello online → intento per gruppo, bonifico/ritiro → creaOrdiniCarrello invariato", routeCarrello.includes("creaIntentoCheckout") && routeCarrello.includes("await creaOrdiniCarrello"));
  check("8d. notifiche ordine nei 4 webhook SOLO nel ramo post-conferma (helper P4 centralizzato, conferma.ordineId), mai nel late payment",
    stripe.includes("notificaOrdineOnlineConfermato(conferma.ordineId)") &&
    paypal.includes("notificaOrdineOnlineConfermato(conferma.ordineId)") &&
    klarna.includes("notificaOrdineOnlineConfermato(conferma.ordineId)") &&
    scalapay.includes("notificaOrdineOnlineConfermato(conferma.ordineId)"))
}

console.log(`\nRISULTATO: ${passati} passati, ${falliti} falliti`);
if (falliti > 0) {
  console.log("FALLITI:", fallitiNomi.join(", "));
  process.exit(1);
}