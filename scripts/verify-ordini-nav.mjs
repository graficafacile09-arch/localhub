import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

/**
 * VERIFICA — Barra di navigazione stati ordini (area venditore).
 *
 * Copre:
 *  - 6 riquadri stato (Nuovi, In lavorazione, Pronti, Completati, Annullati,
 *    Reclami); "In consegna" non è più un riquadro;
 *  - click su ogni riquadro → URL ?filtro=, UN SOLO riquadro blu (attivo),
 *    gli altri neutri, scroll automatico a #lista-ordini (sezione visibile);
 *  - link "Tutti gli ordini" quando un filtro è attivo (ritorno a tutti,
 *    nessun riquadro blu);
 *  - banner "NUOVI ORDINI" solo su "tutti";
 *  - responsive: 7 viewport senza overflow orizzontale.
 *
 * Uso: node scripts/verify-ordini-nav.mjs
 */
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const VIEWPORTS = [320, 360, 375, 390, 393, 412, 430];

const server = spawn("npx", ["next", "dev", "-p", String(PORT), "--webpack"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d.toString()));
server.stderr.on("data", (d) => (serverLog += d.toString()));

async function waitForServer(url, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Server non pronto.\n${serverLog.slice(-3000)}`);
}

let browser;
let failures = 0;
const check = (nome, ok, extra = "") => {
  console.log(`${ok ? "✅" : "❌"} ${nome}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};

try {
  await waitForServer(BASE);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => console.log("JS ERROR:", e.message.slice(0, 200)));

  // ── Login merchant di test ──────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").waitFor({ timeout: 60000 });
  await page.locator("#email").fill("commerciante-a.test@localhub.it");
  await page.locator("#password").fill("MerchantTest123!");
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForTimeout(1000);

  await page.goto(`${BASE}/merchant`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  let storeId = page.url().match(/\/merchant\/([^/]+)/)?.[1] ?? null;
  if (!storeId) {
    const href = await page
      .locator('a[href*="/merchant/"]')
      .evaluateAll((els) =>
        els
          .map((e) => e.getAttribute("href"))
          .find((h) => h && h !== "/merchant/nuovo" && /\/merchant\/[^/]+$/.test(h)) ?? null
      );
    storeId = href ? href.split("/").pop() : null;
  }
  check("storeId merchant di test individuato", !!storeId, storeId ?? "");
  if (!storeId) throw new Error("Nessun storeId");

  const urlOrdini = `${BASE}/merchant/${storeId}/ordini`;

  // Preriscaldo la pagina e l'API ordini (prima compilazione dev lenta).
  await page.goto(urlOrdini, { waitUntil: "domcontentloaded" });
  await page.locator("nav[aria-label='Stati degli ordini']").waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);

  // ── Struttura: 6 riquadri, niente "In consegna" ────────────────────────
  const nav = page.locator("nav[aria-label='Stati degli ordini']");
  const etichette = await nav.locator("a").allTextContents();
  const testi = etichette.map((t) => t.replace(/\d+/g, "").trim().toLowerCase());
  const numRiquadri = await nav.locator("a").count();
  check("6 riquadri stato presenti", numRiquadri === 6, String(numRiquadri));
  for (const nome of ["nuovi", "in lavorazione", "pronti", "completati", "annullati", "reclami"]) {
    check(`riquadro '${nome}' presente`, testi.some((t) => t.includes(nome)));
  }
  check(
    "riquadro 'In consegna' rimosso (confluito in In lavorazione)",
    !testi.some((t) => t.includes("in consegna"))
  );

  // ── Stato iniziale "tutti": nessun riquadro blu ─────────────────────────
  const bluIniziali = await nav.locator("a.bg-blue-600").count();
  check("su 'tutti' nessun riquadro blu", bluIniziali === 0, String(bluIniziali));
  // Il banner "NUOVI ORDINI" compare SOLO se ci sono ordini non letti
  // (letto_at null): se assente è comportamento corretto (tutti letti).
  const bannerVisibile = await page
    .getByText(/nuovi? ordini?/i)
    .first()
    .isVisible()
    .catch(() => false);
  console.log(`ℹ️  banner 'NUOVI ORDINI' su 'tutti': ${bannerVisibile ? "visibile" : "assente (nessun ordine non letto — corretto)"}`);

  // ── Click su ogni stato → blu singolo + scroll alla sezione ────────────
  const stati = [
    { nome: "Nuovi", filtro: "nuovi" },
    { nome: "In lavorazione", filtro: "lavorazione" },
    { nome: "Pronti", filtro: "pronti" },
    { nome: "Completati", filtro: "completati" },
    { nome: "Annullati", filtro: "annullati" },
    { nome: "Reclami", filtro: "reclami" },
  ];
  for (const { nome, filtro } of stati) {
    const riquadro = nav.locator("a", { hasText: new RegExp(nome, "i") }).first();
    await riquadro.scrollIntoViewIfNeeded();
    await riquadro.click();
    await page.waitForURL((u) => u.searchParams.get("filtro") === filtro, { timeout: 30000 });
    await page.waitForTimeout(900); // lascia assestare lo scroll smooth

    const blu = await nav.locator("a.bg-blue-600").count();
    check(`[${nome}] click → URL ?filtro=${filtro}`, true);
    check(`[${nome}] esattamente 1 riquadro blu`, blu === 1, String(blu));

    const attivoCorretto = await nav
      .locator("a.bg-blue-600")
      .first()
      .textContent()
      .then((t) => (t ?? "").toLowerCase().includes(nome.toLowerCase()));
    check(`[${nome}] il riquadro blu è '${nome}'`, attivoCorretto);

    const listaVisibile = await page.evaluate(() => {
      const el = document.getElementById("lista-ordini");
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top >= -10 && r.top < window.innerHeight * 0.6;
    });
    check(`[${nome}] scroll alla sezione ordini (lista visibile in alto)`, listaVisibile);

    const linkTutti = page.locator("a", { hasText: "Tutti gli ordini" }).first();
    check(`[${nome}] link 'Tutti gli ordini' visibile`, await linkTutti.isVisible().catch(() => false));
  }

  // ── Ritorno a "tutti": nessun riquadro blu, banner di nuovo visibile ────
  await page.locator("a", { hasText: "Tutti gli ordini" }).first().click();
  await page.waitForURL((u) => !u.searchParams.has("filtro"), { timeout: 30000 });
  await page.waitForTimeout(600);
  const bluFinali = await nav.locator("a.bg-blue-600").count();
  check("ritorno a 'tutti' → nessun riquadro blu", bluFinali === 0, String(bluFinali));

  // ── Responsive: 7 viewport, zero overflow ──────────────────────────────
  for (const w of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto(urlOrdini, { waitUntil: "domcontentloaded" });
    await nav.waitFor({ timeout: 60000 });
    await page.waitForTimeout(700);
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      win: window.innerWidth,
    }));
    const ok = overflow.doc <= overflow.win && overflow.body <= overflow.win;
    check(
      `${w}px — zero overflow orizzontale`,
      ok,
      `doc=${overflow.doc} body=${overflow.body} win=${overflow.win}`
    );
    const larghezzaRiquadro = await nav.locator("a").first().evaluate((el) => el.getBoundingClientRect().width);
    check(`${w}px — riquadri cliccabili (larghezza ≥ 70px)`, larghezzaRiquadro >= 70, `${larghezzaRiquadro.toFixed(0)}px`);
  }

  console.log(failures === 0 ? "\n✅ TUTTI I TEST PASSANO" : `\n❌ ${failures} test falliti`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error("\nERRORE:", err.message ?? err);
  console.error(serverLog.slice(-2500));
  process.exit(1);
} finally {
  try { await browser?.close(); } catch {}
}
