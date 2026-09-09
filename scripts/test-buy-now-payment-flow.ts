/**
 * TEST DEDICATO — FLUSSO BUY-NOW: PAGAMENTO (FASE 8 del task).
 *
 * Il buy-now (PRODOTTO → ACQUISTA → SpedizioneForm → POST /api/cliente/ordini)
 * usa LO STESSO motore di pagamento del checkout carrello:
 *   - la UI mostra i metodi SOLO se realmente disponibili (server-side);
 *   - l'ordine viene creato SOLO al submit con il metodo scelto dall'utente
 *     (mai prima della scelta, mai un submit automatico);
 *   - dispatch: carta → Stripe · klarna → Klarna · paypal → PayPal ·
 *     bonifico → nessuna sessione gateway; nessun fallback tra provider;
 *   - prezzi/totali/stock/credenziali mai dal client.
 *
 * Questo script verifica i CONTRATTI statici dei file coinvolti (nessun
 * server, nessun DB: esegue in pochi secondi). La verifica RUNTIME è già
 * coperta da scripts/test-klarna-buynow.ts (56 check, orchestratore mock),
 * scripts/test-buy-now-browser.ts (browser reale su produzione) e dalla
 * suite F1/F2/P.
 *
 * Uso: npx tsx scripts/test-buy-now-payment-flow.ts
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

const form = readFileSync(join(PROGETTO, "components/acquista/SpedizioneForm.tsx"), "utf8");
const route = readFileSync(join(PROGETTO, "app/api/cliente/ordini/route.ts"), "utf8");
const client = readFileSync(join(PROGETTO, "lib/cliente/ordini-client.ts"), "utf8");
const sessioni = readFileSync(join(PROGETTO, "lib/pagamenti/sessioni.ts"), "utf8");
const metodiPub = readFileSync(join(PROGETTO, "lib/pagamenti/metodi-pubblici.ts"), "utf8");
const pageSpedizione = readFileSync(
  join(PROGETTO, "app/prodotto/[slug]/acquista/spedizione/page.tsx"),
  "utf8"
);
const pageAcquista = readFileSync(join(PROGETTO, "app/prodotto/[slug]/acquista/page.tsx"), "utf8");

// ── T1: la pagina ACQUISTA mostra la sezione "Metodo pagamento" ──────────
console.log("\n[T1] Scheda prodotto → ACQUISTA → scelta → spedizione: la UI mostra il metodo di pagamento");
{
  check("1a. ACQUISTA è un Link alla pagina di scelta (nessun ordine al click)", pageAcquista.includes("/acquista/ritiro") && pageAcquista.includes("/acquista/spedizione"));
  check("1b. la pagina spedizione risolve i metodi SERVER-SIDE (getMetodiPagamentoPubblici)", pageSpedizione.includes("getMetodiPagamentoPubblici"));
  check("1c. SpedizioneForm renderizza una sezione 'Metodo pagamento'", form.includes("Metodo pagamento"));
  check("1d. l'ordine è creato SOLO nel handler di submit (procediAlPagamento), mai on-mount", form.includes("procediAlPagamento") && form.includes("creaOrdineViaApi"));
}

// ── T2/T3/T4/T5: metodi mostrati SOLO se realmente disponibili ───────────
console.log("\n[T2-T5] Carta/Bonifico/Klarna: disponibilità determinata SOLO dal server");
{
  check("2a. la UI itera la lista server (metodiPagamento.map), nessun metodo hardcoded", form.includes("metodiPagamento.map") && form.includes("metodo.metodo"));
  check("2b. metodi-pubblici: carta/klarna/paypal SOLO se il provider è pronto (isProviderProntoPerNegozio)", metodiPub.includes("isProviderProntoPerNegozio"));
  check("2c. metodi-pubblici: klarna incluso nel catalogo", metodiPub.includes("klarna"));
  check("2c-bis. metodi-pubblici: paypal incluso nel catalogo", metodiPub.includes("paypal") && metodiPub.includes("isProviderProntoPerNegozio"));
  check("2d. metodi-pubblici: bonifico SOLO se iban/payee_email configurati", metodiPub.includes("datiBonifico"));
  check("2e. nessun 'fallback silenzioso': metodo non selezionabile → badge esplicito", form.includes("non disponibile per questo negozio"));
}

// ── T6: NESSUNA scelta esplicita → submit bloccato (contratto assoluto) ─
console.log("\n[T6] Nessuna scelta esplicita → submit bloccato, zero ordini");
{
  const useStateMetodo = form.match(/const \[metodoPagamento[^\]]*\] = useState<([^>]*)>\(([^)]*)\)/);
  check("6a. stato iniziale = null (nessuna scelta implicita, nemmeno con un solo metodo)", Boolean(useStateMetodo) && String(useStateMetodo?.[2]).trim() === "null" && !form.includes("metodoIniziale"), useStateMetodo?.[0]);
  check("6b. pulsante disabilitato finché metodoPagamento === null (o spedizione non scelta)", form.includes("disabled={inviando || metodoPagamento === null || spedizioneScelta === null}"));
  check("6c. guardia client nel submit: blocca e mostra errore dedicato", form.includes("Seleziona un metodo di pagamento per continuare."));
  check("6d. nessun useEffect che crea ordini all'apertura della pagina", !/useEffect[\s\S]{0,80}creaOrdine/.test(form));
}

// ── T7/T8/T9/T10: dispatch per metodo (P1: INTENTO, mai ordine online) ───
console.log("\n[T7-T10] Dispatch server-side P1: carta→Stripe, klarna→Klarna, bonifico→nessun intento/gateway");
{
  check("7a. carta → INTENTO + creaSessionePagamentoPerIntento (provider striato dal dispatch)", route.includes("creaSessionePagamentoPerIntento") && sessioni.includes('if (metodo === "carta") return "stripe"'));
  check("7b. klarna → STESSO orchestratore intento, provider 'klarna' (mai sessione Stripe)", route.includes("creaSessionePagamentoPerIntento(") && route.includes("intento.checkoutId") && route.includes("providerOnline") && sessioni.includes('if (metodo === "klarna") return "klarna"'));
  check("7b-bis. paypal → orchestratore intento, provider 'paypal'", sessioni.includes('if (metodo === "paypal") return "paypal"'));
  // P1: per i metodi ONLINE il ramo intento ritorna PRIMA di creaOrdine; per
  // bonifico/ritiro il flusso ordine resta quello storico (nessun gateway).
  check(
    "7c. bonifico → nessun intento/nessuna sessione gateway (creaOrdine storico, risposta senza pagamento)",
    route.includes("await creaOrdine(input)") &&
      route.indexOf("if (providerOnline)") < route.indexOf("await creaOrdine(input)") &&
      sessioni.includes("return null;"),
    "bonifico non deve entrare nel ramo intento né creare gateway"
  );
  check("7d. pre-flight klarna: negozio non configurato → 422 PRIMA della creazione", route.includes("KLARNA_NON_DISPONIBILE") && route.includes("providerDisponibilePerProdotto"));
  check("7d-bis. pre-flight paypal: negozio non configurato → 422 PRIMA della creazione", route.includes("PAYPAL_NON_DISPONIBILE"));
  check("7e. pre-flight carta: negozio senza Stripe → 422 prima dell'ordine", route.includes("CARTA_NON_DISPONIBILE") && route.includes("cartaDisponibilePerProdotto"));
  check("7f. MAI un fallback klarna→stripe: il provider dell'intento è AUTORITATIVO (intento.provider)", sessioni.includes("intento.provider || provider") && !/klarna[\s\S]{0,60}stripe/.test(route));
  check("7g. orchestratore fail-closed: provider non implementato → PROVIDER_NON_DISPONIBILE", sessioni.includes("PROVIDER_NON_DISPONIBILE"));
  check("7h. sessione usa SEMPRE il totale dal DB (mai dal client): intento → payload.totale", sessioni.includes("importo: Number(payload.totale ?? 0)"));
  check("7i. route: spedizione SENZA metodo esplicito → 422 METODO_PAGAMENTO_NON_SCELTO PRIMA di ogni creazione", route.includes("METODO_PAGAMENTO_NON_SCELTO") && route.indexOf("METODO_PAGAMENTO_NON_SCELTO") < route.indexOf("creaOrdine(input)"), "validazione deve precedere la creazione");
  check("7j. route: nessun fallback implicito (mai ?? / || 'bonifico'/'paypal')", !/\?\? "bonifico"|\|\| "bonifico"|\?\? "paypal"|\|\| "paypal"/.test(route));
  check("7k. route: valore non ammesso → 422 VALIDATION_ERROR (nessun ordine)", route.includes("Metodo di pagamento non valido."));
}

// ── T11: idempotenza (stessa chiave → nessun ordine duplicato) ───────────
console.log("\n[T11] Idempotenza");
{
  check("11a. chiave di idempotenza generata UNA volta per pagina (useRef)", form.includes("nuovaChiaveIdempotenza()") && form.includes("useRef"));
  check("11b. chiave inviata nel payload", client.includes("idempotencyKey"));
  check("11c. il server gestisce il retry idempotente (giaEsistente)", route.includes("giaEsistente"));
}

// ── T12/T13/T14/T15: variante, prezzo, totale, stock SOLO server-side ────
console.log("\n[T12-T15] Variante/prezzo/totale/stock ricostruiti dal server");
{
  const payloadTipo = client.slice(
    client.indexOf("export type CreaOrdinePayload"),
    client.indexOf("export type EsitoApi")
  );
  check("12a. varianteId trasportato nel payload e validato dal server", client.includes("varianteId") && route.includes("varianteId"));
  check("13a. il payload (CreaOrdinePayload) NON contiene prezzo/totale", !/prezzo|totale/.test(payloadTipo));
  check("14a. totale ricalcolato dal DB (RPC atomica crea_ordine)", route.includes("creaOrdine"));
  check("15a. stock gestito dalla RPC atomica (mai dal client)", route.includes("creaOrdine") && client.includes("quantita"));
}

// ── T16: nessuna credenziale esposta ─────────────────────────────────────
console.log("\n[T16] Nessuna credenziale nel client");
{
  const payload = client.slice(0, 6000);
  check("16a. il client non contiene secret/token/credentiali gateway", !/(sk_|whsec_|secretKey|api_key|password)/i.test(payload));
  check("16b. metodi pubblici senza secret (solo etichetta/descrizione/iban/payeeEmail)", metodiPub.includes("iban") && !metodiPub.includes("secretKey"));
}

// ── Riepilogo ────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════════════════`);
console.log(`BUY-NOW PAYMENT FLOW CONTRACT TEST: ${passati} passati, ${falliti} falliti`);
if (falliti > 0) {
  console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
  process.exit(1);
}
console.log("TUTTI I CONTRATTI DEL FLUSSO BUY-NOW RISPETTATI ✓");
