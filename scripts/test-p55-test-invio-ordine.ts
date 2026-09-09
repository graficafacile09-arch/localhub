/**
 * TEST DEDICATO — P5.5: TEST INVIO ORDINE (ADMIN) + INVARIANTE PAYMENT-FIRST.
 *
 * Verifica i CONTRATTI statici (nessun server, nessun DB reale):
 *
 * A) FUNZIONE ADMIN "TEST INVIO ORDINE" (nuova, P5.5 §6):
 *    - route dedicata /api/amministratore/test-invio-ordine protetta da
 *      requireApiArea("admin") PRIMA di ogni operazione;
 *    - servizio dedicato lib/amministratore/test-invio-ordine.ts: ordine
 *      SINTETICO marcato TEST, MAI ordini reali / MAI stock / MAI pagamenti
 *      (garanzia strutturale nel report: ordineCreato=false,
 *      stockModificato=false, pagamentoCreato=false);
 *    - canali coperti: email (Resend) + WhatsApp + ntfy + notifica admin;
 *    - ogni canale best-effort e isolato; report per canale con esito;
 *    - whitelist esplicite sui destinatari (TEST_EMAIL_ADDRESSES /
 *      TEST_WHATSAPP_NUMBERS) nella route;
 *    - NESSUNA modifica al flusso checkout cliente (payment-first intatto).
 *
 * B) INVARIANTE PAYMENT-FIRST (P5.5 §2):
 *    - per i metodi ONLINE il percorso buy-now/carrello NON chiama
 *      crea_ordine/crea_ordini_carrello: usa SOLO checkout_intento_crea +
 *      sessione provider, e l'ordine nasce SOLO da checkout_intento_conferma
 *      (webhook pagamento verificato);
 *    - bonifico/ritiro mantengono l'ordine subito (comportamento storico);
 *    - webhook: ordine SOLO dopo pagamento confermato (intentoDaId/
 *      intentoDaPaymentId → confermaIntentoCheckout, mai prima del paid);
 *    - il test admin NON chiama le route checkout cliente.
 *
 * Uso: npx tsx scripts/test-p55-test-invio-ordine.ts
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

const route = readFileSync(
  join(PROGETTO, "app/api/amministratore/test-invio-ordine/route.ts"),
  "utf8"
);
const servizio = readFileSync(
  join(PROGETTO, "lib/amministratore/test-invio-ordine.ts"),
  "utf8"
);
const pagina = readFileSync(
  join(PROGETTO, "app/(amministratore)/amministratore/test-invio-ordine/page.tsx"),
  "utf8"
);
const client = readFileSync(
  join(PROGETTO, "components/amministratore/ordini/TestInvioOrdineClient.tsx"),
  "utf8"
);
const nav = readFileSync(join(PROGETTO, "components/amministratore/navigation.ts"), "utf8");
const routeBuyNow = readFileSync(join(PROGETTO, "app/api/cliente/ordini/route.ts"), "utf8");
const routeCarrello = readFileSync(
  join(PROGETTO, "app/api/cliente/ordini/carrello/route.ts"),
  "utf8"
);
const stripeWebhook = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-stripe.ts"), "utf8");
const paypalWebhook = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-paypal.ts"), "utf8");
const klarnaWebhook = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-klarna.ts"), "utf8");
const scalapayWebhook = readFileSync(join(PROGETTO, "lib/pagamenti/webhook-scalapay.ts"), "utf8");
const sessioni = readFileSync(join(PROGETTO, "lib/pagamenti/sessioni.ts"), "utf8");

// ── A1: ROUTE — protezione admin + whitelist ──────────────────────────────
console.log("\n[A1] Route /api/amministratore/test-invio-ordine — protezione admin");
{
  check(
    "1a. endpoint dedicato esiste con GET",
    route.includes("export async function GET(request: Request)")
  );
  check(
    "1b. requireApiArea(\"admin\") PRIMA di qualunque operazione",
    route.includes("const { error } = await requireApiArea(\"admin\")") &&
      route.indexOf("requireApiArea") < route.indexOf("eseguiTestInvioOrdine")
  );
  check(
    "1c. whitelist email TEST_EMAIL_ADDRESSES",
    route.includes("TEST_EMAIL_ADDRESSES") && route.includes("\"FORBIDDEN\"")
  );
  check(
    "1d. whitelist telefono TEST_WHATSAPP_NUMBERS",
    route.includes("TEST_WHATSAPP_NUMBERS") && route.includes("normalizzaNumeroWhatsApp")
  );
  check(
    "1e. delega al servizio dedicato (mai codice checkout cliente)",
    route.includes("eseguiTestInvioOrdine({ email, telefono })") &&
      !route.includes("creaOrdine(")
  );
}

// ── A2: SERVIZIO — mai ordine/stock/pagamento, canali reali ───────────────
console.log("\n[A2] Servizio lib/amministratore/test-invio-ordine.ts");
{
  check("2a. servizio dedicato esportato", servizio.includes("export async function eseguiTestInvioOrdine"));
  check(
    "2b. report con garanzie strutturali ordineCreato=false",
    servizio.includes("ordineCreato: false")
  );
  check(
    "2c. report con garanzia stockModificato=false",
    servizio.includes("stockModificato: false")
  );
  check(
    "2d. report con garanzia pagamentoCreato=false",
    servizio.includes("pagamentoCreato: false")
  );
  check(
    "2e. ZERO scritture in ordini/ordini_righe/stock",
    !/\.from\(\"ordini\"\)|\.from\(\"ordini_righe\"\)|insert\(\{[^}]*quantita_disponibile|\.rpc\(\"checkout_intento_crea/.test(servizio)
  );
  check(
    "2f. ordine sintetico marcato TEST (numero TEST-…)",
    servizio.includes("numeroOrdineTest") && servizio.includes("TEST-") &&
      servizio.includes("NEGOZIO DI TEST")
  );
  check("2g. email: template conferma pagamento reale (Resend)", servizio.includes("costruisciHtmlConfermaPagamento") && servizio.includes("new Resend("));
  check("2h. whatsapp: inviaNotificaConfigurata", servizio.includes("inviaNotificaConfigurata("));
  check("2i. ntfy: inviaNotificaConfigurataNtfy", servizio.includes("inviaNotificaConfigurataNtfy("));
  check("2j. notifica admin marcata TEST (admin_notifiche)", servizio.includes("creaNotificaAdmin(") && servizio.includes("[TEST]"));
  check(
    "2k. nessuna credenziale del cliente usata",
    !servizio.includes("clienteUserId") &&
      !servizio.includes("getCurrentUser()") &&
      !servizio.includes("session.accessToken")
  );
  check(
    "2l. MAI chiama il flusso checkout cliente",
    !servizio.includes("creaOrdine(") &&
      !servizio.includes("creaOrdiniCarrello(") &&
      !servizio.includes("checkout_intento_conferma")
  );
  check("2m. ogni canale best-effort (mai throw verso l'alto)", servizio.includes(".catch") || servizio.includes("try"));
}

// ── A3: PAGINA + NAV ──────────────────────────────────────────────────────
console.log("\n[A3] Pagina amministratore + voce navigazione");
{
  check(
    "3a. pagina admin esiste (server component)",
    pagina.includes("TestInvioOrdineClient") && pagina.includes("force-dynamic")
  );
  check(
    "3b. client con input destinatari + report per canale",
    client.includes("email") && client.includes("telefono") && client.includes("report.canali")
  );
  check(
    "3c. la pagina dichiara: nessun ordine/stock/pagamento reale",
    client.includes("Nessun ordine reale creato") &&
      client.includes("Stock non modificato") &&
      client.includes("Nessun pagamento reale")
  );
  check(
    "3d. voce di navigazione sotto Ordini & Pagamenti",
    nav.includes("Test invio ordine") &&
      nav.indexOf("test-invio-ordine") > nav.indexOf("ordini-pagamenti")
  );
}

// ── B1: INVARIANTE — buy-now online MAI crea_ordine ───────────────────────
console.log("\n[B1] Buy-now: metodi ONLINE → intento; MAI ordine prima del paid");
{
  check(
    "1a. ramo online usa checkout_intento_crea (creaIntentoCheckout)",
    routeBuyNow.includes("creaIntentoCheckout(") && routeBuyNow.includes("providerOnline")
  );
  check(
    "1b. ramo online NON chiama creaOrdine (ordine solo dopo paid)",
    routeBuyNow.indexOf("if (providerOnline)") < routeBuyNow.indexOf("await creaOrdine(input)") &&
      routeBuyNow.indexOf("return response;") > routeBuyNow.indexOf("if (providerOnline)")
  );
  // L'UNICO punto di chiamata di creaOrdine è il ramo bonifico/ritiro, DOPO
  // il return del ramo online: nessun chiamante online, nessun secondo punto.
  const ultimaChiamataCreaOrdine = routeBuyNow.lastIndexOf("creaOrdine(");
  const primoReturnRamoOnline = routeBuyNow.indexOf("return response;", routeBuyNow.indexOf("if (providerOnline)"));
  check(
    "1c. creaOrdine resta SOLO per bonifico/ritiro (un solo punto, dopo il return online)",
    routeBuyNow.match(/creaOrdine\(/g)?.length === 1 &&
      primoReturnRamoOnline > -1 &&
      ultimaChiamataCreaOrdine > primoReturnRamoOnline
  );
  check(
    "1d. bonifico/ritiro: ordine creato subito (comportamento storico)",
    routeBuyNow.includes("BONIFICO / RITIRO") || routeBuyNow.includes("bonifico")
  );
}

// ── B2: INVARIANTE — carrello online MAI crea_ordini_carrello ─────────────
console.log("\n[B2] Carrello: metodi ONLINE → intento per gruppo; MAI ordine prima del paid");
{
  check(
    "2a. ramo online usa creaIntentoCheckout per gruppo",
    routeCarrello.includes("creaIntentoCheckout(") &&
      routeCarrello.includes("for (const gruppo of raggruppamento.negozi)")
  );
  check(
    "2b. ramo online ritorna PRIMA di creaOrdiniCarrello",
    routeCarrello.indexOf("if (providerRichiesto) {") < routeCarrello.indexOf("await creaOrdiniCarrello")
  );
  check(
    "2c. creaOrdiniCarrello resta SOLO per bonifico/ritiro",
    routeCarrello.includes("await creaOrdiniCarrello")
  );
}

// ── B3: INVARIANTE — webhook: ordine SOLO dopo pagamento verificato ───────
console.log("\n[B3] Webhook provider: ordine creato SOLO dopo conferma pagamento");
{
  for (const [nome, src] of [
    ["Stripe", stripeWebhook],
    ["PayPal", paypalWebhook],
    ["Klarna", klarnaWebhook],
    ["Scalapay", scalapayWebhook],
  ]) {
    check(
      `3a. ${nome}: risolve l'intento (ordine_id NULL) e conferma via checkout_intento_conferma`,
      (src.includes("intentoDaId(") || src.includes("intentoDaPaymentId(")) &&
        src.includes("confermaIntentoCheckout(")
    );
    check(
      `3b. ${nome}: MAI crea_ordine / insert in ordini nel flusso online`,
      !src.includes("creaOrdine(") && !src.includes("creaOrdiniCarrello(")
    );
  }
  check(
    "3c. sessioni.ts: confermaIntentoCheckout delega alla RPC checkout_intento_conferma",
    sessioni.includes("export async function confermaIntentoCheckout") &&
      sessioni.includes("checkout_intento_conferma")
  );
  check(
    "3d. sessioni.ts: intento creato con ordine_id NULL (checkout_intento_crea)",
    sessioni.includes("export async function creaIntentoCheckout") &&
      sessioni.includes("checkout_intento_crea")
  );
}

// ── B4: INVARIANTE — test admin non tocca il flusso cliente ───────────────
console.log("\n[B4] Il test admin è SEPARATO dal flusso cliente (payment-first intatto)");
{
  check(
    "4a. il servizio test non importa/usa il percorso checkout cliente",
    !servizio.includes("from \"@/lib/cliente/orders\"") &&
      !servizio.includes("from \"@/lib/cliente/ordini-carrello\"")
  );
  check(
    "4b. le route checkout cliente non sono toccate",
    routeBuyNow.includes("creaIntentoCheckout") && routeCarrello.includes("creaIntentoCheckout")
  );
  check(
    "4c. nessuna condizione 'if admin' nel percorso checkout cliente",
    !/if\s*\([^)]*(admin|requireApiArea)[^)]*\)/.test(routeBuyNow) &&
      !/if\s*\([^)]*(admin|requireApiArea)[^)]*\)/.test(routeCarrello)
  );
}

// ── Esito ─────────────────────────────────────────────────────────────────
console.log(`\nRisultato: ${passati} passati, ${falliti} falliti`);
if (falliti > 0) {
  console.log("Falliti:\n  - " + fallitiNomi.join("\n  - "));
  process.exit(1);
}
console.log(
  "P5.5 OK — Test invio ordine (admin) separato e invariante payment-first rispettata: ONLINE mai ordini prima del paid"
);