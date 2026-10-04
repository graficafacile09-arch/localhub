/**
 * VERIFICA IN PRODUZIONE — metodi di pagamento/spedizione e Stripe Connect.
 *
 * Uso: node scripts/__verify-produzione-metodi.mjs <negozioId> <emailVenditore>
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

const BASE = process.env.VERIFY_BASE_URL ?? "https://www.incitta.online";
const negozioId = process.argv[2];
const email = process.argv[3] ?? process.env.VERIFY_OWNER_EMAIL ?? "";
if (!negozioId || !email) {
  console.error("Uso: node scripts/__verify-produzione-metodi.mjs <negozioId> <emailVenditore>");
  process.exit(1);
}

const METODI = [
  "Carta",
  "Klarna",
  "PayPal",
  "SEPA Direct Debit",
  "Bonifico istantaneo",
  "Bonifico bancario diretto al venditore",
];

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Dati reali del negozio (autorità: DB di produzione).
const { data: riga } = await admin
  .from("negozi")
  .select("nome, data, moduli_attivi, deleted_at")
  .eq("id", negozioId)
  .maybeSingle();
const { data: pagRows } = await admin
  .from("negozio_metodi_pagamento")
  .select("metodo, attivo")
  .eq("negozio_id", negozioId);
const { data: spedRows } = await admin
  .from("negozio_metodi_spedizione")
  .select("carrier, servizio, attivo")
  .eq("negozio_id", negozioId);

console.log("NEGOZIO:", riga?.nome, "| deleted:", riga?.deleted_at ?? "no", "| tipo_attivita:", riga?.data?.tipo_attivita ?? "—");
console.log("DB — metodi pagamento:", (pagRows ?? []).map((r) => `${r.metodo}:${r.attivo}`).join(", "));
console.log("DB — metodi spedizione:", (spedRows ?? []).map((r) => `${r.carrier}/${r.servizio}:${r.attivo}`).join(", "));

const { data: link, error: errLink } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (errLink) {
  console.error("generateLink fallito:", errLink.message);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const errori = [];
const apiCalls = [];
page.on("console", (m) => {
  if (m.type() === "error") errori.push(m.text());
});
page.on("response", async (res) => {
  const u = res.url();
  if (u.includes(`/api/merchant/stores/${negozioId}`) && u.includes("pagamenti")) {
    apiCalls.push(`${res.status()} ${u.replace(BASE, "")}`);
  }
});

await page.goto(`${BASE}/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2000);
console.log("URL dopo login:", page.url());
await page.context().addCookies([{ name: "lh_area", value: "merchant", domain: "www.incitta.online", path: "/" }]);

// ── 1. Pagina Pagamenti ──────────────────────────────────────────────
await page.goto(`${BASE}/merchant/${negozioId}/pagamenti`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(6000);
const testoPag = await page.innerText("body");
console.log("\n===== PRODUZIONE: /pagamenti =====");
console.log("URL:", page.url());
console.log("empty state 'Pagamenti non disponibili':", testoPag.includes("Pagamenti non disponibili"));
console.log("metodi VISIBILI:", JSON.stringify(METODI.filter((m) => testoPag.includes(m))));
console.log("metodi MANCANTI:", JSON.stringify(METODI.filter((m) => !testoPag.includes(m))));
console.log("toggle:", await page.locator('input[type="checkbox"]').count());
console.log("pulsante Stripe Connect:", testoPag.includes("Crea o Collega il tuo conto Stripe"));

// ── 2. Impostazioni → Vendita → scheda pagamenti + modulo spedizione ──
await page.goto(`${BASE}/merchant/${negozioId}/impostazioni`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(5000);
const vendita = page.locator('[data-settings-section="vendita"]');
await vendita.first().locator("button").first().click();
await page.waitForTimeout(1500);

const moduloPag = page.locator('[data-settings-module="pagamenti"]');
console.log("\n===== PRODUZIONE: Impostazioni → Vendita → scheda Pagamenti =====");
console.log("scheda presente:", (await moduloPag.count()) > 0);
if (await moduloPag.count()) {
  await moduloPag.first().locator("button").first().click();
  await page.waitForTimeout(6000);
  const testoPagScheda = await moduloPag.first().innerText();
  console.log("metodi VISIBILI nella scheda:", JSON.stringify(METODI.filter((m) => testoPagScheda.includes(m))));
  console.log("metodi MANCANTI:", JSON.stringify(METODI.filter((m) => !testoPagScheda.includes(m))));
  console.log("toggle nella scheda:", await moduloPag.first().locator('input[type="checkbox"]').count());
}

const moduloSped = page.locator('[data-settings-module="spedizione"]');
console.log("\n===== PRODUZIONE: Impostazioni → Vendita → modulo Spedizione =====");
if (await moduloSped.count()) {
  await moduloSped.first().locator("button").first().click();
  await page.waitForTimeout(5000);
  const testoSped = await moduloSped.first().innerText();
  for (const b of await moduloSped.first().locator("button").all()) {
    if ((await b.innerText()).toLowerCase().includes("configura pacco")) {
      await b.click();
      await page.waitForTimeout(4000);
      break;
    }
  }
  const testoSpedAperto = await moduloSped.first().innerText();
  const servizi = ["Poste Italiane — Standard", "BRT — Online", "GLS", "Poste Italiane — Express", "Corriere locale"];
  console.log("servizi di spedizione visibili:", JSON.stringify(servizi.filter((s) => testoSpedAperto.includes(s))));
  console.log("riepilogo:", testoSped.split("\n").slice(0, 3).join(" / "));
}

console.log("\nchiamate API pagamenti:", JSON.stringify(apiCalls));
console.log("errori console:", JSON.stringify(errori.slice(0, 5)));

await page.screenshot({ path: "screenshots/_verify-produzione-metodi.png", fullPage: true });
console.log("\nscreenshot: screenshots/_verify-produzione-metodi.png");
await browser.close();
