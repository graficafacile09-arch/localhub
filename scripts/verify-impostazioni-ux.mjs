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

async function attesaVisible(locator, nome, timeout = 25000) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    check(nome, true);
  } catch {
    check(nome, false);
  }
}

async function attesaNascosto(locator, nome, timeout = 8000) {
  try {
    await locator.first().waitFor({ state: "hidden", timeout });
    check(nome, true);
  } catch {
    check(nome, false);
  }
}

/** Imposta un valore su un input React in modo robusto (con retry). */
async function setInput(page, locator, valore) {
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    await locator.fill(valore);
    await page.waitForTimeout(300);
    const attuale = await locator.inputValue().catch(() => "");
    if (attuale === valore) return;
    // fallback: selezione totale + digitazione reale
    await locator.click({ clickCount: 3 });
    await locator.press("Backspace");
    await locator.pressSequentially(valore, { delay: 15 });
    await page.waitForTimeout(300);
    if ((await locator.inputValue().catch(() => "")) === valore) return;
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

  const urlImpostazioni = `${BASE}/merchant/${storeId}/impostazioni`;

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

  const nomeReale = (await page.evaluate(async (id) => {
    const r = await fetch(`/api/merchant/stores/${id}/settings`);
    const j = await r.json();
    return j.data?.settings?.nome ?? "";
  }, storeId)) || "";

  // ══ SALVATAGGIO — PRIMA interazione (pattern verificato: modulo a mount fresco) ══
  await page.getByRole("button", { name: /Modifica informazioni/ }).first().click();
  const campoNome = page.locator('section#informazioni input[type="text"]').first();
  await attesaVisible(campoNome, "click su 'Modifica informazioni' → form si espande");
  await page.waitForFunction(() => {
    const el = document.querySelector('section#informazioni input[type="text"]');
    return el && el.value !== "";
  }, { timeout: 15000 });

  const nuovoNome = `Negozio UX ${Date.now()}`;
  await setInput(page, campoNome, nuovoNome);
  const campoSlug = page.locator('section#informazioni input[placeholder="nome-del-negozio"]');
  await setInput(page, campoSlug, `negozio-ux-${Date.now()}`);
  await page.waitForTimeout(400);
  check("modifica → indicatore 'Non salvato' visibile", await page.locator('section#informazioni').getByText("Non salvato").first().isVisible());
  await page.locator('section#informazioni button:has-text("Salva modifiche")').first().click();
  await attesaVisible(page.locator('section#informazioni').getByText("Modifiche salvate."), "salvataggio ok → messaggio verde 'Modifiche salvate'");
  await attesaNascosto(page.locator('section#informazioni').getByText("Non salvato").first(), "salvataggio ok → 'Non salvato' sparisce");

  // ── Errore di salvataggio (risposta 500 simulata) ───────────────────────
  await setInput(page, campoNome, `${nuovoNome} 2`);
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
  await page.getByRole("button", { name: /Modifica informazioni/ }).first().click();
  await attesaVisible(campoNome, "reload → form Informazioni di nuovo apribile");
  await page.waitForFunction((nome) => {
    const el = document.querySelector('section#informazioni input[type="text"]');
    return el && el.value === nome;
  }, nuovoNome, { timeout: 30000 });
  const dopoReload = await page.locator('section#informazioni input[type="text"]').first().inputValue();
  check("persistenza dopo reload (nome salvato)", dopoReload === nuovoNome, dopoReload);
  await page.getByRole("button", { name: /Chiudi/ }).first().click().catch(() => {});
  await attesaNascosto(campoNome, "click 'Chiudi' → form si richiude");

  // ══ HEADER della pagina ══
  await attesaVisible(
    page.getByText("Tieni aggiornata la tua vetrina e fai conoscere il tuo negozio ai clienti.").first(),
    "header mostra la frase umana di benvenuto"
  );
  check("header mostra il nome del negozio", (await page.getByRole("heading", { level: 1 }).first().innerText()).length > 0);

  // ══ CARD HERO "Il tuo negozio" ══
  await attesaVisible(page.getByText("Il tuo negozio", { exact: true }).first(), "card hero 'Il tuo negozio' presente");
  await attesaVisible(page.getByRole("button", { name: /Modifica negozio/ }).first(), "card hero contiene il pulsante 'Modifica negozio'");
  const statoVetrina = await page.getByText(/Negozio configurato|Completa:/).first().isVisible().catch(() => false);
  check("card hero mostra lo stato della vetrina (configurato/completa)", statoVetrina);

  // ══ AZIONI PRINCIPALI ══
  const azioni = ["Modifica informazioni", "Foto del negozio", "Gestisci prodotti", "Come vendi"];
  let okAzioni = true;
  for (const a of azioni) {
    try { await page.getByRole("button", { name: new RegExp(a) }).first().waitFor({ timeout: 8000 }); }
    catch { okAzioni = false; }
  }
  check("le 4 azioni principali sono visibili (informazioni, foto, prodotti, vendita)", okAzioni);

  await page.getByRole("button", { name: /Gestisci prodotti/ }).first().click();
  await attesaVisible(
    page.locator('section#prodotti a[href*="/prodotti"]').first(),
    "azione 'Gestisci prodotti' apre la sezione Catalogo col modulo Prodotti"
  );

  // ══ 5 sezioni presenti ══
  const sezioni = ["Il mio negozio", "Vendita", "Catalogo e offerte", "Visibilità e promozione", "Impostazioni avanzate"];
  let okSezioni = true;
  for (const s of sezioni) {
    try { await page.getByRole("button", { name: new RegExp(s) }).first().waitFor({ timeout: 10000 }); }
    catch { okSezioni = false; }
  }
  check("le 5 sezioni accordion sono renderizzate", okSezioni);
  check("badge 'Inizia da qui' sulla sezione principale", (await page.getByText("Inizia da qui").count()) > 0);

  // ══ Card-modulo con riepilogo dello stato attuale ══
  await page.getByRole("button", { name: /Il mio negozio/ }).first().click();
  await attesaVisible(page.getByRole("button", { name: /Modifica orari/ }).first(), "'Il mio negozio' aperta (card 'Modifica orari' visibile)");
  const cardInfo = page.locator('button:has-text("Modifica informazioni")').filter({ hasText: nuovoNome }).first();
  const cardInfoText = await cardInfo.innerText();
  check(
    "card Informazioni mostra il riepilogo (nuovo nome del negozio)",
    cardInfoText.includes(nuovoNome),
    `riepilogo: ${cardInfoText.split("\n")[2] ?? ""}`
  );

  // ══ Espansione modulo Orari ══
  await page.getByRole("button", { name: /Modifica orari/ }).first().click();
  await attesaVisible(page.locator('section#orari').first(), "click su card 'Modifica orari' → modulo Orari si espande");
  await page.getByRole("button", { name: /Chiudi/ }).first().click();
  await attesaNascosto(page.locator('section#orari').first(), "click 'Chiudi' → modulo Orari si richiude");

  // ══ Apertura Vendita chiude Il mio negozio ══
  await page.getByRole("button", { name: /Vendita/ }).first().click();
  await page.waitForTimeout(800);
  await attesaNascosto(
    page.getByRole("button", { name: /Modifica orari/ }).first(),
    "apertura 'Vendita' chiude 'Il mio negozio'"
  );
  await attesaVisible(page.getByRole("button", { name: /Modifica modalità di vendita/ }).first(), "'Vendita' contiene card 'Come vendi'");
  await attesaVisible(page.getByRole("button", { name: /Configura spedizione/ }).first(), "'Vendita' contiene card 'Spedizione' (chiusa di default)");
  await attesaVisible(
    page.locator('a[href*="/pagamenti"]').filter({ hasText: "Metodo di pagamento" }).first(),
    "'Vendita' contiene la card Metodo di pagamento (link a /pagamenti)"
  );
  const spedText = await page.locator('button:has-text("Configura spedizione")').first().innerText();
  check(
    "card Spedizione mostra un riepilogo (pacco o 'Non ancora configurato')",
    /Pacco: |Non ancora configurato/.test(spedText),
    `riepilogo: ${spedText.split("\n")[2] ?? ""}`
  );
  await page.getByRole("button", { name: /Configura spedizione/ }).first().click();
  await attesaVisible(
    page.locator('button:has-text("📦 Configura pacco e spedizione")').first(),
    "card Spedizione → accordion interno visibile"
  );
  await page.locator('a[href*="/pagamenti"]').filter({ hasText: "Metodo di pagamento" }).first().click();
  await page.waitForURL(/\/pagamenti/, { timeout: 15000 });
  check("card Metodo di pagamento → pagina /pagamenti", page.url().includes("/pagamenti"));
  await page.goto(urlImpostazioni, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /Il mio negozio/ }).first().waitFor({ timeout: 60000 });

  // ══ Catalogo e offerte ══
  await page.getByRole("button", { name: /Catalogo e offerte/ }).first().click();
  await attesaVisible(page.getByRole("button", { name: /Gestisci catalogo/ }).first(), "'Catalogo e offerte' mostra card Prodotti");
  await attesaVisible(page.getByRole("button", { name: /Gestisci servizi/ }).first(), "'Catalogo e offerte' mostra card Servizi");
  check("Offerte NON mostrate (filtro moduli_attivi)", (await page.getByRole("button", { name: /Gestisci offerte/ }).count()) === 0);
  check("Eventi NON mostrati (filtro moduli_attivi)", (await page.getByRole("button", { name: /Gestisci eventi/ }).count()) === 0);

  // ══ Visibilità e promozione ══
  await page.getByRole("button", { name: /Visibilità e promozione/ }).first().click();
  await attesaVisible(page.getByRole("button", { name: /Gestisci social/ }).first(), "'Visibilità e promozione' mostra card Social");
  await attesaVisible(page.getByRole("button", { name: /Migliora su Google/ }).first(), "'Visibilità e promozione' mostra card 'Visibilità su Google' (SEO)");
  await attesaVisible(page.getByRole("button", { name: /Configura assistente/ }).first(), "'Visibilità e promozione' mostra card Assistente AI");

  // ══ Impostazioni avanzate ══
  await page.getByRole("button", { name: /Impostazioni avanzate/ }).first().click();
  await attesaVisible(page.getByRole("button", { name: /Modifica preferenze/ }).first(), "'Impostazioni avanzate' mostra card Preferenze");

  // ══ RESPONSIVE: nessun overflow a 7 viewport ══
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(urlImpostazioni, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Il mio negozio/ }).first().waitFor({ timeout: 60000 });
    let overflow = 0;
    for (const s of sezioni) {
      await page.getByRole("button", { name: new RegExp(s) }).first().click();
      await page.waitForTimeout(700);
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
