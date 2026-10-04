/**
 * DEBUG mirato — confronto, nella sezione "Vendita" di /impostazioni, tra il
 * modulo Spedizione (che mostra i servizi) e il modulo Metodo di pagamento.
 *
 * Uso: node scripts/__debug-vendita-moduli.mjs <negozioId>
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

await page.goto(`${BASE}/merchant/${negozioId}/impostazioni`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4000);

// Apri la sezione "Vendita".
const vendita = page.locator('[data-settings-section="vendita"]');
await vendita.first().locator("button").first().click();
await page.waitForTimeout(1500);

// Apri il modulo Spedizione e POI il suo pannello interno.
const sped = page.locator('[data-settings-module="spedizione"]');
await sped.first().locator("button").first().click();
await page.waitForTimeout(3500);
const bottoniInterni = await sped.first().locator("button").allInnerTexts();
console.log("bottoni dentro il modulo Spedizione:", JSON.stringify(bottoniInterni));
// Clic su "Configura pacco e spedizione".
for (const b of await sped.first().locator("button").all()) {
  const t = (await b.innerText()).toLowerCase();
  if (t.includes("configura pacco")) {
    await b.click();
    await page.waitForTimeout(3500);
    break;
  }
}
console.log("\n===== MODULO SPEDIZIONE (aperto) =====");
console.log((await sped.first().innerText()).slice(0, 2500));

console.log("\n===== SCHEDA PAGAMENTI (così com'è oggi) =====");
const card = page.locator('a[href$="/pagamenti"]');
console.log("link alla pagina pagamenti presenti:", await card.count());
console.log(await card.first().innerText().catch(() => "(nessuna card)"));
console.log("URL del link:", await card.first().getAttribute("href").catch(() => "—"));

await page.screenshot({ path: "screenshots/_debug-vendita-moduli.png", fullPage: true });
console.log("\nscreenshot: screenshots/_debug-vendita-moduli.png");
await browser.close();
