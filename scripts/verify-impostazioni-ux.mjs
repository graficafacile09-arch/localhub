import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

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

/** Attende che un elemento sia visibile (con retry) e valuta l'asserzione. */
async function attesaVisible(locator, nome, timeout = 20000) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    check(nome, true);
  } catch {
    check(nome, false);
  }
}

/** Attende che un elemento NON sia visibile (con retry) e valuta l'asserzione. */
async function attesaNascosto(locator, nome, timeout = 8000) {
  try {
    await locator.first().waitFor({ state: "hidden", timeout });
    check(nome, true);
  } catch {
    check(nome, false);
  }
}

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
  await page.waitForURL(`${BASE}/`, { timeout: 30000 });

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

  const urlImpostazioni = `${BASE}/merchant/${storeId}/impostazioni`;

  // Pre-riscalda le route API (in dev la prima chiamata compila on-demand
  // e può richiedere decine di secondi: qui vengono compilate una volta).
  const warmUrls = [
    `/api/merchant/stores/${storeId}/settings`,
    `/api/merchant/stores/${storeId}/offerte`,
    `/api/merchant/stores/${storeId}/eventi`,
    `/api/merchant/stores/${storeId}/spedizione`,
  ];
  for (const u of warmUrls) {
    try { await page.evaluate(async (url) => { await fetch(url); }, `${BASE}${u}`); } catch {}
  }

  await page.goto(urlImpostazioni, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Il mio negozio/ }).first().waitFor({ timeout: 60000 });

  // ── 5 sezioni presenti ──────────────────────────────────────────────────
  const sezioni = ["Il mio negozio", "Vendita", "Catalogo e offerte", "Visibilità e promozione", "Impostazioni avanzate"];
  let okSezioni = true;
  for (const s of sezioni) {
    try { await page.getByRole("button", { name: new RegExp(s) }).first().waitFor({ timeout: 10000 }); }
    catch { okSezioni = false; }
  }
  check("le 5 sezioni accordion sono renderizzate", okSezioni);

  // ── Solo una sezione aperta all'inizio (Il mio negozio) ─────────────────
  const campoNome = page.locator('section#informazioni input[type="text"]').first();
  await attesaVisible(campoNome, "'Il mio negozio' aperta di default (campo Nome visibile)");
  await attesaNascosto(
    page.locator('button:has-text("Configura pacco e spedizione")').first(),
    "'Vendita' chiusa all'avvio (accordion spedizione nascosto)"
  );

  // ── Apertura Vendita chiude Il mio negozio ──────────────────────────────
  await page.getByRole("button", { name: /Vendita/ }).first().click();
  await page.waitForTimeout(800);
  await attesaNascosto(campoNome, "apertura 'Vendita' chiude 'Il mio negozio'");
  const spedizioneBtn = page.locator('button:has-text("Configura pacco e spedizione")').first();
  await attesaVisible(spedizioneBtn, "'Vendita' contiene Spedizione (accordion)");
  await attesaVisible(page.getByText("Ritiro in negozio"), "'Vendita' contiene Modalità di vendita");
  const cardPagamenti = page.locator('a[href*="/pagamenti"]').filter({ hasText: "Metodo di pagamento" }).first();
  await attesaVisible(cardPagamenti, "'Vendita' contiene la card Metodo di pagamento (link a /pagamenti)");

  // ── Apertura della spedizione ───────────────────────────────────────────
  await spedizioneBtn.click();
  await page.waitForTimeout(500);
  await attesaVisible(page.locator('button:has-text("Salva pacco")').first(), "accordion spedizione si apre");

  // ── Navigazione verso Pagamenti dalla card ──────────────────────────────
  await cardPagamenti.click();
  await page.waitForURL(/\/pagamenti/, { timeout: 15000 });
  check("card Metodo di pagamento → pagina /pagamenti", page.url().includes("/pagamenti"));
  await page.goto(urlImpostazioni, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Il mio negozio/ }).first().waitFor({ timeout: 60000 });

  // ── Catalogo e offerte ──────────────────────────────────────────────────
  await page.getByRole("button", { name: /Catalogo e offerte/ }).first().click();
  await attesaVisible(page.getByText("Gestisci catalogo prodotti"), "'Catalogo e offerte' mostra Prodotti (link gestione)");
  await attesaVisible(page.getByText("Servizi offerti dal negozio"), "'Catalogo e offerte' mostra Servizi");
  // Il negozio di test NON ha offerte/eventi in moduli_attivi: il filtro deve nasconderli.
  check("Offerte NON mostrate (filtro moduli_attivi)", (await page.getByText("Aggiungi offerta").count()) === 0);
  check("Eventi NON mostrati (filtro moduli_attivi)", (await page.getByText("Aggiungi evento").count()) === 0);

  // ── Visibilità e promozione ─────────────────────────────────────────────
  await page.getByRole("button", { name: /Visibilità e promozione/ }).first().click();
  await attesaVisible(page.getByText("Link a profili social"), "'Visibilità e promozione' mostra Social");
  await attesaVisible(page.getByText("Meta tag e keywords"), "'Visibilità e promozione' mostra SEO");
  await attesaVisible(page.getByText("Dati per l'assistente AI del negozio"), "'Visibilità e promozione' mostra AI");

  // ── Impostazioni avanzate ───────────────────────────────────────────────
  await page.getByRole("button", { name: /Impostazioni avanzate/ }).first().click();
  await attesaVisible(page.getByText("Negozio attivo", { exact: false }).first(), "'Impostazioni avanzate' mostra toggle 'Negozio attivo'");

  // ── Salvataggio riuscito + dirty state (nel modulo Informazioni) ────────
  await page.getByRole("button", { name: /Il mio negozio/ }).first().click();
  await attesaVisible(campoNome, "riapertura 'Il mio negozio' dopo le altre sezioni");
  const nuovoNome = `Negozio UX ${Date.now()}`;
  await campoNome.fill(nuovoNome);
  // Il server rifiuta slug vuoto (422): lo slug viene compilato come farebbe un commerciante.
  await page.locator('section#informazioni input[placeholder="nome-del-negozio"]').fill(`negozio-ux-${Date.now()}`);
  await page.waitForTimeout(400);
  check("modifica → indicatore 'Non salvato' visibile", await page.locator('section#informazioni').getByText("Non salvato").first().isVisible());
  await page.locator('section#informazioni button:has-text("Salva modifiche")').first().click();
  await attesaVisible(page.locator('section#informazioni').getByText("Modifiche salvate."), "salvataggio ok → messaggio verde 'Modifiche salvate'");
  await attesaNascosto(page.locator('section#informazioni').getByText("Non salvato").first(), "salvataggio ok → 'Non salvato' sparisce");

  // ── Errore di salvataggio (risposta 500 simulata) ───────────────────────
  await campoNome.fill(`${nuovoNome} 2`);
  await page.route("**/api/merchant/stores/*/settings", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "Errore simulato dal test" } }) });
    } else {
      await route.continue();
    }
  });
  await page.locator('section#informazioni button:has-text("Salva modifiche")').first().click();
  await attesaVisible(page.locator('section#informazioni').getByText("Errore simulato dal test"), "errore server → messaggio rosso con testo errore");
  check("errore server → 'Non salvato' resta (dirty non perso)", await page.locator('section#informazioni').getByText("Non salvato").first().isVisible());
  await page.unroute("**/api/merchant/stores/*/settings");

  // ── Persistenza dopo reload ─────────────────────────────────────────────
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Il mio negozio/ }).first().waitFor({ timeout: 60000 });
  await attesaVisible(campoNome, "reload → 'Il mio negozio' di nuovo aperta");
  const dopoReload = await page.locator('section#informazioni input[type="text"]').first().inputValue();
  check("persistenza dopo reload (nome salvato)", dopoReload === nuovoNome, dopoReload);

  // ── RESPONSIVE: nessun overflow a 7 viewport, tutte le sezioni aperte ───
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(urlImpostazioni, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Il mio negozio/ }).first().waitFor({ timeout: 60000 });
    let overflow = 0;
    for (const s of sezioni) {
      await page.getByRole("button", { name: new RegExp(s) }).first().click();
      await page.waitForTimeout(700);
      const btn = page.locator('button:has-text("Configura pacco e spedizione")').first();
      if (await btn.isVisible()) {
        const aperto = await btn.getAttribute("aria-expanded");
        if (aperto === "false") await btn.click();
        await page.waitForTimeout(300);
      }
      const misure = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      overflow = Math.max(overflow, misure.doc, misure.body);
    }
    check(`viewport ${width}px → nessun overflow orizzontale`, overflow <= 0, `overflow=${overflow}px`);
  }

  await browser.close();
} catch (e) {
  console.error("ERRORE:", e.message.slice(0, 500));
  failures++;
} finally {
  try { server.kill(); } catch {}
}

console.log(failures === 0 ? "\n✅ TUTTI I TEST FUNZIONALI/RESPONSIVE SUPERATI" : `\n❌ ${failures} test falliti`);
process.exit(failures === 0 ? 0 : 1);
