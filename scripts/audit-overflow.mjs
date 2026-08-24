/**
 * AUDIT OVERFLOW ORIZZONTALE — LocalHub
 *
 * Scansione sistematica delle route (pubbliche e protette) a più viewport,
 * con diagnosi a livello di singolo elemento DOM:
 *   - overflow reale di pagina (document.scrollWidth > clientWidth)
 *   - elementi che superano il bordo destro del viewport (rect.right > vw)
 *   - overflow interni INTENZIONALI (contenitori con overflow-x auto/scroll)
 *   - elementi fixed/sticky fuori viewport (non causano scroll, ma cut-off)
 *
 * Uso: node scripts/audit-overflow.mjs
 * Richiede il server dev su http://localhost:3100 (PORT può essere sovrascritta).
 * Non modifica nessun file dell'app: scrive solo scripts/audit-overflow-report.json
 * e stampa un riepilogo a console.
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const VIEWPORTS = [320, 360, 375, 390, 414, 768, 1024, 1280, 1440];

// Filtro sezioni: "public", "cliente", "merchant", "admin" (comma-separata).
const SOLO_SEZIONI = (process.env.SCAN_SEZIONI || "").split(",").map((s) => s.trim()).filter(Boolean);
const include = (s) => SOLO_SEZIONI.length === 0 || SOLO_SEZIONI.includes(s);

// Utenti di test (allineati a tests/fixtures/users.ts)
const UTENTI = {
  customer: { email: "customer-a.test@localhub.it", password: "CustomerTest123!", area: "cliente" },
  merchant: { email: "commerciante-a.test@localhub.it", password: "MerchantTest123!", area: "merchant" },
  admin: { email: "admin.test@localhub.it", password: "AdminTest123!", area: "admin" },
};

// ── Route STATICHE pubbliche ─────────────────────────────────────────────
const ROUTES_PUBLIC_STATIC = [
  "/",
  "/negozi",
  "/negozi?featured=1",
  "/categorie",
  "/ricerca",
  "/ricerca?q=pizza",
  "/ricerca?categoria=alimentari",
  "/carrello",
  "/checkout",
  "/ordini/recupera",
  "/assistant",
  "/login",
  "/login?area=cliente",
  "/login?area=merchant",
  "/login?area=admin",
  "/recupero-password",
  "/reset-password",
  "/verifica-email",
  "/ritorno-stripe",
  "/logout-success",
  "/test-editor",
  "/profilo", // redirect → /cliente/profilo → /login?area=cliente
  "/preferiti", // redirect → /cliente/preferiti → /login?area=cliente
  "/ordini", // redirect → /cliente/ordini → /login?area=cliente
  "/404-non-esiste", // 404 page
];

const ROUTES_CUSTOMER_STATIC = [
  "/cliente",
  "/cliente/ordini",
  "/cliente/preferiti",
  "/cliente/profilo",
  "/cliente/impostazioni",
  "/cliente/segnalazioni",
];

const ROUTES_MERCHANT_STATIC = [
  "/merchant",
  "/merchant/nuovo",
];

const ROUTES_ADMIN_STATIC = [
  "/amministratore",
  "/amministratore/assistente-ai",
  "/amministratore/attivita",
  "/amministratore/categorie",
  "/amministratore/cestino",
  "/amministratore/contenuti",
  "/amministratore/eventi",
  "/amministratore/impostazioni",
  "/amministratore/incassi",
  "/amministratore/negozi-in-evidenza",
  "/amministratore/offerte",
  "/amministratore/ordini",
  "/amministratore/payout",
  "/amministratore/prodotti",
  "/amministratore/registro-attivita",
  "/amministratore/scansioni",
  "/amministratore/segnalazioni",
  "/amministratore/statistiche",
  "/amministratore/template",
  "/amministratore/utenti",
];

// ── Misurazione in-page ──────────────────────────────────────────────────
async function misura(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
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

    const all = Array.from(document.querySelectorAll("body *"));
    const candidates = [];
    const fixed = [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") {
        if (r.right > vw + 0.5 || r.left < -0.5) {
          fixed.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            cls: typeof el.className === "string" ? el.className.trim().slice(0, 100) : undefined,
            left: Math.round(r.left * 10) / 10,
            right: Math.round(r.right * 10) / 10,
            width: Math.round(r.width * 10) / 10,
            pos,
            text: (el.childElementCount === 0 ? (el.textContent || "").trim() : "").slice(0, 40),
          });
        }
        continue;
      }
      const excess = Math.round((r.right - vw) * 10) / 10;
      if (excess > 0.5 && !isClipped(el)) {
        const cs = getComputedStyle(el);
        const ancest = [];
        let p = el.parentElement;
        while (p && p !== document.body) {
          ancest.push(
            p.tagName.toLowerCase() +
              (p.id ? `#${p.id}` : "") +
              (typeof p.className === "string" && p.className.trim()
                ? "." + p.className.trim().split(/\s+/).slice(0, 2).join(".")
                : "")
          );
          p = p.parentElement;
          if (ancest.length >= 5) break;
        }
        candidates.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          cls: typeof el.className === "string" ? el.className.trim() : undefined,
          text: (el.childElementCount === 0 ? (el.textContent || "").trim() : "").slice(0, 60),
          left: Math.round(r.left * 10) / 10,
          right: Math.round(r.right * 10) / 10,
          width: Math.round(r.width * 10) / 10,
          excess,
          childCount: el.childElementCount,
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          offsetW: el.offsetWidth,
          widthCss: cs.width,
          minWidthCss: cs.minWidth,
          maxWidthCss: cs.maxWidth,
          display: cs.display,
          whiteSpace: cs.whiteSpace,
          overflowX: cs.overflowX,
          flexShrink: cs.flexShrink,
          position: cs.position,
          transform: cs.transform !== "none" ? cs.transform.slice(0, 60) : undefined,
          marginLeft: cs.marginLeft,
          marginRight: cs.marginRight,
          paddingLeft: cs.paddingLeft,
          paddingRight: cs.paddingRight,
          ancestors: ancest.join(" > "),
        });
      }
    }
    // Ordina: maggiore eccedenza prima; poi i contenitori (non-leaf) perché
    // spesso definiscono la larghezza che spinge la pagina.
    candidates.sort((a, b) => b.excess - a.excess || a.childCount - b.childCount);

    // Overflow INTENZIONALI: contenitori scrollabili orizzontalmente
    const intentional = [];
    for (const el of all) {
      const o = getComputedStyle(el).overflowX;
      if ((o === "auto" || o === "scroll") && el.scrollWidth > el.clientWidth + 2) {
        const r = el.getBoundingClientRect();
        intentional.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          cls: typeof el.className === "string" ? el.className.trim().slice(0, 120) : undefined,
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          insideViewport: r.right <= vw + 0.5,
          text: (el.childElementCount === 0 ? (el.textContent || "").trim() : "").slice(0, 40),
        });
      }
    }

    return {
      vw,
      docClient,
      docScroll,
      overflowPx,
      candidateTotal: candidates.length,
      candidates: candidates.slice(0, 12),
      intentional: intentional.slice(0, 8),
      fixed: fixed.slice(0, 6),
    };
  });
}

// ── Navigazione + login ──────────────────────────────────────────────────
async function login(page, ruolo) {
  const u = UTENTI[ruolo];
  await page.goto(`${BASE}/login${u.area ? `?area=${u.area}` : ""}`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(u.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  const dest = ruolo === "customer" ? "/cliente" : ruolo === "merchant" ? "/merchant" : "/amministratore";
  try {
    await page.waitForURL(`**${dest}**`, { timeout: 20000 });
  } catch {
    console.warn(`⚠️  login ${ruolo}: attesa URL ${dest} fallita, URL attuale: ${page.url()}`);
  }
}

async function raccogliLink(page, prefisso) {
  return page.evaluate((pre) => {
    const set = new Set();
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute("href") || "";
      if (h.startsWith(pre)) set.add(h.split("?")[0]);
    }
    return [...set];
  }, prefisso);
}

async function scanRoute(page, route) {
  let finalUrl = route;
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 });
    finalUrl = page.url().replace(BASE, "");
  } catch (e) {
    // networkidle può fallire su pagine con streaming continuo → riprova con domcontentloaded
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);
    } catch (e2) {
      return { route, finalUrl, error: String(e2).slice(0, 200) };
    }
  }
  await page.waitForTimeout(350);

  const misure = [];
  for (const vw of VIEWPORTS) {
    await page.setViewportSize({ width: vw, height: 900 });
    await page.waitForTimeout(280);
    misure.push(await misura(page));
  }
  return { route, finalUrl, misure };
}

// ── Main ─────────────────────────────────────────────────────────────────
const report = { base: BASE, viewports: VIEWPORTS, generato: new Date().toISOString(), sezioni: {} };
const risultati = report.sezioni;

const browser = await chromium.launch();

function aggrega(sezione, scans) {
  const out = [];
  for (const s of scans) {
    if (s.error) {
      out.push({ route: s.route, error: s.error });
      continue;
    }
    for (const m of s.misure) {
      out.push({
        route: s.route,
        finalUrl: s.finalUrl,
        vw: m.vw,
        overflow: m.overflowPx,
        candidateTotal: m.candidateTotal,
        candidates: m.candidates,
        intentional: m.intentional,
        fixed: m.fixed,
      });
    }
  }
  return out;
}

// ── 1. PUBBLICHE ─────────────────────────────────────────────────────────
if (include("public")) {
console.log("── Scan Pubbliche ──");
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const page = await ctx.newPage();

  // Scopri slug reali dai link delle pagine pubbliche
  await page.goto(`${BASE}/negozi`, { waitUntil: "networkidle" });
  const negoziSlug = await raccogliLink(page, "/negozio/");
  await page.goto(`${BASE}/categorie`, { waitUntil: "networkidle" });
  const categorieSlug = await raccogliLink(page, "/categorie/");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const prodottiSlug = await raccogliLink(page, "/prodotto/");
  await page.goto(`${BASE}/ricerca?q=pizza`, { waitUntil: "networkidle" });
  for (const l of await raccogliLink(page, "/prodotto/")) if (!prodottiSlug.includes(l)) prodottiSlug.push(l);

  const negozi = negoziSlug.slice(0, 3);
  const categorie = categorieSlug.slice(0, 3);
  const prodotti = prodottiSlug.slice(0, 3);

  const routeDinamiche = [
    ...negozi.map((s) => s),
    ...categorie.map((s) => s),
    ...prodotti.flatMap((s) => [s, `${s}/acquista`, `${s}/acquista/ritiro`, `${s}/acquista/spedizione`]),
  ];
  console.log(`Slug trovati: negozi=${negozi.length} categorie=${categorie.length} prodotti=${prodotti.length}`);

  const scans = [];
  const tutte = [...ROUTES_PUBLIC_STATIC, ...routeDinamiche];
  for (const route of tutte) {
    process.stdout.write(`  ${route} ... `);
    const s = await scanRoute(page, route);
    const maxOv = s.misure?.length ? Math.max(...s.misure.map((m) => m.overflowPx)) : "ERR";
    console.log(maxOv > 0 ? `OVERFLOW max ${maxOv}px` : "ok");
    scans.push(s);
  }
  risultati.pubbliche = aggrega("pubbliche", scans);
  await ctx.close();
}
}

// ── 2. CLIENTE ───────────────────────────────────────────────────────────
if (include("cliente")) {
console.log("── Scan Area Cliente ──");
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "customer");
  const links = await raccogliLink(page, "/cliente");
  console.log(`  Link area cliente trovati: ${links.length}`);
  const extra = links.filter((l) => !ROUTES_CUSTOMER_STATIC.includes(l) && !["/cliente"].includes(l));
  const scans = [];
  for (const route of [...ROUTES_CUSTOMER_STATIC, ...extra].slice(0, 30)) {
    process.stdout.write(`  ${route} ... `);
    const s = await scanRoute(page, route);
    const maxOv = s.misure?.length ? Math.max(...s.misure.map((m) => m.overflowPx)) : "ERR";
    console.log(maxOv > 0 ? `OVERFLOW max ${maxOv}px` : "ok");
    scans.push(s);
  }
  risultati.cliente = aggrega("cliente", scans);
  await ctx.close();
}
}

// ── 3. MERCHANT ──────────────────────────────────────────────────────────
if (include("merchant")) {
console.log("── Scan Area Merchant ──");
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "merchant");
  const links = await raccogliLink(page, "/merchant");
  console.log(`  Link area merchant trovati: ${links.length}`);
  const extra = links.filter((l) => !ROUTES_MERCHANT_STATIC.includes(l));

  // Se il merchant ha negozi, i link dinamici li contengono. In più, per
  // coprire i sottopagina del negozio aggiungiamo le route canoniche con
  // l'ID del primo negozio (estratto dai link se presenti).
  const storeLinks = links.filter((l) => /^\/merchant\/[^/]+(\/|$)/.test(l));
  const storeId = storeLinks.length > 0
    ? storeLinks[0].split("/")[2]
    : process.env.MERCHANT_STORE_ID || null;
  if (storeId) {
    const storeRoutes = [
      `/merchant/${storeId}`,
      `/merchant/${storeId}/ordini`,
      `/merchant/${storeId}/prodotti`,
      `/merchant/${storeId}/prodotti/nuovo`,
      `/merchant/${storeId}/prodotti/ai`,
      `/merchant/${storeId}/guadagni`,
      `/merchant/${storeId}/incassi`,
      `/merchant/${storeId}/impostazioni`,
      `/merchant/${storeId}/media`,
      `/merchant/${storeId}/pagamenti`,
      `/merchant/${storeId}/payout`,
      `/merchant/${storeId}/edit`,
    ];
    for (const r of storeRoutes) if (!extra.includes(r)) extra.push(r);
    console.log(`  StoreId merchant: ${storeId}`);
  }

  const scans = [];
  for (const route of [...ROUTES_MERCHANT_STATIC, ...extra].slice(0, 40)) {
    process.stdout.write(`  ${route} ... `);
    const s = await scanRoute(page, route);
    const maxOv = s.misure?.length ? Math.max(...s.misure.map((m) => m.overflowPx)) : "ERR";
    console.log(maxOv > 0 ? `OVERFLOW max ${maxOv}px` : "ok");
    scans.push(s);
  }
  risultati.merchant = aggrega("merchant", scans);
  await ctx.close();
}
}

// ── 4. AMMINISTRATORE ────────────────────────────────────────────────────
if (include("admin")) {
console.log("── Scan Area Amministratore ──");
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "admin");
  const links = await raccogliLink(page, "/amministratore");
  console.log(`  Link area admin trovati: ${links.length}`);
  const extra = links.filter((l) => !ROUTES_ADMIN_STATIC.includes(l));

  // L'admin vede TUTTI i negozi: copriamo anche la gestione negozio con il
  // primo ID disponibile (dai link o dal negozio fixture merchant).
  const storeLinks = links.filter((l) => /^\/amministratore\/negozi\/[^/]+(\/|$)/.test(l));
  const adminStoreId = storeLinks.length > 0
    ? storeLinks[0].split("/")[3]
    : process.env.MERCHANT_STORE_ID || null;
  if (adminStoreId) {
    for (const r of [
      `/amministratore/negozi/${adminStoreId}`,
      `/amministratore/negozi/${adminStoreId}/edit`,
      `/amministratore/negozi/${adminStoreId}/media`,
      `/amministratore/negozi/${adminStoreId}/prodotti`,
      `/amministratore/negozi/${adminStoreId}/prodotti/nuovo`,
      `/amministratore/negozi/${adminStoreId}/prodotti/ai`,
    ]) {
      if (!extra.includes(r)) extra.push(r);
    }
  }

  const scans = [];
  for (const route of [...ROUTES_ADMIN_STATIC, ...extra].slice(0, 70)) {
    process.stdout.write(`  ${route} ... `);
    const s = await scanRoute(page, route);
    const maxOv = s.misure?.length ? Math.max(...s.misure.map((m) => m.overflowPx)) : "ERR";
    console.log(maxOv > 0 ? `OVERFLOW max ${maxOv}px` : "ok");
    scans.push(s);
  }
  risultati.amministratore = aggrega("amministratore", scans);
  await ctx.close();
}
}

await browser.close();

// ── Salvataggio report (MERGE con eventuale report precedente) ────────────
const outPath = join(dirname(fileURLToPath(import.meta.url)), "audit-overflow-report.json");
let precedente = {};
try {
  precedente = JSON.parse(readFileSync(outPath, "utf8"));
} catch {
  /* report assente: parte da zero */
}
const sezioniUnite = { ...(precedente.sezioni ?? {}) };
for (const [k, v] of Object.entries(report.sezioni)) {
  sezioniUnite[k] = v;
}
writeFileSync(outPath, JSON.stringify({ ...precedente, ...report, sezioni: sezioniUnite, generato: report.generato }, null, 2));

// ── Riepilogo finale ─────────────────────────────────────────────────────
let casiReali = 0;
let casiIntenzionali = 0;
const perRoute = new Map();
for (const [sez, rows] of Object.entries(risultati)) {
  for (const r of rows) {
    if (r.error) continue;
    if (r.overflow > 0) {
      casiReali++;
      const k = `${sez} ${r.route}`;
      if (!perRoute.has(k)) perRoute.set(k, { sez, route: r.route, max: 0, vw: 0 });
      if (r.overflow > perRoute.get(k).max) perRoute.set(k, { ...perRoute.get(k), max: r.overflow, vw: r.vw });
    }
    casiIntenzionali += r.intentional.length;
  }
}
console.log("\n═══════════════════════════════════════════");
console.log(`Report: ${outPath}`);
console.log(`Casi overflow reale (route×viewport): ${casiReali}`);
console.log(`Contenitori overflow intenzionali trovati: ${casiIntenzionali}`);
console.log("\n── Route con overflow (per sezione) ──");
for (const [sez, rows] of Object.entries(risultati)) {
  const ov = [...perRoute.values()].filter((p) => p.sez === sez);
  if (ov.length === 0) continue;
  console.log(`\n${sez.toUpperCase()}:`);
  for (const p of ov) console.log(`  ${p.route}  → max +${p.max}px @ ${p.vw}px`);
}
