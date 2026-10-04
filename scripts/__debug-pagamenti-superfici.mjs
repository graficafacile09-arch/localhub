/**
 * DEBUG SUPERFICI — dove l'utente può vedere i "metodi di pagamento" del negozio.
 *
 * Verifica, con sessione reale (magic link) e area venditore:
 *   A. /merchant/[id]/impostazioni  → sezione "Vendita" (scheda pagamenti)
 *   B. /merchant/[id]/edit          → step "06 Impostazioni commerciali"
 * e riporta per ognuna: URL finale, presenza dei metodi, estratto del testo.
 *
 * Uso: node scripts/__debug-pagamenti-superfici.mjs <negozioId>
 */

import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  const txt = fs.readFileSync(path, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    }
  }
}
loadEnv(".env.local");

const BASE = "http://localhost:3000";
const negozioId = process.argv[2];
if (!negozioId) {
  console.error("Uso: node scripts/__debug-pagamenti-superfici.mjs <negozioId>");
  process.exit(1);
}

const METODI = ["Carta", "Klarna", "PayPal", "SEPA Direct Debit", "Bonifico istantaneo", "Bonifico bancario diretto al venditore"];

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: riga } = await admin.from("negozi").select("nome, owner_user_id").eq("id", negozioId).maybeSingle();
const { data: owner } = await admin.auth.admin.getUserById(riga.owner_user_id);
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: owner.user.email });

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(`${BASE}/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(1200);
await page.context().addCookies([{ name: "lh_area", value: "merchant", domain: "localhost", path: "/" }]);
console.log("Sessione pronta. Negozio:", riga.nome);

function report(titolo, testo) {
  const trovati = METODI.filter((m) => testo.includes(m));
  console.log(`\n================ ${titolo} ================`);
  console.log("metodi trovati:", JSON.stringify(trovati));
  console.log("metodi MANCANTI:", JSON.stringify(METODI.filter((m) => !trovati.includes(m))));
  console.log("--- estratto testo (3000 char) ---");
  console.log(testo.slice(0, 3000));
}

// ── A. /impostazioni → sezione Vendita ──────────────────────────────
await page.goto(`${BASE}/merchant/${negozioId}/impostazioni`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4000);
const vendita = page.locator('[data-settings-section="vendita"]');
if (await vendita.count()) {
  await vendita.first().locator("button").first().click();
  await page.waitForTimeout(1200);
}
// Espande anche il modulo "Spedizione" per confrontare cosa viene mostrato
// inline per le spedizioni rispetto ai pagamenti.
const moduloSpedizione = page.locator('[data-settings-module="spedizione"]');
if (await moduloSpedizione.count()) {
  await moduloSpedizione.first().locator("button").first().click();
  await page.waitForTimeout(3500);
}
const testoSpedizione = await moduloSpedizione.first().innerText().catch(() => "(modulo spedizione non trovato)");
console.log("\n--- testo del modulo SPEDIZIONE (espanso) ---");
console.log(testoSpedizione.slice(0, 1500));

const testoImpostazioni = await vendita.first().innerText().catch(() => "(sezione vendita non trovata)");
report("A. /impostazioni → sezione Vendita", testoImpostazioni);
await page.screenshot({ path: `screenshots/_debug-impostazioni-vendita.png`, fullPage: true });

// ── B. /edit → step Impostazioni commerciali ────────────────────────
await page.goto(`${BASE}/merchant/${negozioId}/edit`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4000);
console.log("\n=== B. step disponibili nell'editor ===");
const bottoni = await page.locator("button").allInnerTexts().catch(() => []);
console.log(JSON.stringify(bottoni.slice(0, 40)));
const stepCommerciale = page.getByRole("button", { name: /Vendita e agenda/i }).first();
if (await stepCommerciale.count()) {
  await stepCommerciale.click({ force: true }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log("clic su 'Vendita e agenda' eseguito");
} else {
  console.log("bottone 'Vendita e agenda' NON trovato");
}
const testoEditor = await page.locator("body").innerText().catch(() => "");
report("B. /edit → Impostazioni commerciali", testoEditor);
await page.screenshot({ path: `screenshots/_debug-editor-commerciale.png`, fullPage: true });

await browser.close();
