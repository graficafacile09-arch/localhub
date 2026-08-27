/**
 * FASE 10C — Audit visuale: misura titoli (H1/H2) e altezze pulsanti
 * sulle schermate reali. Solo lettura.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const UTENTI = {
  admin: { email: "admin.test@localhub.it", password: "AdminTest123!" },
  merchant: { email: "commerciante-a.test@localhub.it", password: "MerchantTest123!" },
  customer: { email: "customer-a.test@localhub.it", password: "CustomerTest123!" },
};

async function login(page, u) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(u.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL(/localhost/, { timeout: 20000 });
}

async function misura(page, label) {
  const r = await page.evaluate(() => {
    const out = { titoli: [], pulsanti: [] };
    document.querySelectorAll("h1,h2").forEach((h) => {
      const cs = getComputedStyle(h);
      out.titoli.push({
        tag: h.tagName,
        testo: h.textContent.trim().slice(0, 40),
        px: cs.fontSize,
        peso: cs.fontWeight,
      });
    });
    document.querySelectorAll("button, a.btn-cta, a.btn-secondary, a.btn-ghost, a.btn-danger").forEach((b) => {
      const cs = getComputedStyle(b);
      const testo = b.textContent.trim().slice(0, 30);
      if (!testo) return;
      const isButton = b.tagName === "BUTTON";
      // solo elementi che sembrano pulsanti (hanno padding esplicito o classe btn)
      const cls = (b.getAttribute("class") ?? "");
      if (!isButton && !/btn-/.test(cls)) return;
      out.pulsanti.push({
        tag: b.tagName,
        testo,
        h: Math.round(b.getBoundingClientRect().height),
        cls: cls.slice(0, 60),
      });
    });
    return out;
  });
  console.log(`\n===== ${label} =====`);
  console.log("-- TITOLI:");
  r.titoli.forEach((t) => console.log(`  ${t.tag} ${t.px}px peso=${t.peso} — "${t.testo}"`));
  console.log("-- PULSANTI (h):");
  r.pulsanti.forEach((p) => console.log(`  ${p.h}px ${p.tag} "${p.testo}" [${p.cls}]`));
}

const browser = await chromium.launch();

// PUBBLICO
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await misura(page, "PUBBLICO — homepage 1280");
  await page.goto(`${BASE}/negozi`, { waitUntil: "networkidle" });
  await misura(page, "PUBBLICO — /negozi 1280");
  await page.goto(`${BASE}/negozio/panificio-rossi`, { waitUntil: "networkidle" }).catch(() => {});
  await misura(page, "PUBBLICO — /negozio/panificio-rossi 1280");
  await ctx.close();
}

// CLIENTE
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, UTENTI.customer);
  await page.goto(`${BASE}/cliente`, { waitUntil: "networkidle" });
  await misura(page, "CLIENTE — dashboard 1280");
  await page.goto(`${BASE}/cliente/ordini`, { waitUntil: "networkidle" });
  await misura(page, "CLIENTE — ordini 1280");
  await ctx.close();
}

// MERCHANT
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, UTENTI.merchant);
  await page.goto(`${BASE}/merchant/qa-nav-check`, { waitUntil: "networkidle" });
  await misura(page, "MERCHANT — dashboard negozio 1280");
  await page.goto(`${BASE}/merchant/qa-nav-check/prodotti`, { waitUntil: "networkidle" });
  await misura(page, "MERCHANT — prodotti 1280");
  await ctx.close();
}

// ADMIN
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, UTENTI.admin);
  await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });
  await misura(page, "ADMIN — panorama 1280");
  await page.goto(`${BASE}/amministratore/attivita`, { waitUntil: "networkidle" });
  await misura(page, "ADMIN — attivita 1280");
  await ctx.close();
}

await browser.close();
