/**
 * TEST DEDICATO — GESTIONE STRIPE CONNECT NELL'AREA AMMINISTRAZIONE.
 *
 * Verifica i CONTRATTI STATICI della sezione admin "Pagamenti → Stripe
 * Connect" (nessun server, nessun DB, nessun secret reale):
 *   - le 3 API admin sono protette da requireApiArea("admin") (autorizzazione
 *     server-side identica alle altre API amministrative);
 *   - il servizio RIUSA le funzioni Connect esistenti
 *     (lib/pagamenti/stripe-connect.ts) e le RPC esistenti — nessuna seconda
 *     implementazione di Stripe Connect;
 *   - nessun secret/credenziale esposto dalle nuove API/pagina;
 *   - checkout/gateway/webhook NON toccati (nessun import di questi file
 *     dai nuovi file admin);
 *   - la voce di navigazione admin esiste.
 *
 * Uso: npx tsx scripts/test-admin-stripe-connect.ts
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

const servizio = readFileSync(join(PROGETTO, "lib/amministratore/pagamenti-stripe.ts"), "utf8");
const routeGet = readFileSync(join(PROGETTO, "app/api/amministratore/pagamenti/stripe/route.ts"), "utf8");
const routeVerifica = readFileSync(join(PROGETTO, "app/api/amministratore/pagamenti/stripe/[negozioId]/verifica/route.ts"), "utf8");
const routeOnboarding = readFileSync(join(PROGETTO, "app/api/amministratore/pagamenti/stripe/[negozioId]/onboarding/route.ts"), "utf8");
const client = readFileSync(join(PROGETTO, "components/amministratore/pagamenti/StripeConnectAdminClient.tsx"), "utf8");
const nav = readFileSync(join(PROGETTO, "components/amministratore/navigation.ts"), "utf8");
const pagina = readFileSync(join(PROGETTO, "app/(amministratore)/amministratore/pagamenti/stripe/page.tsx"), "utf8");

// ── T1: autorizzazione admin su TUTTE le API (server-side) ───────────────
console.log("\n[T1] Le API admin sono protette da requireApiArea('admin')");
{
  check("1a. GET /api/amministratore/pagamenti/stripe → requireApiArea('admin')", routeGet.includes(`requireApiArea("admin")`));
  check("1b. POST verifica → requireApiArea('admin')", routeVerifica.includes(`requireApiArea("admin")`));
  check("1c. POST onboarding → requireApiArea('admin')", routeOnboarding.includes(`requireApiArea("admin")`));
  check("1d. nessun controllo client-side: le API non affidano mai l'autorizzazione al client", !/client-side|role.*client/i.test(routeGet + routeVerifica + routeOnboarding));
}

// ── T2: riuso di lib/pagamenti/stripe-connect.ts (nessuna seconda impl) ──
console.log("\n[T2] Il servizio riusa le funzioni Connect esistenti (mai duplicato)");
{
  check("2a. import da lib/pagamenti/stripe-connect", servizio.includes(`from "@/lib/pagamenti/stripe-connect"`));
  check("2b. riusa createStripeExpressAccount", servizio.includes("createStripeExpressAccount"));
  check("2c. riusa createStripeAccountLink", servizio.includes("createStripeAccountLink"));
  check("2d. riusa getStripeAccountOnboarding", servizio.includes("getStripeAccountOnboarding"));
  check("2e. riusa RPC pagamenti_stripe_connect_crea", servizio.includes("pagamenti_stripe_connect_crea"));
  check("2f. riusa RPC pagamenti_stripe_connect_stato_salva", servizio.includes("pagamenti_stripe_connect_stato_salva"));
  check("2g. NESSUNA nuova istanza Stripe nel servizio admin (no new Stripe()/SDK duplicato)", !/new Stripe\(/.test(servizio));
}

// ── T3: nessun secret/credenziale esposto ────────────────────────────────
console.log("\n[T3] Nessun secret/credenziale esposto da API/pagina");
{
  const apiTesto = routeGet + routeVerifica + routeOnboarding + servizio;
  check("3a. le API non ritornano secret_encrypted/webhook_secret/secretKey", !/secret_encrypted|webhook_secret|secretKey|api_key/i.test(apiTesto));
  check("3b. la pagina client non contiene STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET", !/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/.test(client));
  check("3c. la pagina non mostra iban/coordinate (nessun campo di testo iban, solo menzione del KYC hosted)", !/\.iban|value=\{\s*iban|placeholder=.*[Ii]BAN/.test(client));
  check("3d. nel servizio i nomi env piattaforma compaiono solo in commento (mai letti/ritornati)", !/process\.env\.STRIPE_SECRET_KEY/.test(servizio));
}

// ── T4: il checkout/gateway/webhook NON sono toccati ─────────────────────
console.log("\n[T4] Checkout/gateway/webhook non modificati (nessun import dai nuovi file)");
{
  const nuoviFile = [servizio, routeGet, routeVerifica, routeOnboarding, client, pagina];
  const testoNuovi = nuoviFile.join("\n");
  check("4a. nessun import di sessioni.ts (checkout)", !/pagamenti\/sessioni/.test(testoNuovi));
  check("4b. nessun import di gateway-stripe/stripe.ts (gateway)", !/from ["']@\/lib\/pagamenti\/stripe["']/.test(testoNuovi));
  check("4c. nessun import dei webhook", !/from [\"'][^\"']*webhook/.test(testoNuovi));
  check("4d. nessun import delle route ordini/checkout", !/cliente\/ordini/.test(testoNuovi));
  check("4e. nessun import di metodi-pubblici.ts", !/metodi-pubblici/.test(testoNuovi));
}

// ── T5: voce di navigazione admin presente ───────────────────────────────
console.log("\n[T5] Navigazione admin");
{
  check("5a. la voce '/amministratore/pagamenti/stripe' esiste nel menu", nav.includes("/pagamenti/stripe") && nav.includes("ADMIN_BASE"));
  check("5b. etichetta 'Stripe Connect' presente", nav.includes("Stripe Connect"));
  check("5c. la pagina esiste ed è force-dynamic", pagina.includes("force-dynamic") && pagina.includes("StripeConnectAdminClient"));
}

// ── Riepilogo ────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════════════════`);
console.log(`ADMIN STRIPE CONNECT CONTRACT TEST: ${passati} passati, ${falliti} falliti`);
if (falliti > 0) {
  console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
  process.exit(1);
}
console.log("TUTTI I CONTRATTI DELLA SEZIONE ADMIN STRIPE CONNECT RISPETTATI ✓");