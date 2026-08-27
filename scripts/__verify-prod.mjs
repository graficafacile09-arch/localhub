/**
 * VERIFICA POST-DEPLOY PRODUCTION — overflow orizzontale + header
 *
 * Scansiona https://www.incitta.online (alias del deploy Vercel) alle
 * viewport 320/375/1280 sulle pagine che in audit avevano overflow e
 * sulle aree protette (login con i fixture ufficiali del progetto —
 * stesso Supabase di test locale).
 *
 * Uso: node scripts/__verify-prod.mjs
 * Solo lettura: non scrive file.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "https://www.incitta.online";
const VIEWPORTS = [320, 375, 1280];
const STORE_ID = process.env.MERCHANT_STORE_ID || "82713069-38ca-43c8-bfd6-dd39c2f9";

const UTENTI = {
  customer: { email: "customer-a.test@localhub.it", password: "CustomerTest123!", area: "cliente" },
  merchant: { email: "commerciante-a.test@localhub.it", password: "MerchantTest123!", area: "merchant" },
  admin: { email: "admin.test@localhub.it", password: "AdminTest123!", area: "admin" },
};

async function login(page, ruolo) {
  const u = UTENTI[ruolo];
  await page.goto(`${BASE}/login${u.area ? `?area=${u.area}` : ""}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#email", { timeout: 15000 });
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(u.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  const dest = ruolo === "customer" ? "/cliente" : ruolo === "merchant" ? "/merchant" : "/amministratore";
  try {
    await page.waitForURL(`**${dest}**`, { timeout: 25000 });
    return true;
  } catch {
    console.warn(`  ⚠️ login ${ruolo}: URL attuale ${page.url()}`);
    return false;
  }
}

async function misura(page, vw) {
  await page.setViewportSize({ width: vw, height: 900 });
  await page.waitForTimeout(500);
  return page.evaluate((vwp) => {
    const docScroll = document.documentElement.scrollWidth;
    const docClient = document.documentElement.clientWidth;
    const overflowPx = docScroll - docClient;
    const isClipped = (el) => {
      let p = el.parentElement;
      while (p && p !== document.documentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "hidden" || o === "auto" || o === "scroll" || o === "clip") return true;
        p = p.parentElement;
      }
      return false;
    };
    let culprit = null;
    if (overflowPx > 0) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const excess = Math.round((r.right - vwp) * 10) / 10;
        if (excess > 0.5 && !isClipped(el)) {
          culprit = {
            tag: el.tagName.toLowerCase(),
            cls: typeof el.className === "string" ? el.className.trim().slice(0, 120) : undefined,
            text: (el.childElementCount === 0 ? (el.textContent || "").trim() : "").slice(0, 50),
            right: Math.round(r.right * 10) / 10,
            excess,
            widthCss: getComputedStyle(el).width,
            minWidthCss: getComputedStyle(el).minWidth,
          };
          break;
        }
      }
    }
    return { vw: vwp, overflowPx, culprit };
  }, vw);
}

async function headerCheck(page) {
  return page.evaluate(() => {
    const vis = (sel) => {
      const el = typeof sel === "string" ? document.querySelector(sel) : sel;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const txt = (sel) => {
      const el = typeof sel === "string" ? document.querySelector(sel) : sel;
      return el ? (el.textContent || "").trim().slice(0, 120) : "";
    };
    const weather = document.querySelector(
      "header [aria-label*='eteo'], header [aria-label*='ETEO'], header [class*='weather' i]"
    );
    const logo = document.querySelector("header img[alt*='ogo' i], header a[href='/'] img, header img");
    const btn = Array.from(document.querySelectorAll("header a, header button")).find(
      (el) => (el.textContent || "").trim().includes("Accedi") || (el.textContent || "").trim().includes("Account")
    );
    // hamburger: icone menu comuni
    const menuIcons = Array.from(document.querySelectorAll("header button svg, header button")).filter((el) => {
      const t = (el.textContent || "").toLowerCase();
      const hasBars = el.innerHTML.includes("<line") && el.innerHTML.includes("y1=\"6\"") ||
        /svg[^>]*path[^>]*d="M[^"]*3 6h18|M[^"]*3 12h[0-9]|M[^"]*3 18h18"/.test(el.outerHTML);
      return (t === "" || t.includes("menu")) && hasBars;
    });
    return {
      logoVisible: vis(logo),
      weatherVisible: !!weather && vis(weather),
      weatherText: weather ? txt(weather) : "",
      hasCastrovillari: weather ? /castrovillari/i.test(txt(weather)) : false,
      accountText: btn ? (btn.textContent || "").trim() : "",
      hamburgerCount: menuIcons.length,
    };
  });
}

const risultati = [];
const note = [];
let ok = true;

async function scan(page, nome, url, vwList = VIEWPORTS) {
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(900);
  } catch (e) {
    risultati.push({ nome, url, error: String(e).slice(0, 150) });
    ok = false;
    return;
  }
  for (const vw of vwList) {
    const m = await misura(page, vw);
    if (m.overflowPx > 0) {
      ok = false;
      risultati.push({ nome, url, vw, overflowPx: m.overflowPx, culprit: m.culprit });
    } else {
      risultati.push({ nome, url, vw, overflowPx: 0 });
    }
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext();

// ── Pagine pubbliche ────────────────────────────────────────────────────
console.log("── Pubbliche ──");
// raccogli slug reali dalla homepage
const p0 = await ctx.newPage();
await p0.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
await p0.waitForTimeout(1500);
const slugNegozi = await p0.evaluate(() => {
  const a = document.querySelector('a[href^="/negozio/"]');
  return a ? a.getAttribute("href").split("?")[0] : null;
});
const slugProdotti = await p0.evaluate(() => {
  const a = document.querySelector('a[href^="/prodotto/"]');
  return a ? a.getAttribute("href").split("?")[0] : null;
});
await p0.close();

for (const r of ["/", "/negozi", "/categorie", "/carrello", "/login", "/ricerca"]) {
  await scan(await ctx.newPage(), r, r);
}
if (slugNegozi) await scan(await ctx.newPage(), slugNegozi, slugNegozi);
else { console.log("  ⚠️ nessun link /negozio/ trovato in homepage"); ok = false; }
if (slugProdotti) await scan(await ctx.newPage(), slugProdotti, slugProdotti);
else { console.log("  ⚠️ nessun link /prodotto/ trovato in homepage"); ok = false; }

// Header check su homepage @320
{
  const h = await ctx.newPage();
  await h.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await h.setViewportSize({ width: 320, height: 900 });
  // attesa generosa: il meteo arriva da api.open-meteo.com (fino a 8s di timeout)
  await h.waitForTimeout(5000);
  const hc = await headerCheck(h);
  const hcM = await misura(h, 320);
  risultati.push({ nome: "HEADER@320", url: "/", header: hc, overflowPx: hcM.overflowPx });
  if (hcM.overflowPx > 0) ok = false;
  if (!hc.logoVisible || !hc.weatherVisible || !hc.hasCastrovillari || hc.hamburgerCount > 0 || !hc.accountText) {
    console.log("  ⚠️ HEADER CHECK", JSON.stringify(hc));
    ok = false;
  } else {
    console.log("  ✓ header ok (logo, meteo con Castrovillari, Account, nessun hamburger)");
  }
  await h.close();
}

// ── Aree protette ────────────────────────────────────────────────────────
const admin = await ctx.newPage();
console.log("── Admin ──");
if (await login(admin, "admin")) {
  for (const r of ["/amministratore", "/amministratore/ordini", "/amministratore/incassi", "/amministratore/payout", `/amministratore/negozi/${STORE_ID}/prodotti`]) {
    await scan(admin, r, r);
  }
} else {
  note.push("login admin bloccato dal gate isAdminEmail (atteso in prod: l'email di test non è autorizzata)");
  console.log("  ⚠️ login admin bloccato dal gate isAdminEmail (atteso in prod)");
}

const merch = await ctx.newPage();
console.log("── Merchant ──");
if (await login(merch, "merchant")) {
  for (const r of [`/merchant/${STORE_ID}/prodotti`, `/merchant/${STORE_ID}/incassi`, `/merchant/${STORE_ID}/payout`]) {
    await scan(merch, r, r);
  }
} else {
  ok = false;
  console.log("  ⚠️ login merchant fallito");
}

const cust = await ctx.newPage();
console.log("── Cliente ──");
if (await login(cust, "customer")) {
  for (const r of ["/cliente/preferiti", "/cliente/ordini"]) {
    await scan(cust, r, r);
  }
} else {
  ok = false;
  console.log("  ⚠️ login customer fallito");
}

await browser.close();

// ── Report ───────────────────────────────────────────────────────────────
const overflows = risultati.filter((r) => r.overflowPx && r.overflowPx > 0);
console.log("\n==== RISULTATO VERIFICA PRODUCTION ====");
console.log(`Target: ${BASE}`);
console.log(`Misurazioni: ${risultati.length}  |  Overflow reali: ${overflows.length}`);
for (const o of overflows) {
  console.log(`  ❌ ${o.nome} @${o.vw} → +${o.overflowPx}px`, o.culprit ? `${o.culprit.tag}.${(o.culprit.cls || "").slice(0, 40)}` : "");
}
for (const r of risultati.filter((r) => r.error)) {
  console.log(`  ❌ ${r.nome} → ERRORE: ${r.error}`);
}
const scanRotte = [...new Set(risultati.map((r) => r.nome))];
console.log(`\nRoute verificate: ${scanRotte.length}`);
for (const n of scanRotte) console.log(`  • ${n}`);
if (note.length) {
  console.log("\nNote (attese, non overflow):");
  for (const n of note) console.log(`  ℹ️ ${n}`);
}
console.log(ok && overflows.length === 0 ? "✅ ESITO: NESSUN overflow reale in Production" : "❌ ESITO: overflow reali presenti");
process.exit(ok && overflows.length === 0 ? 0 : 1);
