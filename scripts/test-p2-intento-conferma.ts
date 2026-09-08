/**
 * TEST DEDICATO — P2 PAYMENT-FIRST: CONFERMA PAGAMENTO → ORDINE ATOMICO.
 *
 * Verifica i CONTRATTI statici della P2 (nessun server, nessun DB reale):
 *   - la RPC `checkout_intento_conferma` crea ordine + righe e converte la
 *     riserva (quantita_disponibile −= q E quantita_riservata −= q) SOLO
 *     dopo il pagamento confermato dal webhook, in un'unica transazione;
 *   - idempotenza: sessione già collegata → ordine esistente, mai duplicati;
 *   - sessione scaduta/chiusa → NESSUNA creazione ordine (late-payment = P3);
 *   - i 4 webhook (Stripe/PayPal/Klarna/Scalapay) correlano per ID sessione
 *     / payment reference e chiamano checkout_intento_conferma SOLO sugli
 *     esiti realmente pagati, con notifiche SOLO dopo l'ordine creato;
 *   - bonifico/ritiro restano sul flusso storico (nessun intento/conferma).
 *
 * Uso: npx tsx scripts/test-p2-intento-conferma.ts
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

const migrConferma = readFileSync(
  join(PROGETTO, "supabase/migrations/20261005_p2_checkout_intento_conferma.sql"),
  "utf8"
);
const sessioni = readFileSync(join(PROGETTO, "lib/pagamenti/sessioni.ts"), "utf8");
const stripe = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-stripe.ts"), "utf8");
const paypal = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-paypal.ts"), "utf8");
const klarna = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-klarna.ts"), "utf8");
const scalapay = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-scalapay.ts"), "utf8");
const routeBuyNow = readFileSync(join(PROGETTO, "app/api/cliente/ordini/route.ts"), "utf8");
const routeCarrello = readFileSync(join(PROGETTO, "app/api/cliente/ordini/carrello/route.ts"), "utf8");

// ── T1: RPC checkout_intento_conferma — atomica e payment-first ─────────
console.log("\n[T1] RPC checkout_intento_conferma: ordine SOLO dopo pagamento verificato");
{
  check("1a. RPC presente e SECURITY DEFINER", migrConferma.includes("create or replace function public.checkout_intento_conferma") && migrConferma.includes("security definer"));
  check("1b. lock sessione FOR UPDATE (conferme concorrenti serializzate)", migrConferma.includes("for update"));
  check("1c. solo intenti attivi (created/pending): chiusa/scaduta → CHECKOUT_NON_DISPONIBILE", migrConferma.includes("CHECKOUT_NON_DISPONIBILE"));
  check("1d. idempotenza: ordine_id già valorizzato → ordine esistente", migrConferma.includes("if v_sessione.ordine_id is not null") && migrConferma.includes("giaEsistente"));
  check("1e. legge SOLO checkout_payload (snapshot v1)", migrConferma.includes("checkout_payload") && migrConferma.includes("'version'"));
  check("1f. verifica importo/valuta confermata (fail-closed)", migrConferma.includes("IMPORTO_NON_COERENTE") && migrConferma.includes("VALUTA_NON_VALIDA"));
  check("1g. INSERT ordini con payment_status='paid' nella stessa transazione", migrConferma.includes("'paid', v_provider, p_payment_id, p_transaction_id"));
  check("1h. conversione riserva: disponibile −= q E riservata −= q", migrConferma.includes("quantita_disponibile = quantita_disponibile - v_quantita") && /quantita_riservata\s+= quantita_riservata - v_quantita/.test(migrConferma));
  check("1i. gestione varianti coerente", migrConferma.includes("public.prodotto_varianti"));
  check("1j. sessione collegata e paid (stessa transazione)", migrConferma.includes("ordine_id = v_ordine_id") && migrConferma.includes("status = 'paid'"));
  check("1k. rollback totale su errore (when others → SAVE_FAILED)", migrConferma.includes("when others") && migrConferma.includes("SAVE_FAILED"));
  check("1l. solo service_role", migrConferma.includes("grant execute on function public.checkout_intento_conferma") && migrConferma.includes("to service_role"));
}

// ── T2: helper applicativi esposti ───────────────────────────────────────
console.log("\n[T2] lib/pagamenti/sessioni.ts: helper P2");
{
  check("2a. confermaIntentoCheckout esportata", sessioni.includes("export async function confermaIntentoCheckout"));
  check("2b. intentoDaId (Stripe: riferimento = ID sessione)", sessioni.includes("export async function intentoDaId"));
  check("2c. intentoDaPaymentId (PayPal/Klarna/Scalapay)", sessioni.includes("export async function intentoDaPaymentId"));
  check("2d. intentoDaId cerca SOLO sessioni con ordine_id NULL", sessioni.includes('.is("ordine_id", null)'));
}

// ── T3: WEBHOOK STRIPE ───────────────────────────────────────────────────
console.log("\n[T3] Webhook Stripe: correlazione intento + conferma");
{
  check("3a. completed: risolve l'intento per ID sessione (client_reference_id = id sessione)", stripe.includes("intentoDaId(ordineId, negozioId)"));
  check("3b. completed: pagamento non paid → rifiutato", stripe.includes('"checkout.session.completed (intento): pagamento non confermato"'));
  check("3c. completed: importo/valuta verificati prima della conferma", stripe.includes("(intento): importo non coerente") && stripe.includes("(intento): valuta non coerente"));
  check("3d. completed: chiama checkout_intento_conferma via confermaIntentoCheckout", stripe.includes("confermaIntentoCheckout(intento.checkoutId"));
  check("3e. completed: notifiche SOLO dopo l'ordine creato — helper P4 centralizzato su ordineId della conferma", stripe.includes("notificaOrdineOnlineConfermato(conferma.ordineId)"));
  check("3f. completed: sessione chiusa/scaduta → nessun ordine (CHECKOUT_NON_DISPONIBILE)", stripe.includes('conferma.codice === "CHECKOUT_NON_DISPONIBILE"'));
  check("3g. completed: errore DB → throw (non-2xx → Stripe ritenta)", stripe.includes("conferma intento Stripe fallita"));
  check("3h. expired: intento → annulla riserva (checkout_intento_annulla), mai ordine", stripe.includes("annullaIntentoCheckout(intento.checkoutId)"));
  check("3i. percorso legacy invariato (binding su ordine)", stripe.includes("caricaBindingCheckout"));
}

// ── T4: WEBHOOK PAYPAL ───────────────────────────────────────────────────
console.log("\n[T4] Webhook PayPal: cattura completata → conferma intento");
{
  check("4a. risolve l'intento per payment_id (provider paypal, ordine_id NULL)", paypal.includes('intentoDaPaymentId(paymentId, negozioId, "paypal")'));
  check("4b. importo verificato contro l'intento (fail-closed)", paypal.includes("intento!.importo") && paypal.includes("importo incoerente"));
  check("4c. paid + intento → confermaIntentoCheckout (transactionId = capture id)", paypal.includes("confermaIntentoCheckout(intento.checkoutId") && paypal.includes("transactionId"));
  check("4d. notifiche SOLO dopo ordine creato (helper P4 centralizzato)", paypal.includes("notificaOrdineOnlineConfermato(conferma.ordineId)"));
  check("4e. intento con esito non-paid → registrato e ignorato (nessun ordine)", paypal.includes('stato !== "paid"'));
  check("4f. errore conferma → throw (retry PayPal), sessione chiusa → nessun ordine", paypal.includes("conferma intento PayPal fallita") && paypal.includes('"CHECKOUT_NON_DISPONIBILE"'));
}

// ── T5: WEBHOOK KLARNA ───────────────────────────────────────────────────
console.log("\n[T5] Webhook Klarna: solo esito pagato → conferma intento");
{
  check("5a. risolve l'intento per payment_id (provider klarna)", klarna.includes('intentoDaPaymentId(paymentId, negozioId, "klarna")'));
  check("5b. importo (order_amount, centesimi) verificato contro l'intento", klarna.includes("intento!.importo"));
  check("5c. paid + intento → confermaIntentoCheckout (capture_id)", klarna.includes("confermaIntentoCheckout(intento.checkoutId") && klarna.includes("captureId"));
  check("5d. notifiche SOLO dopo ordine creato (helper P4 centralizzato)", klarna.includes("notificaOrdineOnlineConfermato(conferma.ordineId)"));
  check("5e. evento informativo (non pagato) → nessun ordine", klarna.includes('stato !== "paid"'));
  check("5f. HMAC/idempotenza preservate (registraEvento invariato)", klarna.includes("registraEvento"));
}

// ── T6: WEBHOOK SCALAPAY ─────────────────────────────────────────────────
console.log("\n[T6] Webhook Scalapay: authorized→auto-cattura, charged→conferma");
{
  check("6a. risolve l'intento per payment_id (provider scalapay)", scalapay.includes('intentoDaPaymentId(paymentId, negozioId, "scalapay")'));
  check("6b. authorized con intento → auto-cattura ANCHE senza ordine (necessaria per 'charged')", scalapay.includes("!ordine && !intento") && scalapay.includes("await autoCattura(negozioId, paymentId)"));
  check("6c. paid (charged) + intento → confermaIntentoCheckout", scalapay.includes("confermaIntentoCheckout(intento.checkoutId"));
  check("6d. notifiche SOLO dopo ordine creato (helper P4 centralizzato)", scalapay.includes("notificaOrdineOnlineConfermato(conferma.ordineId)"));
  check("6e. intento non pagato (expired/refunded) → nessun ordine", scalapay.includes('stato !== "paid"'));
  check("6f. HMAC/idempotenza preservate (identitaEventoDaPayload invariato)", scalapay.includes("identitaEventoDaPayload"));
}

// ── T7: online = ordine SOLO dopo pagamento; bonifico/ritiro invariati ──
console.log("\n[T7] Regola assoluta: online post-paid, bonifico/ritiro invariati");
{
  check("7a. la conferma esiste SOLO come RPC webhook (nessuna creazione ordine nelle route checkout)", !routeBuyNow.includes("checkout_intento_conferma") && !routeCarrello.includes("checkout_intento_conferma"));
  check("7b. buy-now online → intento (P1), bonifico/ritiro → creaOrdine storico", routeBuyNow.includes("creaIntentoCheckout") && routeBuyNow.includes("await creaOrdine(input)"));
  check("7c. carrello online → intento per gruppo, bonifico/ritiro → creaOrdiniCarrello storico", routeCarrello.includes("creaIntentoCheckout") && routeCarrello.includes("await creaOrdiniCarrello"));
  check("7d. nessuna notifica ordine durante P1 (niente notifiche nelle route checkout online)", !/inviaNotificaNuovoOrdine|notificaNuovoOrdineAdmin/.test(routeBuyNow));
}

console.log(`\nRISULTATO: ${passati} passati, ${falliti} falliti`);
if (falliti > 0) {
  console.log("FALLITI:", fallitiNomi.join(", "));
  process.exit(1);
}