/**
 * VERIFICA IN PRODUZIONE — Stripe Connect apre il collegamento.
 *
 * Usa un negozio DEMO che ha GIÀ un connected account: il flusso riusa
 * l'account esistente e genera solo un Account Link (nessun account creato).
 *
 * Uso: node scripts/__verify-produzione-stripe-connect.mjs <negozioId> <emailVenditore>
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
const email = process.argv[3];
if (!negozioId || !email) {
  console.error("Uso: node scripts/__verify-produzione-stripe-connect.mjs <negozioId> <email>");
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2000);
await page.context().addCookies([{ name: "lh_area", value: "merchant", domain: "www.incitta.online", path: "/" }]);

await page.goto(`${BASE}/merchant/${negozioId}/pagamenti`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(6000);

const bottone = page.getByRole("button", { name: /Riprendi onboarding|Crea o Collega il tuo conto Stripe/ }).first();
console.log("pulsante Stripe visibile:", await bottone.isVisible().catch(() => false));

const risposte = [];
page.on("response", async (r) => {
  if (r.url().includes("/api/pagamenti/connect/crea")) {
    let body = null;
    try {
      body = await r.json();
    } catch {
      body = "(non JSON)";
    }
    risposte.push({ status: r.status(), body });
  }
});

await bottone.click().catch((e) => console.log("click non eseguito:", e.message));
await page.waitForTimeout(8000);

console.log("URL dopo il click:", page.url());
if (page.url().includes("stripe.com")) {
  console.log(">>> STRIPE CONNECT: il pulsante apre il collegamento Stripe ✔");
} else {
  const testo = await page.innerText("body");
  console.log(">>> non reindirizzato. Messaggio mostrato dalla UI:");
  console.log(testo.split("\n").filter((l) => l.trim()).slice(0, 25).join(" | "));
}
console.log("chiamate /api/pagamenti/connect/crea:", JSON.stringify(risposte));

await browser.close();
