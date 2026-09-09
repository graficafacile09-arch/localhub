/**
 * TEST DEDICATO — P1 PAYMENT-FIRST: INTENTO DI CHECKOUT + RISERVA STOCK.
 *
 * Verifica i CONTRATTI statici della P1 (nessun server, nessun DB reale):
 *   - per i metodi ONLINE (stripe/paypal/klarna/scalapay) il checkout crea
 *     un INTENTO (pagamenti_sessioni con ordine_id = NULL) e riserva lo
 *     stock su quantita_riservata — MAI una riga in `ordini`/`ordini_righe`,
 *     MAI un decremento di quantita_disponibile, MAI una notifica ordine;
 *   - se la creazione della sessione provider fallisce, l'intento viene
 *     ANNULLATO (RPC checkout_intento_annulla: riserva rilasciata);
 *   - BONIFICO e RITIRO restano INVARIATI (crea_ordine / crea_ordini_carrello
 *     come prima: ordine creato subito, nessun intento);
 *   - idempotenza: checkout_key + negozio attivo → riuso dell'intento.
 *
 * Uso: npx tsx scripts/test-p1-intento-checkout.ts
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

const routeBuyNow = readFileSync(join(PROGETTO, "app/api/cliente/ordini/route.ts"), "utf8");
const routeCarrello = readFileSync(join(PROGETTO, "app/api/cliente/ordini/carrello/route.ts"), "utf8");
const sessioni = readFileSync(join(PROGETTO, "lib/pagamenti/sessioni.ts"), "utf8");
const migrIntento = readFileSync(
  join(PROGETTO, "supabase/migrations/20261004_p1_checkout_intento_crea.sql"),
  "utf8"
);
const migrAnnulla = readFileSync(
  join(PROGETTO, "supabase/migrations/20261004_p1_checkout_intento_annulla.sql"),
  "utf8"
);

// ── T1: lib/pagamenti/sessioni.ts espone il contratto P1 ─────────────────
console.log("\n[T1] Servizio sessioni: funzioni P1 esposte");
{
  check("1a. creaIntentoCheckout esportata", sessioni.includes("export async function creaIntentoCheckout"));
  check("1b. creaSessionePagamentoPerIntento esportata", sessioni.includes("export async function creaSessionePagamentoPerIntento"));
  check("1c. annullaIntentoCheckout esportata", sessioni.includes("export async function annullaIntentoCheckout"));
  check("1d. costruisciPayloadIntentoCheckout esportata", sessioni.includes("export function costruisciPayloadIntentoCheckout"));
  check("1e. providerDaMetodoPagamento (carta→stripe, bonifico→null)", sessioni.includes('if (metodo === "carta") return "stripe"') && sessioni.includes("if (metodo === \"paypal\") return \"paypal\""));
  check("1f. nessun fallback: bonifico → null (nessun gateway online)", sessioni.includes("return null;"));
}

// ── T2: BUY-NOW online → INTENTO (mai creaOrdine), bonifico/ritiro invariati
console.log("\n[T2] Buy-now: metodi online → intento; bonifico/ritiro → ordine subito");
{
  check("2a. route importa le funzioni intento", routeBuyNow.includes("creaIntentoCheckout") && routeBuyNow.includes("creaSessionePagamentoPerIntento") && routeBuyNow.includes("annullaIntentoCheckout"));
  check("2b. creaOrdine è ancora usata (bonifico/ritiro)", routeBuyNow.includes("await creaOrdine(input)"));
  check("2c. il ramo online ritorna PRIMA di creaOrdine (nessun ordine online)", routeBuyNow.indexOf("if (providerOnline)") < routeBuyNow.indexOf("await creaOrdine(input)"));
  check("2d. fallimento sessione provider → intento annullato", routeBuyNow.includes("await annullaIntentoCheckout(intento.checkoutId)"));
  check("2e. rimosso il vecchio blocco sessione-su-ordine (chiudiOrdineSenzaPagamento non più importato)", !routeBuyNow.includes("chiudiOrdineSenzaPagamento"));
}

// ── T3: CARRELLO online → un INTENTO per gruppo negozio; bonifico/ritiro invariati
console.log("\n[T3] Carrello: un intento per gruppo negozio; bonifico/ritiro → ordini subito");
{
  check("3a. route importa le funzioni intento + chiavePerNegozio", routeCarrello.includes("creaIntentoCheckout") && routeCarrello.includes("chiavePerNegozio") && routeCarrello.includes("annullaIntentoCheckout"));
  check("3b. creaOrdiniCarrello è ancora usata (bonifico/ritiro)", routeCarrello.includes("await creaOrdiniCarrello"));
  check("3c. il ramo online ritorna PRIMA di creaOrdiniCarrello", routeCarrello.indexOf("if (providerRichiesto) {") < routeCarrello.indexOf("await creaOrdiniCarrello"));
  check("3d. ogni gruppo riserva il proprio stock (intento per gruppo.negozi)", routeCarrello.includes("for (const gruppo of raggruppamento.negozi)"));
  check("3e. fallimento sessione provider → intento annullato", routeCarrello.includes("await annullaIntentoCheckout(intento.checkoutId)"));
  check("3f. rimosso il vecchio loop sessioni-su-ordine", !routeCarrello.includes("chiudiOrdineSenzaPagamento"));
}

// ── T4: RPC checkout_intento_crea — payment-first reale ──────────────────
console.log("\n[T4] RPC checkout_intento_crea: NESSUN insert in ordini, riserva su quantita_riservata");
{
  check("4a. RPC presente e SECURITY DEFINER", migrIntento.includes("create or replace function public.checkout_intento_crea") && migrIntento.includes("security definer"));
  check("4b. ZERO insert in ordini", !migrIntento.includes("insert into public.ordini") && !migrIntento.includes("into public.ordini "));
  check("4c. ZERO insert in ordini_righe", !migrIntento.includes("insert into public.ordini_righe") && !migrIntento.includes("into ordini_righe"));
  check("4d. riserva: quantita_riservata += q (mai decremento disponibile)", migrIntento.includes("quantita_riservata = quantita_riservata + v_riga_row.quantita"));
  check("4e. disponibilità effettiva = disponibile − riservata", migrIntento.includes("quantita_disponibile - quantita_riservata"));
  check("4f. sessione con ordine_id = NULL", migrIntento.includes("null, v_negozio_id, v_provider, 'created'"));
  check("4g. checkout_payload salvato (snapshot per la P2)", migrIntento.includes("checkout_payload") && migrIntento.includes("'version', 1"));
  check("4h. idempotenza via checkout_key + negozio attivo", migrIntento.includes("checkout_key = v_key") && migrIntento.includes("status in ('created', 'pending')"));
  check("4i. solo service_role", migrIntento.includes("grant execute on function public.checkout_intento_crea(jsonb) to service_role"));
}

// ── T5: RPC checkout_intento_annulla — rilascio riserva, idempotente ─────
console.log("\n[T5] RPC checkout_intento_annulla: rilascio riserva senza ordini");
{
  check("5a. RPC presente e SECURITY DEFINER", migrAnnulla.includes("create or replace function public.checkout_intento_annulla") && migrAnnulla.includes("security definer"));
  check("5b. rilascia quantita_riservata (mai sotto zero)", migrAnnulla.includes("greatest(quantita_riservata - v_quantita, 0)"));
  check("5c. solo intenti: ordine_id valorizzato → rifiutato", migrAnnulla.includes("CHECKOUT_NON_ANNULLABILE"));
  check("5d. status → expired (libera l'indice attivo)", migrAnnulla.includes("status = 'expired'"));
  check("5e. idempotente: intento già concluso → ok senza riscritture", migrAnnulla.includes("status not in ('created', 'pending')"));
  check("5f. solo service_role", migrAnnulla.includes("grant execute on function public.checkout_intento_annulla(uuid) to service_role"));
}

console.log(`\nRISULTATO: ${passati} passati, ${falliti} falliti`);
if (falliti > 0) {
  console.log("FALLITI:", fallitiNomi.join(", "));
  process.exit(1);
}