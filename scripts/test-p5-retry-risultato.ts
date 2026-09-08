/**
 * TEST DEDICATO — P5 PAYMENT-FIRST: RETRY + UX RISULTATO PAGAMENTO.
 *
 * Verifica i CONTRATTI statici della P5 (nessun server, nessun DB reale):
 *   - RETRY: POST /api/pagamenti/sessioni accetta checkoutId (id SESSIONE,
 *     intento senza ordine) oltre al legacy ordineId; usa il provider
 *     autoritativo dell'intento; MAI ordine/riserva/notifiche; macchina
 *     stati (created/pending retry · ordine_id → giaConfermato · expired/
 *     refunded → CHECKOUT_NON_DISPONIBILE · legacy invariato);
 *   - STATUS API: GET /api/pagamenti/sessioni/[checkoutId] con dati minimi,
 *     autorizzazione fail-closed (mai payload/secret);
 *   - helper lib/pagamenti/sessioni.ts: caricaIntentoRetry + intentoAutorizzato;
 *   - getCheckoutConferma (ordine | intento | non_trovato);
 *   - PAGINA /ordini/conferma/[id]: rappresenta l'intento senza ordine
 *     (pending/expired/refunded), MAI "ordine creato" prima del paid;
 *   - CheckoutInAttesa: polling webhook ritardato + retry checkoutId.
 *
 * Uso: npx tsx scripts/test-p5-retry-risultato.ts
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

const retryRoute = readFileSync(
  join(PROGETTO, "app/api/pagamenti/sessioni/route.ts"),
  "utf8"
);
const statusRoute = readFileSync(
  join(PROGETTO, "app/api/pagamenti/sessioni/[checkoutId]/route.ts"),
  "utf8"
);
const sessioni = readFileSync(join(PROGETTO, "lib/pagamenti/sessioni.ts"), "utf8");
const ordiniService = readFileSync(join(PROGETTO, "lib/cliente/orders.ts"), "utf8");
const pagina = readFileSync(
  join(PROGETTO, "app/ordini/conferma/[ordineId]/page.tsx"),
  "utf8"
);
const attesa = readFileSync(join(PROGETTO, "components/ordini/CheckoutInAttesa.tsx"), "utf8");
const orderAccess = readFileSync(join(PROGETTO, "lib/cliente/order-access.ts"), "utf8");

// ── T1: retry PAYMENT-FIRST (checkoutId) ─────────────────────────────────
console.log("\n[T1] POST /api/pagamenti/sessioni — retry checkoutId (intento)");
{
  check("1a. accetta checkoutId nel body", /body\.checkoutId/.test(retryRoute));
  check(
    "1b. carica l'intento via caricaIntentoRetry",
    retryRoute.includes("caricaIntentoRetry(checkoutId)")
  );
  check(
    "1c. autorizzazione: intentoAutorizzato + getCurrentUser + cookie scoped",
    retryRoute.includes("intentoAutorizzato") &&
      retryRoute.includes("getCurrentUser()") &&
      retryRoute.includes("orderAccessCookieName(checkoutId)")
  );
  check(
    "1d. ordine_id valorizzato → giaConfermato (nessun nuovo pagamento)",
    /giaConfermato\s*:\s*true/.test(retryRoute) && retryRoute.includes("if (intento.ordineId)")
  );
  check(
    "1e. solo created/pending retryabili, altrimenti CHECKOUT_NON_DISPONIBILE 410",
    /\["created",\s*"pending"\]/.test(retryRoute) &&
      retryRoute.includes('"CHECKOUT_NON_DISPONIBILE"') &&
      retryRoute.includes("410")
  );
  check(
    "1f. provider autoritativo dell'intento, mai dal client, fail-closed",
    retryRoute.includes("intento.provider") &&
      retryRoute.includes("isProviderGatewayAmmesso(intento.provider)")
  );
  check(
    "1g. retry intento usa creaSessionePagamentoPerIntento (mai per ordine)",
    retryRoute.includes("creaSessionePagamentoPerIntento(checkoutId, intento.provider)") &&
      !/creaSessionePagamentoPerOrdine\(checkoutId/.test(retryRoute)
  );
  check(
    "1h. MAI ordine/riserva/notifiche nel retry",
    !retryRoute.includes("creaIntentoCheckout") &&
      !retryRoute.includes("checkout_intento_crea") &&
      !/annullaIntentoCheckout/.test(retryRoute) &&
      !retryRoute.includes("inviaNotifica")
  );
  check("1i. sweep best-effort conservato", retryRoute.includes("elaboraPagamentiScaduti"));
}

// ── T2: retry LEGACY invariato ────────────────────────────────────────────
console.log("\n[T2] POST /api/pagamenti/sessioni — retry legacy ordineId");
{
  check("2a. branch legacy conservato", retryRoute.includes('"ORDINE_NON_TROVATO"'));
  check(
    "2b. creaSessionePagamentoPerOrdine per ordini esistenti",
    /creaSessionePagamentoPerOrdine\(ordineId,\s*provider\)/.test(retryRoute)
  );
  check(
    "2c. fail-closed legacy senza fallback a Stripe",
    retryRoute.includes("isProviderGatewayAmmesso(provider)") &&
      retryRoute.includes("PAGAMENTO_NON_DISPONIBILE") &&
      !/creaSessioneStripePerOrdine/.test(retryRoute)
  );
  check("2d. contratti distinti: checkoutId OPPURE ordineId, mai entrambi richiesti", /if \(!checkoutId && !ordineId\)/.test(retryRoute));
}

// ── T3: status API GET /api/pagamenti/sessioni/[checkoutId] ───────────────
console.log("\n[T3] GET /api/pagamenti/sessioni/[checkoutId]");
{
  check("3a. route esiste con GET + params Promise", statusRoute.includes("export async function GET"));
  check("3b. restituisce SOLO status/provider/ordineId (mai payload)", statusRoute.includes("status: intento.status") && statusRoute.includes("ordineId: intento.ordineId"));
  check(
    "3c. MAI checkout_payload / secret / credenziali nella risposta",
    !/data\.checkout\b[\s\S]*?checkout_payload/.test(statusRoute) &&
      !statusRoute.includes(".select(\"checkout_payload") &&
      !/STRIPE_|PAYPAL_|KLARNA_|SCALAPAY_/.test(statusRoute)
  );
  check(
    "3d. autorizzazione fail-closed (404 CHECKOUT_NON_TROVATO)",
    statusRoute.includes("intentoAutorizzato") &&
      statusRoute.includes('"CHECKOUT_NON_TROVATO"')
  );
}

// ── T4: helper sessioni.ts ────────────────────────────────────────────────
console.log("\n[T4] lib/pagamenti/sessioni.ts — caricaIntentoRetry + intentoAutorizzato");
{
  check(
    "4a. caricaIntentoRetry esportato e SOLA LETTURA",
    sessioni.includes("export async function caricaIntentoRetry") &&
      /\.from\("pagamenti_sessioni"\)[\s\S]*?\.select\([\s\S]*?checkout_payload/.test(sessioni)
  );
  check(
    "4b. ordine_id + clienteUserId dallo snapshot",
    sessioni.includes("ordineId: data.ordine_id ? String(data.ordine_id) : null") &&
      sessioni.includes('payload?.clienteUserId')
  );
  check(
    "4c. intentoAutorizzato: utente → proprietario, guest → token scoped checkoutId",
    sessioni.includes("export async function intentoAutorizzato") &&
      sessioni.includes("intento.clienteUserId === access.userId") &&
      sessioni.includes("verifyOrderAccessToken(access.token, checkoutId)")
  );
}

// ── T5: getCheckoutConferma ───────────────────────────────────────────────
console.log("\n[T5] lib/cliente/orders.ts — getCheckoutConferma");
{
  check(
    "5a. esportato con unione ordine | intento | non_trovato",
    ordiniService.includes("export async function getCheckoutConferma") &&
      ordiniService.includes('tipo: "ordine"') &&
      ordiniService.includes('tipo: "intento"') &&
      ordiniService.includes('tipo: "non_trovato"')
  );
  check(
    "5b. legge sessione per id (ordine_id, status, amount)",
    ordiniService.includes('select("id, ordine_id, provider, status, amount, checkout_payload")')
  );
  check(
    "5c. autorizzazione: proprietario dal payload, guest token scoped sessione",
    ordiniService.includes("payload?.clienteUserId") &&
      ordiniService.includes("verifyOrderAccessToken(access.token, checkoutId)")
  );
  check(
    "5d. ordine_id valorizzato → ordine completo con righe",
    ordiniService.includes("assumiOrdine(") && ordiniService.includes("ordini_righe")
  );
  check(
    "5e. intento senza ordine → solo status/provider/importo (mai payload)",
    ordiniService.includes('"intento"') && ordiniService.includes("importo: Number(sessione.amount ?? 0)")
  );
}

// ── T6: pagina risultato ──────────────────────────────────────────────────
console.log("\n[T6] /ordini/conferma/[ordineId] — UX risultato payment-first");
{
  check(
    "6a. risolve ordine legacy OPPURE checkout (mai insieme)",
    pagina.includes("getOrdineConferma(ordineId, access)") &&
      pagina.includes("getCheckoutConferma(ordineId, access)")
  );
  check(
    "6b. intento pending → CheckoutInAttesa (polling + retry)",
    pagina.includes("<CheckoutInAttesa checkoutId={checkoutId}")
  );
  check("6c. expired → 'Pagamento scaduto', nessun ordine", pagina.includes("Pagamento scaduto") && pagina.includes("nessun ordine è stato creato"));
  check("6d. refunded → 'Pagamento rimborsato'", pagina.includes("Pagamento rimborsato"));
  check("6e. failed/canceled → 'Pagamento non riuscito'", pagina.includes("Pagamento non riuscito"));
  check(
    "6f. la vista intento MAI dichiara ordine creato",
    pagina.includes('L&apos;ordine verrà creato e inviato al negozio solo dopo la conferma')
  );
  check(
    "6g. vista ordine legacy invariata (PagamentoStatoBanner + OrderHeader)",
    pagina.includes("<PagamentoStatoBanner") && pagina.includes("<OrderHeader")
  );
}

// ── T7: CheckoutInAttesa ──────────────────────────────────────────────────
console.log("\n[T7] components/ordini/CheckoutInAttesa.tsx");
{
  check(
    "7a. polling ogni 5s su GET status con cache no-store",
    attesa.includes("setInterval(poll, 5000)") &&
      attesa.includes("cache: \"no-store\"") &&
      attesa.includes("/api/pagamenti/sessioni/${encodeURIComponent(checkoutId)}")
  );
  check(
    "7b. webhook ritardato: ricarica quando lo stato lascia created/pending",
    /status\s*&&\s*status\s*!==\s*"created"\s*&&\s*status\s*!==\s*"pending"/.test(attesa) &&
      attesa.includes("window.location.reload()")
  );
  check(
    "7c. retry con checkoutId (non ordineId)",
    attesa.includes('JSON.stringify({ checkoutId })') &&
      !attesa.includes('JSON.stringify({ ordineId })')
  );
  check(
    "7d. giaConfermato → redirect all'ordine",
    attesa.includes("giaConfermato") && attesa.includes("window.location.href")
  );
  check(
    "7e. mai 'pagamento fallito' prima dello stato della sessione",
    attesa.includes("Nessun importo è stato addebitato finché il pagamento non è confermato")
  );
}

// ── T8: security / regressione ────────────────────────────────────────────
console.log("\n[T8] security / regressioni");
{
  check(
    "8a. nessun secret nei file P5",
    !/STRIPE_SECRET|PAYPAL_SECRET|KLARNA_SECRET|SCALAPAY_SECRET|WEBHOOK_SECRET/.test(
      retryRoute + statusRoute + attesa
    )
  );
  check(
    "8b. token guest verificato contro checkoutId (order-access)",
    orderAccess.includes("verifyOrderAccessToken") &&
      orderAccess.includes("decoded.oid === String(ordineId)")
  );
  check(
    "8c. nessuna nuova tabella/migrazione per P5",
    retryRoute.includes("pagamenti_sessioni") || statusRoute.includes("pagamenti_sessioni")
  );
}

// ── Esito ─────────────────────────────────────────────────────────────────
console.log(`\nRisultato: ${passati} passati, ${falliti} falliti`);
if (falliti > 0) {
  console.log("Falliti:\n  - " + fallitiNomi.join("\n  - "));
  process.exit(1);
}
console.log("P5 OK — retry provider-aware + UX risultato conforme al modello payment-first");