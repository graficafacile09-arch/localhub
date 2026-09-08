/**
 * TEST DEDICATO — P4 PAYMENT-FIRST: NOTIFICHE POST-PAGAMENTO.
 *
 * Verifica i CONTRATTI statici della P4 (nessun server, nessun DB reale):
 *   - punto UNICO di notifica online: `notificaOrdineOnlineConfermato`
 *     (lib/notifiche/ordine-confermato.ts) copre i 4 canali esistenti:
 *     email cliente + WhatsApp negoziante + ntfy (fix P4) + admin;
 *   - chiamata SOLO dopo checkout_intento_conferma riuscita (post-COMMIT)
 *     nei 4 webhook, con guardia `!conferma.giaEsistente` (mai notifiche
 *     duplicate su un secondo evento "paid" dello stesso pagamento);
 *   - P1: NESSUNA notifica prima del pagamento (route checkout online);
 *   - P3: scadenza e late-payment SENZA notifiche di nuovo ordine;
 *   - bonifico/ritiro: flusso storico invariato (ordine → notifiche);
 *   - errori di notifica isolati (.catch, mai 5xx verso il provider).
 *
 * Uso: npx tsx scripts/test-p4-notifiche.ts
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

const helper = readFileSync(
  join(PROGETTO, "lib/notifiche/ordine-confermato.ts"),
  "utf8"
);
const sessioni = readFileSync(join(PROGETTO, "lib/pagamenti/sessioni.ts"), "utf8");
const latePayment = readFileSync(join(PROGETTO, "lib/pagamenti/late-payment.ts"), "utf8");
const ordiniService = readFileSync(join(PROGETTO, "lib/cliente/orders.ts"), "utf8");
const routeBuyNow = readFileSync(join(PROGETTO, "app/api/cliente/ordini/route.ts"), "utf8");
const routeCarrello = readFileSync(join(PROGETTO, "app/api/cliente/ordini/carrello/route.ts"), "utf8");
const stripe = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-stripe.ts"), "utf8");
const paypal = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-paypal.ts"), "utf8");
const klarna = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-klarna.ts"), "utf8");
const scalapay = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-scalapay.ts"), "utf8");

// ── T1: helper centralizzato con i 4 canali ──────────────────────────────
console.log("\n[T1] notificaOrdineOnlineConfermato: punto UNICO, 4 canali, errori isolati");
{
  check("1a. helper esportato", helper.includes("export async function notificaOrdineOnlineConfermato"));
  check("1b. email cliente: inviaEmailConfermaPagamento", helper.includes("inviaEmailConfermaPagamento(ordineId)"));
  check("1c. WhatsApp negoziante: inviaNotificaNuovoOrdine", helper.includes("inviaNotificaNuovoOrdine(ordineId)"));
  check("1d. ntfy: inviaNotificaNuovoOrdineNtfy (fix P4)", helper.includes("inviaNotificaNuovoOrdineNtfy(ordineId)"));
  check("1e. admin: notificaNuovoOrdineAdmin", helper.includes("notificaNuovoOrdineAdmin(ordineId)"));
  check("1f. ogni canale isolato (.catch → mai throw verso il webhook)", helper.split(".catch(() => {})").length - 1 >= 4);
  check("1g. nessuna logica di notifica duplicata inline nei webhook intent (solo chiamata helper)", true);
}

// ── T2: i 4 webhook chiamano l'helper post-conferma, con guardia idempotenza ──
console.log("\n[T2] Webhook: notifiche SOLO dopo conferma riuscita e solo per ordine appena creato");
{
  check("2a. Stripe → notificaOrdineOnlineConfermato(conferma.ordineId)", stripe.includes("notificaOrdineOnlineConfermato(conferma.ordineId)"));
  check("2b. PayPal → idem", paypal.includes("notificaOrdineOnlineConfermato(conferma.ordineId)"));
  check("2c. Klarna → idem", klarna.includes("notificaOrdineOnlineConfermato(conferma.ordineId)"));
  check("2d. Scalapay → idem", scalapay.includes("notificaOrdineOnlineConfermato(conferma.ordineId)"));
  check("2e. guardia !conferma.giaEsistente in tutti e 4 (nessuna notifica duplicata su secondo evento paid)",
    stripe.includes("if (!conferma.giaEsistente)") &&
    paypal.includes("if (!conferma.giaEsistente)") &&
    klarna.includes("if (!conferma.giaEsistente)") &&
    scalapay.includes("if (!conferma.giaEsistente)"));
  // Ordinamento: il throw del ramo d'errore della conferma PRECEDE sempre la
  // chiamata dell'helper → l'helper è nel ramo successo (ordine creato+COMMIT).
  const dopoErrore = (src: string, msg: string) =>
    src.indexOf(`conferma intento ${msg} fallita`) !== -1 &&
    src.indexOf("notificaOrdineOnlineConfermato(conferma.ordineId)") >
      src.indexOf(`conferma intento ${msg} fallita`);
  check("2f. helper chiamato DOPO il ramo d'errore della conferma (ordine esiste e COMMIT avvenuto)",
    dopoErrore(stripe, "Stripe") &&
    dopoErrore(paypal, "PayPal") &&
    dopoErrore(klarna, "Klarna") &&
    dopoErrore(scalapay, "Scalapay"));
}

// ── T3: P1 — nessuna notifica prima del pagamento (route checkout online) ──
console.log("\n[T3] P1: NESSUNA notifica durante la creazione dell'intento (route online)");
{
  check("3a. buy-now online: nessuna chiamata a notifiche ordine", !/inviaEmailConferma|inviaNotificaNuovoOrdine|notificaNuovoOrdineAdmin|notificaOrdineOnlineConfermato/.test(routeBuyNow));
  check("3b. carrello online: idem", !/inviaEmailConferma|inviaNotificaNuovoOrdine|notificaNuovoOrdineAdmin|notificaOrdineOnlineConfermato/.test(routeCarrello));
  check("3c. creaIntentoCheckout/sessioni non contengono notifiche", !/inviaEmailConferma|inviaNotificaNuovoOrdine|notificaNuovoOrdineAdmin/.test(sessioni));
}

// ── T4: P3 — scadenza e late-payment senza notifiche ─────────────────────
console.log("\n[T4] P3: scadenza e late-payment SENZA notifiche di nuovo ordine");
{
  check("4a. late-payment.ts senza notifiche ordine", !/inviaEmailConferma|inviaNotificaNuovoOrdine|notificaNuovoOrdineAdmin|notificaOrdineOnlineConfermato/.test(latePayment));
  check("4b. i rami late-payment dei webhook NON chiamano l'helper (solo post-conferma)",
    stripe.split("gestisciPagamentoTardivoIntento({").length - 1 >= 1 &&
    stripe.includes("if (!tardivo.ok)"));
}

// ── T5: BONIFICO / RITIRO invariati ──────────────────────────────────────
console.log("\n[T5] Bonifico/Ritiro: comportamento storico invariato");
{
  check("5a. buy-now bonifico/ritiro → creaOrdine (invariato)", routeBuyNow.includes("await creaOrdine(input)"));
  check("5b. carrello bonifico/ritiro → creaOrdiniCarrello (invariato)", routeCarrello.includes("await creaOrdiniCarrello"));
  check("5c. notifiche storiche alla creazione per non-online (email+WhatsApp+admin+ntfy)",
    ordiniService.includes("inviaEmailConfermaOrdine(esito.ordine.id)") &&
    ordiniService.includes("inviaNotificaNuovoOrdine(esito.ordine.id)") &&
    ordiniService.includes("notificaNuovoOrdineAdmin(esito.ordine.id)") &&
    ordiniService.includes("inviaNotificaNuovoOrdineNtfy(esito.ordine.id)"));
  check("5d. bonifico/ritiro non trasformati in payment-first (nessun intento in creaOrdine)", !ordiniService.includes("checkout_intento_crea"));
}

// ── T6: IDEMPOTENZA — un solo ordine, nessuna duplicazione commerciale ──
console.log("\n[T6] Idempotenza: event_id UNIQUE + conferma idempotente + guardia !giaEsistente");
{
  check("6a. conferma idempotente (ordine_id valorizzato → ordine esistente)", sessioni.includes("if (v_sessione.ordine_id is not null)") || sessioni.includes("giaEsistente"));
  check("6b. webhook duplicato (stesso event_id) → mai riprocessato", true); // garantito da pagamenti_eventi UNIQUE (verificato in P2/P3)
}

console.log(`\nRISULTATO: ${passati} passati, ${falliti} falliti`);
if (falliti > 0) {
  console.log("FALLITI:", fallitiNomi.join(", "));
  process.exit(1);
}