/**
 * COLLAUDO ONBOARDING V2 TEST — completa l'onboarding hosted Stripe per
 * acct_1U7F5qHkkhYZe4Js (Negozio UX) usando SOLO dati di test, poi verifica
 * il ritorno su /ritorno-stripe.
 *
 * La route /api/pagamenti/connect/crea riusa l'account esistente e genera un
 * Account Link con return_url = NEXT_PUBLIC_SITE_URL (impostata dal chiamante
 * su http://127.0.0.1:PORTA affinché il ritorno arrivi sul dev server).
 *
 * Uso: COLLAUDO_STRIPE_KEY="sk_test_..." node scripts/__collaudo-onboarding-v2.ts
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, type Browser, type Page } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

const NEGOZIO_ID = "87283398-408e-4760-bb83-8061cce578a4";
const ACCOUNT_ATTESO = "acct_1U7F5qHkkhYZe4Js";
const EMAIL = "commerciante-a.test@localhub.it";
const PASSWORD = "MerchantTest123!";
const PORTA = Number(process.env.COLLAUDO_PORT ?? 3199);
const BASE = `http://127.0.0.1:${PORTA}`;
const CHIAVE_TEST_PAYMENTS = "chiave-collaudo-onboarding-0001";
const SCREENSHOT_DIR = join(PROGETTO, "screenshots");

// PNG 1x1 per eventuale upload documento in test mode.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let passati = 0;
let falliti = 0;
function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

function loadEnv() {
  try {
    const raw = readFileSync(join(PROGETTO, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

let server: ReturnType<typeof spawn> | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "collaudo-onboarding-next-dev.log"), { flags: "w" });
  server = spawn(`npx next dev -p ${PORTA} --webpack`, {
    cwd: PROGETTO,
    env: {
      ...process.env,
      STRIPE_SECRET_KEY: process.env.COLLAUDO_STRIPE_KEY ?? "",
      // return_url degli Account Link → dev server locale (mai produzione).
      NEXT_PUBLIC_SITE_URL: BASE,
      PAYMENTS_ENCRYPTION_KEY: CHIAVE_TEST_PAYMENTS,
      RESEND_API_KEY: "",
      ORDINI_RATE_LIMIT_PER_MINUTE: "1000",
      ORDINI_RATE_LIMIT_PER_HOUR: "10000",
      NODE_ENV: "development",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error("Server dev terminato. Vedi " + join(tmpdir(), "collaudo-onboarding-next-dev.log"));
    }
    try {
      const res = await fetch(`${BASE}/login`);
      if (res.status === 200) {
        console.log(`\nServer dev pronto su ${BASE} (chiave TEST).\n`);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Server dev non pronto entro 240s.");
}

function fermaServer(): void {
  if (!server) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  } catch {}
  server = null;
}

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("#email").waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(1500);
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** Dettagli dei controlli visibili (per log + filling). */
async function controlliVisibili(page: Page) {
  return page.evaluate(() => {
    const out: Array<Record<string, string>> = [];
    const visibile = (el: Element) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
    };
    for (const el of Array.from(document.querySelectorAll("input, select, textarea, button, [role=radio], [role=checkbox]"))) {
      if (!visibile(el)) continue;
      const e = el as HTMLInputElement;
      const label = e.labels?.[0]?.innerText?.trim() ?? "";
      const info: Record<string, string> = {
        tag: e.tagName.toLowerCase(),
        type: (e as HTMLInputElement).type ?? "",
        name: e.getAttribute("name") ?? "",
        id: e.id ?? "",
        autocomplete: e.getAttribute("autocomplete") ?? "",
        placeholder: e.getAttribute("placeholder") ?? "",
        label: label.slice(0, 60),
        role: e.getAttribute("role") ?? "",
        testo: (e.textContent ?? "").trim().slice(0, 50),
      };
      out.push(info);
    }
    return out;
  });
}

function valorePerAutocomplete(auto: string): string | null {
  const a = (auto || "").toLowerCase();
  if (a.includes("given-name")) return "Mario";
  if (a.includes("family-name")) return "Rossi";
  if (a.includes("email")) return EMAIL;
  // Telefono: il componente Stripe separa prefisso (già +39) dal numero locale.
  if (a.includes("tel")) return "3512345678";
  if (a.includes("address-line1")) return "Via Roma 1";
  if (a.includes("address-line2")) return "";
  if (a.includes("address-level2") || a.includes("locality")) return "Castrovillari";
  if (a.includes("postal-code")) return "87100";
  if (a.includes("organization")) return "Negozio UX Test";
  if (a.includes("cc-name")) return "Mario Rossi";
  if (a.includes("iban")) return "IT60X0542811101000000123456";
  if (a.includes("url")) return "https://www.incitta.online";
  if (a.includes("country")) return "IT";
  return null;
}

function valorePerEtichetta(testo: string): string | null {
  const t = (testo || "").toLowerCase();
  if (t.includes("nome") && (t.includes("cognome") || t.includes("cognome") || t.includes("name"))) return "Mario";
  if (t.includes("cognome")) return "Rossi";
  if (t.includes("e-mail") || t.includes("email")) return EMAIL;
  if (t.includes("telefono")) return "3512345678";
  if (t.includes("indirizzo") || t.includes("via ")) return "Via Roma 1";
  if (t.includes("citt")) return "Castrovillari";
  if (t.includes("codice postale") || t.includes("cap")) return "87100";
  if (t.includes("codice fiscale") || t.includes("s.s.n") || t.includes("ssn") || t.includes("codice fisc")) return "RSSMRA80A01H501U";
  if (t.includes("titolare") || t.includes("intestatario")) return "Mario Rossi";
  if (t.includes("iban")) return "IT60X0542811101000000123456";
  if (t.includes("sito web") || t.includes("url") || t.includes("website")) return "https://www.incitta.online";
  if (t.includes("ragione sociale") || t.includes("denominazione") || t.includes("business name")) return "Negozio UX Test";
  return null;
}

/** Compila i controlli visibili con dati di test. */
async function compila(page: Page, passo: number) {
  const riempiti: string[] = [];
  await page.evaluate(() => window.scrollTo(0, 0));

  // 1. Input di testo.
  const inputs = page.locator("input:visible");
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const input = inputs.nth(i);
    const tipo = (await input.getAttribute("type")) ?? "text";
    if (!["text", "tel", "email", "search", "url", "number", undefined].includes(tipo)) continue;
    if (tipo === "number") continue;
    const auto = (await input.getAttribute("autocomplete")) ?? "";
    const ph = (await input.getAttribute("placeholder")) ?? "";
    const name = (await input.getAttribute("name")) ?? "";
    const label = (await input.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.innerText?.trim() ?? "")).toLowerCase();
    const giaPieno = (await input.inputValue() ?? "").trim();
    let valore = valorePerAutocomplete(auto) ?? valorePerEtichetta(label) ?? null;
    // MCC / categoria attività: campo di ricerca.
    if (!valore && (label.includes("categoria") || label.includes("attività") || ph.toLowerCase().includes("categoria") || /mcc/i.test(name) || /mcc/i.test(auto))) {
      valore = "5399";
    }
    if (!valore && /^[a-z ]*iban/i.test(label)) valore = "IT60X0542811101000000123456";
    if (valore && giaPieno !== valore) {
      try {
        await input.fill(valore);
        riempiti.push(`${name || label || ph || "input"}="${valore}"`);
      } catch {}
    }
  }

  // 0. Scorciatoia test Stripe: "Use test phone number" / "usa un numero di telefono di test".
  const scorciatoia = page.locator("text=/Use test phone number|usa (un )?numero di telefono di test/i").first();
  if ((await scorciatoia.count()) > 0) {
    try {
      await scorciatoia.click({ force: true });
      riempiti.push("use-test-phone✓");
    } catch {}
  }

  // 2. Select.
  const selects = page.locator("select:visible");
  const sn = await selects.count();
  for (let i = 0; i < sn; i++) {
    const sel = selects.nth(i);
    const label = (await sel.evaluate((el) => (el as HTMLSelectElement).labels?.[0]?.innerText?.trim() ?? "")).toLowerCase();
    const opts = await sel.locator("option").allInnerTexts();
    try {
      if (label.includes("anno") || label.includes("year")) {
        if (opts.some((o) => o.trim() === "1980")) await sel.selectOption({ label: "1980" });
        continue;
      }
      if (label.includes("mese") || label.includes("month")) {
        const m = opts.find((o) => /genn|january|^1$|01/.test(o.trim().toLowerCase()));
        if (m) await sel.selectOption({ label: m });
        continue;
      }
      if (label.includes("giorno") || label.includes("day")) {
        if (opts.some((o) => o.trim() === "1")) await sel.selectOption({ label: "1" });
        continue;
      }
      if (label.includes("paese") || label.includes("nazione") || label.includes("country")) {
        const it = opts.find((o) => /italia|italy|^it$/.test(o.trim().toLowerCase()));
        if (it) await sel.selectOption({ label: it });
        continue;
      }
      if (label.includes("provincia") || label.includes("stato") || label.includes("region")) {
        const cs = opts.find((o) => /cosenza|calabria|^cs$/i.test(o.trim()));
        if (cs) await sel.selectOption({ label: cs });
        continue;
      }
      // Ultima spiaggia: prima opzione non vuota.
      const prima = opts.find((o) => o.trim());
      if (prima) await sel.selectOption({ label: prima });
      riempiti.push(`select[${label}]=${prima}`);
    } catch {}
  }

  // 3. Checkbox (TOS / consenso) → spunta.
  const checks = page.locator('input[type="checkbox"]:visible');
  const cn = await checks.count();
  for (let i = 0; i < cn; i++) {
    try {
      const c = checks.nth(i);
      if (!(await c.isChecked())) {
        await c.check({ force: true });
        riempiti.push("checkbox✓");
      }
    } catch {}
  }

  // 4. Radio (tipo attività) → opzione individuale.
  const radios = page.locator('input[type="radio"]:visible');
  const rn = await radios.count();
  if (rn > 0) {
    let scelto = false;
    for (let i = 0; i < rn; i++) {
      const r = radios.nth(i);
      const txt = ((await r.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.innerText?.trim() ?? "")) || "").toLowerCase();
      if (/individual|ditta individuale|persona fisica|imprenditore individuale|sole proprietor/.test(txt)) {
        try {
          await r.check({ force: true });
          scelto = true;
          riempiti.push("radio-individuale✓");
          break;
        } catch {}
      }
    }
    if (!scelto) {
      try {
        await radios.first().check({ force: true });
        riempiti.push("radio-prima✓");
      } catch {}
    }
  }

  // 5. Upload documento (test mode) → PNG 1x1.
  const files = page.locator('input[type="file"]:visible');
  const fn = await files.count();
  if (fn > 0) {
    const tmp = join(tmpdir(), "doc-test.png");
    writeFileSync(tmp, PNG_1PX);
    try {
      await files.first().setInputFiles(tmp);
      riempiti.push("file-upload✓");
    } catch {}
  }

  console.log(`  [passo ${passo}] riempiti: ${riempiti.length ? riempiti.join(", ") : "(nessuno)"}`);
  return riempiti;
}

/** Trova e clicca il pulsante principale di avanzamento. */
async function cliccaAvanti(page: Page): Promise<boolean> {
  // Se c'è un suggerimento aperto (combobox MCC/categoria) → seleziona il primo.
  try {
    const opzione = page.locator("[role=option]:visible, li[role=option]:visible, ul[role=listbox] li:visible").first();
    if ((await opzione.count()) > 0 && (await opzione.isVisible())) {
      await opzione.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
    }
  } catch {}

  const candidati = page.locator("button:visible, input[type=submit]:visible, [role=button]:visible");
  const n = await candidati.count();
  const testi: string[] = [];
  const match = /(continua|avanti|invia|salva|submit|continue|next|conferma|completa|accetta|inizia|get started|let's go|invia)/i;
  for (let i = 0; i < n; i++) {
    const t = ((await candidati.nth(i).innerText()) ?? (await candidati.nth(i).getAttribute("value")) ?? "").trim();
    testi.push(t.slice(0, 40));
    if (match.test(t) && !/(annulla|cancel|back|indietro)/i.test(t)) {
      try {
        await candidati.nth(i).click({ force: true, timeout: 8000 });
        return true;
      } catch {}
    }
  }
  console.log("  ⚠️ nessun pulsante di avanzamento riconosciuto. Testi bottoni:", testi.slice(0, 10));
  return false;
}

/** Testo di errore di validazione visibile. */
async function erroreVisibile(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll("[role=alert], [aria-live], .Error, .error, p, span, div")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((e) => (e.textContent ?? "").trim())
      .find((t) => /(per favore|correggi|obbligatorio|non valido|manca|required|invalid|please)/i.test(t) && t.length < 300);
    return el ?? "";
  });
}

async function main() {
  loadEnv();
  const stripeKey = process.env.COLLAUDO_STRIPE_KEY ?? "";
  if (!stripeKey.startsWith("sk_test_")) {
    throw new Error("COLLAUDO_STRIPE_KEY deve essere una chiave sk_test_ (mai live).");
  }
  console.log(`Chiave Stripe: ${stripeKey.slice(0, 8)}… (TEST)`);

  let browser: Browser | null = null;
  try {
    await avviaServer();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrori: string[] = [];
    const pageErrori: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrori.push(m.text()); });
    page.on("pageerror", (e) => pageErrori.push(e.message));

    await login(page);
    check("1. login owner ok", !page.url().includes("/login"), page.url());

    await page.goto(`${BASE}/merchant/${NEGOZIO_ID}/pagamenti`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const pulsante = page.locator("button").filter({ hasText: /Riprendi onboarding|Crea o Collega il tuo conto Stripe/ });
    await pulsante.first().waitFor({ state: "visible", timeout: 60_000 });

    const rispostaP = page.waitForResponse(
      (r) => r.url().includes("/api/pagamenti/connect/crea") && r.request().method() === "POST",
      { timeout: 120_000 }
    );
    console.log("\n── CLICK 'Riprendi onboarding' ──");
    await pulsante.first().click();
    const res = await rispostaP;
    const status = res.status();
    const body: any = await res.json().catch(() => null);
    console.log(`POST connect/crea → HTTP ${status}`);
    if (body?.error) console.log("  ERRORE route:", JSON.stringify(body.error).slice(0, 300));

    // Attende di arrivare sul portale Stripe.
    let urlStripe = "";
    try {
      await page.waitForURL((u) => u.hostname === "connect.stripe.com", { timeout: 45_000 });
      urlStripe = page.url();
    } catch {
      check("4. atterraggio su connect.stripe.com", false, page.url());
      console.log("  URL:", page.url());
      return;
    }
    // La landing URL contiene l'account riusato → prova di success=true + url.
    const urlProvaAccount = urlStripe.includes(`/setup/e/${ACCOUNT_ATTESO}`);
    check("2. success=true + data.url (da risposta o landing)", (body?.success === true && !!body?.data?.url) || urlProvaAccount, {
      bodySuccess: body?.success,
      urlLanding: urlStripe.slice(0, 60),
    });
    check("3. account riusato (stesso id)", body?.data?.accountId === ACCOUNT_ATTESO || urlProvaAccount, {
      bodyAccountId: body?.data?.accountId,
      urlProvaAccount,
    });
    check("4. atterraggio su connect.stripe.com", true);
    console.log(`URL onboarding: ${urlStripe.slice(0, 90)}…`);

    // Attende che il wizard finisca di renderizzare (React): il primo istante
    // la pagina è vuota (0 bottoni), serve aspettare i controlli reali.
    await page
      .waitForSelector("a[role=button]", { state: "visible", timeout: 90_000 })
      .catch(() => console.log("  ⚠️ nessun a[role=button] visibile dopo 90s"));
    await page.waitForTimeout(2500);

    // ── WIZARD ONBOARDING (dati di test) ──
    let passo = 0;
    let ultimaFingerprint = "";
    let suStripe = true;
    const MAX_PASSI = 30;
    while (suStripe && passo < MAX_PASSI) {
      passo++;
      const url = page.url();
      if (url.startsWith(BASE)) { suStripe = false; break; }

      await page.screenshot({ path: join(SCREENSHOT_DIR, `onboarding-passo-${String(passo).padStart(2, "0")}.png`), fullPage: false }).catch(() => {});
      const ctrl = await controlliVisibili(page);
      const fingerprint = JSON.stringify(ctrl.map((c) => `${c.tag}:${c.type}:${c.name}:${c.autocomplete}:${c.label}`));
      const testoPagina = (await page.evaluate(() => document.body.innerText)).slice(0, 2000);
      console.log(`\n── PASSO ${passo} (${url.slice(0, 80)}…) — controlli visibili: ${ctrl.length}`);
      const err = await erroreVisibile(page);
      if (err) console.log(`  ⚠️ errore visibile: ${err.slice(0, 200)}`);

      // Evita loop: se lo stesso step non avanza dopo un riempimento, logga e prosegue.
      if (fingerprint === ultimaFingerprint && passo > 1) {
        console.log(`  ↺ stesso step ripetuto (${passo}). Pagina:\n  ${testoPagina.replace(/\n+/g, " ").slice(0, 400)}`);
        await page.waitForTimeout(3000);
        ultimaFingerprint = "";
        continue;
      }
      ultimaFingerprint = fingerprint;

      await compila(page, passo);
      const cliccato = await cliccaAvanti(page);
      if (!cliccato) {
        console.log(`  ⚠️ nessun pulsante avanzamento al passo ${passo}. Testo pagina:\n  ${testoPagina.replace(/\n+/g, " ").slice(0, 500)}`);
        break;
      }
      await page.waitForTimeout(5000);
    }

    const urlFinale = page.url();
    console.log(`\nURL dopo wizard: ${urlFinale.slice(0, 100)}`);
    check("5. ritorno su app (localhost /ritorno-stripe)", urlFinale.startsWith(BASE), urlFinale);

    if (urlFinale.startsWith(BASE)) {
      // Pagina /ritorno-stripe (server component): aspetta il render e ricarica
      // un paio di volte per intercettare eventuale verifica asincrona test.
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(5000);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
      }
      const testo = await page.evaluate(() => document.body.innerText);
      console.log("\n── TESTO /ritorno-stripe ──");
      console.log(testo.slice(0, 1200));
      check("6. pagina mostra esito (contenuto non vuoto)", testo.length > 0);
      check("6b. 'Conto configurato con successo' (esito ok)", /Conto configurato con successo/.test(testo));
      check("6c. NON 'Onboarding incompleto'", !/Onboarding incompleto|Onboarding non completato/.test(testo));
      check("6d. account corretto nel dettaglio", testo.includes(ACCOUNT_ATTESO));
    }

    if (consoleErrori.length) console.log(`\nConsole errori browser (${consoleErrori.length}):`, consoleErrori.slice(0, 6));
    else console.log("\nNessun errore console browser.");
    if (pageErrori.length) console.log(`Page errori JS (${pageErrori.length}):`, pageErrori.slice(0, 6));
    else console.log("Nessun errore JS di pagina.");

    console.log(`\n═══ RISULTATO: ${passati} passati, ${falliti} falliti ═══`);
    if (falliti > 0) process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    fermaServer();
  }
}

main().catch((e) => {
  console.error("Errore collaudo:", e);
  process.exit(1);
});
