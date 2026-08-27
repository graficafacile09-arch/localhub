/**
 * AUDIT FUNZIONALE COMPLETO — LocalHub (FASE 4, SOLO AUDIT)
 *
 * Verifica end-to-end su server dev locale (:3100) con gli account fixture
 * ufficiali del progetto (stesso Supabase della produzione).
 * Nessuna modifica a codice/dati: nessun submit distruttivo, nessun pagamento.
 *
 * Uso: node scripts/audit-funzionale.mjs
 * Scrive scripts/audit-funzionale-report.json e stampa un riepilogo.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3100";
// Negozio reale ATTIVO (Panificio Rossi) — l'admin può gestirlo (canManageStore
// concede owner+admin) quindi testiamo la UI venditore in sola lettura.
const STORE_ID = process.env.MERCHANT_STORE_ID || "f3a82af7-dd47-482f-8a49-ea58e692238c";
// Negozio fixture merchantA — attualmente nel cestino (soft-deleted).
const QA_STORE_ID = "82713069-38ca-43c8-bfd6-dd39c2f94a40";

const UTENTI = {
  customer: { email: "customer-a.test@localhub.it", password: "CustomerTest123!", area: "cliente", dest: "/cliente" },
  merchant: { email: "commerciante-a.test@localhub.it", password: "MerchantTest123!", area: "merchant", dest: "/merchant" },
  admin: { email: "admin.test@localhub.it", password: "AdminTest123!", area: "admin", dest: "/amministratore" },
};

// ── Registro risultati ───────────────────────────────────────────────────
const risultati = [];
function add(sezione, nome, esito, route, dettaglio = "") {
  risultati.push({ sezione, nome, esito, route, dettaglio });
}
const n = { ok: 0, ko: 0, warn: 0 };

// ── Error tracking ───────────────────────────────────────────────────────
const erroriGlobali = { console: [], page: [], http: [], failed: [] };
const erroriCorrente = { console: [], page: [], http: [], failed: [] };

function attachTracking(page) {
  page.on("console", (m) => {
    if (m.type() === "error") {
      erroriCorrente.console.push(m.text());
      erroriGlobali.console.push(m.text());
    }
  });
  page.on("pageerror", (e) => {
    erroriCorrente.page.push(String(e));
    erroriGlobali.page.push(String(e));
  });
  page.on("response", (r) => {
    if (r.status() >= 400) {
      const rec = `${r.status()} ${r.url()}`;
      erroriCorrente.http.push(rec);
      erroriGlobali.http.push(rec);
    }
  });
  page.on("requestfailed", (r) => {
    erroriCorrente.failed.push(r.url());
    erroriGlobali.failed.push(r.url());
  });
}
function svuotaErroriCorrente() {
  erroriCorrente.console.length = 0;
  erroriCorrente.page.length = 0;
  erroriCorrente.http.length = 0;
  erroriCorrente.failed.length = 0;
}

// ── Helper ───────────────────────────────────────────────────────────────
async function goto(page, url, waitUntil = "domcontentloaded") {
  try {
    await page.goto(`${BASE}${url}`, { waitUntil, timeout: 30000 });
  } catch {
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: "commit", timeout: 30000 });
    } catch (e) {
      return false;
    }
  }
  await page.waitForTimeout(500);
  return true;
}

async function doLogin(page, ruolo) {
  const u = UTENTI[ruolo];
  await goto(page, `/login?area=${u.area}`);
  try {
    await page.waitForSelector("#email", { timeout: 15000 });
    await page.fill("#email", u.email);
    await page.fill("#password", u.password);
    await page.click('form[action="/api/auth/login"] button[type="submit"]');
    await page.waitForURL(`**${u.dest}**`, { timeout: 25000 });
    return true;
  } catch (e) {
    return false;
  }
}

// Verifica che una route renderizzi senza errori e (opzionale) con testo atteso
async function checkRendering(page, sezione, nome, url, testoAtteso, erroreAtteso = false) {
  svuotaErroriCorrente();
  const okNav = await goto(page, url);
  await page.waitForTimeout(900);
  let testo = "";
  try {
    testo = await page.evaluate(() => document.body.innerText.slice(0, 20000));
  } catch {
    testo = "";
  }
  const errs = {
    console: [...erroriCorrente.console],
    page: [...erroriCorrente.page],
    http: [...erroriCorrente.http],
  };
  const haTesto = testoAtteso ? testo.includes(testoAtteso) : true;
  const haErroreJs = errs.page.length > 0 || errs.console.length > 0;
  const ok = okNav && haTesto && (erroreAtteso || !haErroreJs);
  add(
    sezione,
    nome,
    ok ? "OK" : "KO",
    page.url().replace(BASE, ""),
    !ok
      ? `nav=${okNav} testoAtteso=${haTesto} consoleErrs=${errs.console.length} pageErrs=${errs.page.length} httpErrs=${errs.http.length}`
      : ""
  );
  return { ok, errs, url: page.url().replace(BASE, "") };
}

const browser = await chromium.launch();

// ═════════════════════════════════════════════════════════════════════════
// 2. HOMEPAGE E NAVIGAZIONE
// ═════════════════════════════════════════════════════════════════════════
{
  const sez = "NAVIGAZIONE";
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  attachTracking(page);
  await goto(page, "/");
  await page.waitForTimeout(2000);

  // raccogli slug reali
  const slug = await page.evaluate(() => {
    const s = document.querySelector('a[href^="/negozio/"]')?.getAttribute("href");
    const p = document.querySelector('a[href^="/prodotto/"]')?.getAttribute("href");
    const c = document.querySelector('a[href^="/categorie/"]')?.getAttribute("href");
    return { s, p, c };
  });

  // Footer links (catturati sulla homepage, dove il footer esiste)
  const footerLinks = await page.evaluate(() => {
    const f = document.querySelector("footer");
    if (!f) return [];
    return [...f.querySelectorAll("a")].map((a) => ({ text: (a.textContent || "").trim().slice(0, 30), href: a.getAttribute("href") }));
  });

  // Header nav (Home/Negozi/Categorie/Carrello)
  for (const [label, atteso] of [
    ["Home", "/"],
    ["Negozi", "/negozi"],
    ["Categorie", "/categorie"],
    ["Carrello", "/carrello"],
  ]) {
    svuotaErroriCorrente();
    const link = page.locator(`nav[aria-label="Navigazione principale"] a[aria-label="${label}"]`).first();
    if ((await link.count()) === 0) {
      add(sez, `Nav header "${label}" presente`, "KO", "/", "link non trovato");
      continue;
    }
    await link.click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(800);
    const url = new URL(page.url()).pathname;
    const ok = url === atteso;
    const errs = { c: erroriCorrente.console.length, p: erroriCorrente.page.length, h: erroriCorrente.http.length };
    add(sez, `Nav "${label}" → ${atteso}`, ok && errs.p === 0 ? "OK" : "KO", url, !ok ? `URL=${url}` : `console=${errs.c} page=${errs.p} http=${errs.h}`);
    await goto(page, "/");
    await page.waitForTimeout(600);
  }

  // Logo → home
  svuotaErroriCorrente();
  await goto(page, "/negozi");
  await page.locator('header a[aria-label*="Home"], header a:has(img[alt="LocalHub"])').first().click().catch(() => {});
  await page.waitForTimeout(900);
  const logoUrl = new URL(page.url()).pathname;
  add(sez, "Logo → Home", logoUrl === "/" ? "OK" : "KO", logoUrl, logoUrl === "/" ? "" : `URL=${logoUrl}`);

  // Meteo
  await goto(page, "/");
  await page.waitForTimeout(4000);
  const meteo = await page.evaluate(() => {
    const w = document.querySelector('header [aria-label*="eteo"]');
    return w ? w.textContent.trim() : null;
  });
  add(sez, "Widget meteo visibile (temperatura+Castrovillari)", meteo && /castrovillari/i.test(meteo) && /\d+°/.test(meteo) ? "OK" : "KO", "/", meteo || "non trovato");

  // Account (Accedi) in alto → menu → ingressi
  const accediBtn = page.locator('header button:has-text("Accedi")').first();
  if ((await accediBtn.count()) > 0) {
    await accediBtn.click();
    await page.waitForTimeout(400);
    const voci = await page.locator('header [role="menu"] a[role="menuitem"]').count();
    add(sez, 'Pulsante "Accedi" in alto apre il menu', voci >= 2 ? "OK" : "KO", "/", `voci=${voci}`);
    // Entra come Cliente
    await page.locator('header [role="menu"] a[role="menuitem"]:has-text("Cliente")').first().click().catch(() => {});
    await page.waitForTimeout(900);
    const urlAcc = new URL(page.url()).pathname + new URL(page.url()).search;
    add(sez, '"Accedi" alto → Entra come Cliente', urlAcc.includes("/login?area=cliente") ? "OK" : "KO", urlAcc);
    await goto(page, "/");
    await page.waitForTimeout(600);
    await accediBtn.click();
    await page.waitForTimeout(400);
    await page.locator('header [role="menu"] a[role="menuitem"]:has-text("Venditore")').first().click().catch(() => {});
    await page.waitForTimeout(900);
    const urlVend = new URL(page.url()).pathname + new URL(page.url()).search;
    add(sez, '"Accedi" alto → Entra come Venditore', urlVend.includes("/login?area=merchant") ? "OK" : "KO", urlVend);
  } else {
    add(sez, 'Pulsante "Accedi" in alto', "KO", "/", "non trovato");
  }

  // Footer links (controllo HTTP di ogni destinazione)
  for (const fl of footerLinks.filter((l) => l.href)) {
    if (fl.href.startsWith("/login") || fl.href.startsWith("http")) continue;
    const r = await page.request.get(`${BASE}${fl.href}`);
    const st = r.status();
    const ok = st < 400;
    add(sez, `Footer "${fl.text}" → ${fl.href}`, ok ? "OK" : "KO", fl.href, ok ? "" : `HTTP ${st}`);
  }
  const adminFooter = footerLinks.find((l) => /amministrazion/i.test(l.text));
  add(sez, "Footer contiene ingresso Amministrazione → /login?area=admin", adminFooter && adminFooter.href === "/login?area=admin" ? "OK" : "KO", adminFooter?.href || "?", adminFooter ? "" : "link mancante");

  // Ricerca homepage
  svuotaErroriCorrente();
  await goto(page, "/");
  await page.waitForTimeout(600);
  const hasSearch = await page.locator('form[action="/ricerca"] input[name="q"]').count();
  if (hasSearch > 0) {
    await page.fill('form[action="/ricerca"] input[name="q"]', "pizza");
    await page.click('form[action="/ricerca"] button[type="submit"]').catch(() => {});
    await page.waitForTimeout(1200);
    const u = new URL(page.url());
    add(sez, "Ricerca homepage → /ricerca?q=", u.pathname === "/ricerca" && u.searchParams.get("q") === "pizza" ? "OK" : "KO", u.pathname + u.search);
  } else {
    add(sez, "Ricerca homepage", "KO", "/", "input non trovato");
  }

  // Assistente AI
  svuotaErroriCorrente();
  await goto(page, "/");
  await page.waitForTimeout(800);
  const asstBtn = page.locator('button[aria-label="Apri l\'Assistente AI"]').first();
  if ((await asstBtn.count()) > 0) {
    await asstBtn.click();
    await page.waitForTimeout(800);
    const pannello = await page.evaluate(() => {
      // AssistantPanel: cerca un pannello/dialog con testo dell'assistente
      const els = [...document.querySelectorAll("body *")].filter(
        (el) => /assistente|cerca|domanda/i.test(el.textContent || "") && el.getBoundingClientRect().width > 200
      );
      return els.length;
    });
    add(sez, "Assistente AI apre il pannello", pannello > 0 ? "OK" : "KO", "/", `elementi=${pannello}`);
  } else {
    add(sez, "Assistente AI (homepage)", "KO", "/", "pulsante non trovato");
  }
  await goto(page, "/assistant");
  await page.waitForTimeout(1000);
  add(sez, "/assistant renderizza", (await page.locator("main").count()) > 0 || (await page.locator("body").innerText().then((t) => t.length)) > 50 ? "OK" : "KO", "/assistant");

  // Categorie homepage → card cliccabile
  if (slug.c) {
    await goto(page, "/");
    await page.waitForTimeout(600);
    const card = page.locator(`a[href="${slug.c}"]`).first();
    if ((await card.count()) > 0) {
      await card.click();
      await page.waitForTimeout(1000);
      const u = new URL(page.url()).pathname;
      add(sez, "Card categoria homepage → /categorie/[slug]", u.startsWith("/categorie/") ? "OK" : "KO", u);
    } else {
      add(sez, "Card categoria homepage", "WARN", "/", "nessun link card trovato");
    }
  }
  // CTA negozi in evidenza
  await goto(page, "/");
  await page.waitForTimeout(600);
  const ctaFeatured = page.locator('a[href="/negozi?featured=1"]').first();
  if ((await ctaFeatured.count()) > 0) {
    await ctaFeatured.click();
    await page.waitForTimeout(1000);
    const u = new URL(page.url());
    add(sez, "CTA negozi in evidenza", u.pathname === "/negozi" && u.searchParams.get("featured") === "1" ? "OK" : "KO", u.pathname + u.search);
  } else {
    add(sez, "CTA negozi in evidenza", "WARN", "/", "CTA non trovato");
  }

  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// 3+4. AUTENTICAZIONE + /admin
// ═════════════════════════════════════════════════════════════════════════
{
  const sez = "AUTH";
  // Login valido per ogni area
  for (const ruolo of ["customer", "merchant", "admin"]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachTracking(page);
    svuotaErroriCorrente();
    const okLogin = await doLogin(page, ruolo);
    add(sez, `Login valido ${ruolo} → ${UTENTI[ruolo].dest}`, okLogin ? "OK" : "KO", `/login?area=${UTENTI[ruolo].area}`, okLogin ? "" : `URL finale=${page.url()}`);
    // Accesso diretto alla propria area (già autenticato)
    const areaPath = UTENTI[ruolo].dest;
    await goto(page, areaPath);
    add(sez, `Accesso diretto ${ruolo} → ${areaPath}`, new URL(page.url()).pathname === areaPath ? "OK" : "KO", new URL(page.url()).pathname);
    // Header: menu account mostra l'area
    await page.waitForTimeout(500);
    const menuBtn = page.locator('header button[aria-label^="Menu utente"]').first();
    if ((await menuBtn.count()) > 0) {
      await menuBtn.click();
      await page.waitForTimeout(400);
      const voci = await page.locator('header [role="menu"] a[role="menuitem"]').allInnerTexts();
      add(sez, `Menu account ${ruolo} mostra l'area`, voci.some((v) => /area/i.test(v)) ? "OK" : "KO", areaPath, voci.join(" | "));
    }
    await ctx.close();
  }

  // Login non valido (cliente)
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachTracking(page);
    svuotaErroriCorrente();
    await goto(page, "/login?area=cliente");
    await page.fill("#email", "customer-a.test@localhub.it");
    await page.fill("#password", "PasswordSbagliata99!");
    await page.click('form[action="/api/auth/login"] button[type="submit"]');
    await page.waitForTimeout(2500);
    const u = page.url();
    const body = await page.evaluate(() => document.body.innerText);
    const errore = /error=/.test(u) || /credenziali|non valide|errore|non riuscito|invalid/i.test(body);
    add(sez, "Login non valido mostra errore e resta su /login", errore ? "OK" : "KO", u.replace(BASE, ""), !errore ? `body=${body.slice(-200)}` : "");
    await ctx.close();
  }

  // Logout (cliente) — dall'area cliente (drawer) e dal menu header pubblico
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachTracking(page);
    await doLogin(page, "customer");
    // Esci dal drawer dell'area cliente (ClienteShell)
    await page.waitForTimeout(600);
    const drawerBtn = page
      .locator('button[aria-label*="menu"], button[aria-label*="Menu"], button:has-text("Menu")')
      .first();
    if ((await drawerBtn.count()) > 0) {
      await drawerBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }
    const esciForm = page.locator('form[action="/api/auth/signout"] button:has-text("Esci")').first();
    if ((await esciForm.count()) > 0) {
      await esciForm.click();
      await page.waitForTimeout(2500);
      const after = new URL(page.url()).pathname;
      add(sez, "Logout dall'area cliente (Esci) invalida la sessione", after === "/" || after.includes("logout") ? "OK" : "KO", after, `URL=${after}`);
      await goto(page, "/cliente");
      await page.waitForTimeout(1200);
      const u = new URL(page.url());
      add(sez, "Dopo logout /cliente → login", u.pathname === "/login" && u.searchParams.get("area") === "cliente" ? "OK" : "KO", u.pathname + u.search);
    } else {
      add(sez, "Logout dall'area cliente", "WARN", "/cliente", "pulsante Esci non trovato nel drawer");
    }
    // Logout dal menu account dell'header pubblico
    const p2 = await ctx.newPage();
    attachTracking(p2);
    await doLogin(p2, "customer");
    await p2.goto(`${BASE}/`);
    await p2.waitForTimeout(800);
    const menuBtn = p2.locator('header button[aria-label^="Menu utente"]').first();
    if ((await menuBtn.count()) > 0) {
      await menuBtn.click();
      await p2.waitForTimeout(400);
      const esciH = p2.locator('header [role="menu"] button[role="menuitem"]:has-text("Esci")').first();
      if ((await esciH.count()) > 0) {
        await esciH.click();
        await p2.waitForTimeout(2500);
        const suLogout = new URL(p2.url()).pathname === "/logout-success";
        // la pagina /logout-success non ha header: torniamo alla homepage per verificare
        await p2.goto(`${BASE}/`);
        await p2.waitForTimeout(1000);
        const accediVisible = await p2.locator('header button:has-text("Accedi")').count();
        add(sez, "Logout dal menu header → sessione invalidata (Accedi di nuovo visibile)", suLogout && accediVisible > 0 ? "OK" : "KO", "/logout-success → /", `suLogout=${suLogout} accedi=${accediVisible}`);
      } else {
        add(sez, "Logout dal menu header", "WARN", "/", "voce Esci non trovata");
      }
    } else {
      add(sez, "Logout dal menu header", "WARN", "/", "menu utente non trovato");
    }
    await ctx.close();
  }

  // /admin
  {
    // non autenticato
    let ctx = await browser.newContext();
    let page = await ctx.newPage();
    attachTracking(page);
    svuotaErroriCorrente();
    await goto(page, "/admin");
    await page.waitForTimeout(1200);
    let u = new URL(page.url());
    add(sez, "/admin non autenticato → /login?area=admin", u.pathname === "/login" && u.searchParams.get("area") === "admin" ? "OK" : "KO", u.pathname + u.search);
    await ctx.close();

    // admin autenticato
    ctx = await browser.newContext();
    page = await ctx.newPage();
    attachTracking(page);
    await doLogin(page, "admin");
    svuotaErroriCorrente();
    await goto(page, "/admin");
    await page.waitForTimeout(1200);
    u = new URL(page.url());
    add(sez, "/admin admin autenticato → /amministratore", u.pathname === "/amministratore" ? "OK" : "KO", u.pathname);
    await ctx.close();

    // merchant autenticato (non admin) → propria area
    ctx = await browser.newContext();
    page = await ctx.newPage();
    attachTracking(page);
    await doLogin(page, "merchant");
    svuotaErroriCorrente();
    await goto(page, "/admin");
    await page.waitForTimeout(1200);
    u = new URL(page.url());
    add(sez, "/admin merchant autenticato → propria area /merchant", u.pathname.startsWith("/merchant") ? "OK" : "KO", u.pathname);
    await ctx.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════
// 5. AREA CLIENTE
// ═════════════════════════════════════════════════════════════════════════
{
  const sez = "AREA CLIENTE";
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  attachTracking(page);
  await doLogin(page, "customer");
  await checkRendering(page, sez, "Dashboard cliente", "/cliente", "Il tuo");
  await checkRendering(page, sez, "Profilo cliente", "/cliente/profilo", "");
  await checkRendering(page, sez, "Preferiti cliente", "/cliente/preferiti", "");
  await checkRendering(page, sez, "Ordini cliente", "/cliente/ordini", "");
  await checkRendering(page, sez, "Impostazioni cliente", "/cliente/impostazioni", "");
  // Dettaglio ordine (se esiste un ordine)
  const ordini = await page.evaluate(() => document.body.innerText);
  const hasOrdini = /nessun ordine|non hai ordini/i.test(ordini) === false && /ORDINE|#/.test(ordini);
  if (hasOrdini) {
    const linkOrd = page.locator('a[href*="/cliente/ordini/"]').first();
    if ((await linkOrd.count()) > 0) {
      await linkOrd.click();
      await page.waitForTimeout(1200);
      add(sez, "Dettaglio ordine", new URL(page.url()).pathname.includes("/cliente/ordini/") ? "OK" : "KO", new URL(page.url()).pathname);
    } else {
      add(sez, "Dettaglio ordine", "WARN", "/cliente/ordini", "ordine presente ma nessun link dettaglio");
    }
  } else {
    add(sez, "Dettaglio ordine", "WARN", "/cliente/ordini", "nessun ordine nel profilo di test (dato assente)");
  }
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// 6. AREA VENDITORE
// ═════════════════════════════════════════════════════════════════════════
{
  const sez = "AREA VENDITORE";
  // 1) Merchant con negozio CESTINATO → attesa "Negozio non disponibile" (corretto)
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachTracking(page);
    await doLogin(page, "merchant");
    await checkRendering(page, sez, "Elenco negozi merchant (login ok)", "/merchant", "", false);
    // messaggi di negazione diversi per pagina (incoerenza testuale minore, entrambi negano)
    await checkRendering(page, sez, "Negozio fixture cestinato → accesso negato", `/merchant/${QA_STORE_ID}/prodotti`, "Accesso non disponibile", false);
    await checkRendering(page, sez, "Guadagni negozio cestinato → accesso negato", `/merchant/${QA_STORE_ID}/guadagni`, "Negozio non disponibile", false);
    await ctx.close();
  }
  // 2) UI venditore su negozio REALE attivo, sessione admin (canManageStore concede admin)
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachTracking(page);
    await doLogin(page, "admin");
    await checkRendering(page, sez, "Dashboard negozio reale (Panificio Rossi)", `/merchant/${STORE_ID}`, "");
    await checkRendering(page, sez, "Prodotti negozio reale", `/merchant/${STORE_ID}/prodotti`, "");
    await checkRendering(page, sez, "Nuovo prodotto (form, non inviato)", `/merchant/${STORE_ID}/prodotti/nuovo`, "");
    await checkRendering(page, sez, "Ordini negozio reale", `/merchant/${STORE_ID}/ordini`, "");
    await checkRendering(page, sez, "Incassi negozio reale", `/merchant/${STORE_ID}/incassi`, "");
    await checkRendering(page, sez, "Guadagni negozio reale", `/merchant/${STORE_ID}/guadagni`, "");
    await checkRendering(page, sez, "Impostazioni negozio reale", `/merchant/${STORE_ID}/impostazioni`, "");
    // API incassi venditore su negozio reale → 200
    svuotaErroriCorrente();
    const r = await ctx.request.get(`${BASE}/api/merchant/stores/${STORE_ID}/incassi`);
    add(sez, "API incassi venditore (negozio reale) → 200", r.status() === 200 ? "OK" : "KO", `/api/merchant/stores/${STORE_ID}/incassi`, `status=${r.status()}`);
    await ctx.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════
// 7. AREA AMMINISTRATORE
// ═════════════════════════════════════════════════════════════════════════
{
  const sez = "AREA ADMIN";
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  attachTracking(page);
  await doLogin(page, "admin");
  await checkRendering(page, sez, "Dashboard admin", "/amministratore", "");
  await checkRendering(page, sez, "Negozi admin (attivita)", "/amministratore/attivita", "");
  await checkRendering(page, sez, "Dettaglio negozio admin (sola lettura)", `/amministratore/negozi/${STORE_ID}`, "");
  await checkRendering(page, sez, "Categorie admin", "/amministratore/categorie", "");
  await checkRendering(page, sez, "Prodotti admin", "/amministratore/prodotti", "");
  await checkRendering(page, sez, "Ordini admin", "/amministratore/ordini", "");
  await checkRendering(page, sez, "Incassi admin", "/amministratore/incassi", "");
  await checkRendering(page, sez, "Payout admin (pagina)", "/amministratore/payout", "", false);
  {
    // Verifica esplicita dell'API payout admin (segnala il 500 reale)
    svuotaErroriCorrente();
    const r = await ctx.request.get(`${BASE}/api/amministratore/payout?pagina=1`);
    const body = await r.text();
    add(sez, "API payout admin → 200", r.status() === 200 ? "OK" : "KO", "/api/amministratore/payout", `status=${r.status()} ${body.slice(0, 140)}`);
  }
  await checkRendering(page, sez, "Utenti admin", "/amministratore/utenti", "");
  await checkRendering(page, sez, "Cestino admin", "/amministratore/cestino", "");
  await checkRendering(page, sez, "Template admin", "/amministratore/template", "");
  await checkRendering(page, sez, "Impostazioni admin", "/amministratore/impostazioni", "");
  await checkRendering(page, sez, "Eventi admin", "/amministratore/eventi", "");
  await checkRendering(page, sez, "Offerte admin", "/amministratore/offerte", "");
  await checkRendering(page, sez, "Segnalazioni admin", "/amministratore/segnalazioni", "");
  await checkRendering(page, sez, "Statistiche admin", "/amministratore/statistiche", "");

  // Navigazione interna (sidebar): Cestino raggiungibile
  await goto(page, "/amministratore");
  await page.waitForTimeout(600);
  const sideLinks = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    if (!aside) return [];
    return [...aside.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  });
  add(sez, "Sidebar admin presente con link", sideLinks.length > 3 ? "OK" : "KO", "/amministratore", `link=${sideLinks.length}`);
  add(sez, "Cestino presente nella sidebar admin", sideLinks.some((l) => l && l.includes("/cestino")) ? "OK" : "KO", "/amministratore", sideLinks.join(", "));
  const cestinoLink = page.locator('aside a[href*="/cestino"]').first();
  if ((await cestinoLink.count()) > 0) {
    await cestinoLink.click();
    await page.waitForTimeout(1200);
    add(sez, "Click Cestino dalla sidebar → /amministratore/cestino", new URL(page.url()).pathname === "/amministratore/cestino" ? "OK" : "KO", new URL(page.url()).pathname);
  }
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// 8. CARRELLO
// ═════════════════════════════════════════════════════════════════════════
{
  const sez = "CARRELLO";
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  attachTracking(page);
  await goto(page, "/");
  await page.waitForTimeout(1000);
  const prodHref = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/prodotto/"]');
    return a ? a.getAttribute("href") : null;
  });
  if (!prodHref) {
    add(sez, "Prodotto disponibile per il test", "WARN", "/", "nessun prodotto in homepage");
  } else {
    await goto(page, prodHref);
    await page.waitForTimeout(1000);
    const btn = page.locator('button:has-text("Aggiungi al carrello"), button[aria-label*="carrello"]').first();
    if ((await btn.count()) === 0) {
      add(sez, "Aggiunta al carrello", "WARN", prodHref, "nessun pulsante (prodotto senza acquisto diretto?)");
    } else {
      svuotaErroriCorrente();
      await btn.click();
      await page.waitForTimeout(1000);
      const badge = await page.locator('[data-testid="cart-badge"]').first().innerText().catch(() => "");
      add(sez, "Aggiunta prodotto → badge carrello", badge.trim() === "1" ? "OK" : "KO", prodHref, `badge=${JSON.stringify(badge)}`);
      const ls = await page.evaluate(() => {
        const raw = localStorage.getItem("localhub.carrello.v1");
        if (!raw) return 0;
        try {
          return JSON.parse(raw).righe.length;
        } catch {
          return -1;
        }
      });
      add(sez, "Persistenza localStorage (localhub.carrello.v1)", ls === 1 ? "OK" : "KO", prodHref, `righe=${ls}`);

      // Navigazione al carrello
      await page.goto(`${BASE}/carrello`);
      await page.waitForTimeout(1200);
      const body = await page.evaluate(() => document.body.innerText);
      const itemPresent = /prodotto|procedi al checkout|totale/i.test(body);
      add(sez, "Pagina carrello mostra l'articolo", itemPresent ? "OK" : "KO", "/carrello", !itemPresent ? body.slice(-150) : "");

      // Quantità + / − / rimozione
      const btnPlus = page.locator('button[aria-label*="aumenta"], button[aria-label*="Aumenta"], button:has-text("+")').first();
      const btnMinus = page.locator('button[aria-label*="diminuisci"], button[aria-label*="Diminuisci"], button:has-text("−"), button:has-text("-")').first();
      const btnRemove = page.locator('button[aria-label*="rimuovi"], button[aria-label*="Rimuovi"], button[aria-label*="elimina"]').first();
      if ((await btnPlus.count()) > 0) {
        await btnPlus.click();
        await page.waitForTimeout(800);
        const badge2 = await page.locator('[data-testid="cart-badge"]').first().innerText().catch(() => "");
        add(sez, "Quantità + → badge aggiornato", badge2.trim() === "2" ? "OK" : "KO", "/carrello", `badge=${JSON.stringify(badge2)}`);
      } else {
        add(sez, "Quantità +", "WARN", "/carrello", "pulsante non trovato (layout diverso)");
      }
      if ((await btnMinus.count()) > 0) {
        await btnMinus.click();
        await page.waitForTimeout(800);
      } else {
        add(sez, "Quantità −", "WARN", "/carrello", "pulsante non trovato");
      }
      if ((await btnRemove.count()) > 0) {
        await btnRemove.click();
        await page.waitForTimeout(1000);
        const badgeAfter = await page.locator('[data-testid="cart-badge"]').count();
      const lsAfter = await page.evaluate(() => {
        const raw = localStorage.getItem("localhub.carrello.v1");
        if (!raw) return 0;
        try {
          return JSON.parse(raw).righe.length;
        } catch {
          return -1;
        }
      });
        add(sez, "Rimozione articolo → carrello vuoto", badgeAfter === 0 && lsAfter === 0 ? "OK" : "KO", "/carrello", `badge=${badgeAfter} righe=${lsAfter}`);
      } else {
        add(sez, "Rimozione articolo", "WARN", "/carrello", "pulsante non trovato");
      }

      // Svuotamento
      await btn?.click().catch(() => {});
    }
  }
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// 9. FLUSSO ORDINE → punto sicuro pre-pagamento
// ═════════════════════════════════════════════════════════════════════════
{
  const sez = "ORDINE";
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  attachTracking(page);
  await goto(page, "/");
  await page.waitForTimeout(1000);
  const prodHref = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/prodotto/"]');
    return a ? a.getAttribute("href") : null;
  });
  // Catena completa: Home → negozio → prodotto
  const negozioHref = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/negozio/"]');
    return a ? a.getAttribute("href") : null;
  });
  if (negozioHref) {
    await goto(page, negozioHref);
    await page.waitForTimeout(900);
    const u1 = new URL(page.url());
    const prodFromStore = await page.evaluate(() => {
      const a = document.querySelector('a[href^="/prodotto/"]');
      return a ? a.getAttribute("href") : null;
    });
    if (prodFromStore && u1.pathname.startsWith("/negozio/")) {
      await goto(page, prodFromStore);
      await page.waitForTimeout(900);
      const u2 = new URL(page.url());
      add(sez, "Catena Home → negozio → prodotto", u2.pathname.startsWith("/prodotto/") ? "OK" : "KO", u1.pathname + " → " + u2.pathname);
    } else {
      add(sez, "Catena Home → negozio → prodotto", "WARN", u1.pathname, "negozio senza prodotti pubblici");
    }
  } else {
    add(sez, "Catena Home → negozio → prodotto", "WARN", "/", "nessun link negozio in homepage");
  }
  if (!prodHref) {
    add(sez, "Flusso ordine", "WARN", "/", "nessun prodotto testabile");
  } else {
    await goto(page, prodHref);
    await page.waitForTimeout(800);
    const btn = page.locator('button:has-text("Aggiungi al carrello"), button[aria-label*="carrello"]').first();
    if ((await btn.count()) > 0) await btn.click();
    await page.goto(`${BASE}/carrello`);
    await page.waitForTimeout(1000);
    const cta = page.locator('a[href="/checkout"]').first();
    if ((await cta.count()) > 0) {
      await cta.click();
      await page.waitForTimeout(1500);
      const u = new URL(page.url());
      const body = await page.evaluate(() => document.body.innerText);
      const paymentUI = /carta|paypal|scalapay|klarna|bonifico|metodo di pagamento|pagamento/i.test(body);
      add(sez, "Checkout raggiungibile (punto sicuro pre-pagamento)", u.pathname === "/checkout" && paymentUI ? "OK" : "KO", u.pathname, !paymentUI ? body.slice(-200) : "");
      // NON si procede oltre (nessun pagamento reale)
    } else {
      add(sez, "Checkout raggiungibile", "WARN", "/carrello", "CTA checkout non trovata (carrello vuoto?)");
    }
  }
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// 10. PERMESSI E SICUREZZA
// ═════════════════════════════════════════════════════════════════════════
{
  const sez = "PERMESSI";
  // non autenticato → aree protette → login
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachTracking(page);
    for (const [route, area] of [["/cliente", "cliente"], ["/merchant", "merchant"], ["/amministratore", "admin"]]) {
      svuotaErroriCorrente();
      await goto(page, route);
      await page.waitForTimeout(1200);
      const u = new URL(page.url());
      const ok = u.pathname === "/login" && u.searchParams.get("area") === area;
      add(sez, `Non autenticato ${route} → /login?area=${area}`, ok ? "OK" : "KO", u.pathname + u.search, ok ? "" : `URL=${u.pathname}${u.search}`);
    }
    await ctx.close();
  }

  // cliente → route merchant e admin negate (pagina "ACCESSO NEGATO" o redirect)
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachTracking(page);
    await doLogin(page, "customer");
    for (const route of [`/merchant/${STORE_ID}`, "/merchant", "/amministratore", "/amministratore/ordini"]) {
      svuotaErroriCorrente();
      await goto(page, route);
      await page.waitForTimeout(1200);
      const u = new URL(page.url());
      const body = await page.evaluate(() => document.body.innerText.slice(0, 500));
      const negato =
        u.pathname.startsWith("/cliente") ||
        u.pathname === "/login" ||
        /accesso negato|area non autorizzata/i.test(body);
      add(sez, `Cliente ${route} → negato`, negato ? "OK" : "KO", u.pathname, !negato ? `URL=${u.pathname}` : "");
    }
    // /admin come cliente → propria area /cliente
    svuotaErroriCorrente();
    await goto(page, "/admin");
    await page.waitForTimeout(1200);
    const ua = new URL(page.url());
    add(sez, "/admin cliente → propria area /cliente", ua.pathname.startsWith("/cliente") ? "OK" : "KO", ua.pathname);
    await ctx.close();
  }

  // merchant → route admin negate (pagina "ACCESSO NEGATO" o redirect)
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachTracking(page);
    await doLogin(page, "merchant");
    for (const route of ["/amministratore", "/amministratore/ordini", "/cliente"]) {
      svuotaErroriCorrente();
      await goto(page, route);
      await page.waitForTimeout(1200);
      const u = new URL(page.url());
      const body = await page.evaluate(() => document.body.innerText.slice(0, 500));
      const negato =
        u.pathname.startsWith("/merchant") ||
        u.pathname === "/login" ||
        /accesso negato|area non autorizzata/i.test(body);
      add(sez, `Merchant ${route} → negato`, negato ? "OK" : "KO", u.pathname, !negato ? `URL=${u.pathname}` : "");
    }
    await ctx.close();
  }

  // API protette senza sessione → 401/403
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachTracking(page);
    svuotaErroriCorrente();
    const risposte = {};
    for (const api of ["/api/merchant/me", "/api/cliente/ordini", "/api/cliente/preferiti", "/api/amministratore/dashboard"]) {
      const r = await page.request.get(`${BASE}${api}`);
      risposte[api] = r.status();
    }
    // 401/403/405 sono tutti esiti di rifiuto (nessun accesso 200 concesso)
    const ok = Object.values(risposte).every((s) => s === 401 || s === 403 || s === 405);
    add(sez, "API protette senza sessione → rifiutate (401/403/405)", ok ? "OK" : "KO", "", JSON.stringify(risposte));
    await ctx.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════
// 11. RESPONSIVE MINIMO
// ═════════════════════════════════════════════════════════════════════════
{
  const sez = "RESPONSIVE";
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  attachTracking(page);
  for (const vw of [320, 375, 768, 1280]) {
    svuotaErroriCorrente();
    await page.setViewportSize({ width: vw, height: 900 });
    await goto(page, "/");
    await page.waitForTimeout(800);
    const info = await page.evaluate(() => {
      const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const nav = document.querySelector('nav[aria-label="Navigazione principale"]');
      const navLinks = nav ? nav.querySelectorAll("a").length : 0;
      const accedi = [...document.querySelectorAll("header button")].some((b) => /accedi/i.test(b.textContent || ""));
      return { docOverflow, navLinks, accedi };
    });
    const ok = info.docOverflow <= 0 && info.navLinks === 4 && info.accedi;
    add(sez, `Home @${vw}px (nav 4 voci, Accedi, no overflow)`, ok ? "OK" : "KO", "/", JSON.stringify(info));
  }
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// 12. REGRESSIONE MODIFICHE RECENTI
// ═════════════════════════════════════════════════════════════════════════
{
  const sez = "REGRESSIONE";
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  attachTracking(page);

  // Nav icona sopra/testo + Carrello in nav con badge (desktop e mobile)
  for (const vw of [1280, 320]) {
    await page.setViewportSize({ width: vw, height: 900 });
    await goto(page, "/");
    await page.waitForTimeout(800);
    const nav = await page.evaluate(() => {
      const n = document.querySelector('nav[aria-label="Navigazione principale"]');
      const links = n ? [...n.querySelectorAll("a")] : [];
      const primo = links[0];
      return {
        count: links.length,
        hasIconSopra: primo ? primo.querySelector("svg") !== null : false,
        hasTextSotto: primo ? /home|negozi|categorie|carrello/i.test(primo.textContent || "") : false,
      };
    });
    add(sez, `Nav icona sopra + testo sotto @${vw}`, nav.count === 4 && nav.hasIconSopra && nav.hasTextSotto ? "OK" : "KO", "/", JSON.stringify(nav));
  }

  // Nessuna voce "Amministrazione" nella NAV (solo footer) — l'accesso admin è via /admin
  await page.setViewportSize({ width: 1280, height: 900 });
  await goto(page, "/");
  await page.waitForTimeout(800);
  const adminInHeader = await page.evaluate(() => {
    const header = document.querySelector("header");
    return header ? /amministrazion/i.test(header.innerText) : false;
  });
  add(sez, "Nessun 'Amministrazione' nell'header (accesso via /admin)", !adminInHeader ? "OK" : "KO", "/", adminInHeader ? "presente nell'header" : "");

  // Header mobile: logo + meteo + account nella stessa riga @320
  await page.setViewportSize({ width: 320, height: 900 });
  await goto(page, "/");
  await page.waitForTimeout(4000);
  const header320 = await page.evaluate(() => {
    const logo = document.querySelector('header a:has(img[alt="LocalHub"])');
    const w = document.querySelector('header [aria-label*="eteo"]');
    const acc = [...document.querySelectorAll("header button")].find((b) => /accedi|menu utente/i.test(b.textContent || ""));
    const r = (el) => el.getBoundingClientRect();
    return {
      logo: logo ? r(logo).width : 0,
      meteo: w ? r(w).width : 0,
      account: acc ? r(acc).width : 0,
      inViewport: logo && acc ? r(logo).right <= 320 && r(acc).right <= 320 : false,
      meteoCastrovillari: w ? /castrovillari/i.test(w.textContent || "") : false,
    };
  });
  add(
    sez,
    "Header mobile @320: logo+meteo+account in riga senza overflow",
    header320.logo > 0 && header320.account > 0 && header320.inViewport && header320.meteoCastrovillari ? "OK" : "KO",
    "/",
    JSON.stringify(header320)
  );

  // Login da header funziona (Accedi alto → login → area)
  await page.setViewportSize({ width: 1280, height: 900 });
  const accediTop = page.locator('header button:has-text("Accedi")').first();
  if ((await accediTop.count()) > 0) {
    await accediTop.click();
    await page.waitForTimeout(400);
    await page.locator('header [role="menu"] a[role="menuitem"]:has-text("Cliente")').first().click().catch(() => {});
    await page.waitForTimeout(1200);
    const u = new URL(page.url());
    add(sez, 'Login "Accedi" in alto apre /login?area=cliente', u.pathname === "/login" && u.searchParams.get("area") === "cliente" ? "OK" : "KO", u.pathname + u.search);
  } else {
    add(sez, 'Login "Accedi" in alto', "KO", "/", "pulsante non trovato");
  }

  // Categorie restyle: card categorie in homepage
  await goto(page, "/");
  await page.waitForTimeout(800);
  const catCards = await page.locator('a[href^="/categorie/"]').count();
  add(sez, "Card categorie in homepage (restyle)", catCards > 0 ? "OK" : "KO", "/", `card=${catCards}`);

  await ctx.close();
}

await browser.close();

// ═════════════════════════════════════════════════════════════════════════
// REPORT
// ═════════════════════════════════════════════════════════════════════════
for (const r of risultati) {
  if (r.esito === "OK") n.ok++;
  else if (r.esito === "KO") n.ko++;
  else n.warn++;
}

// Classificazione errori globali
const httpUnici = {};
for (const e of erroriGlobali.http) httpUnici[e] = (httpUnici[e] || 0) + 1;
const consoleUnici = {};
for (const e of erroriGlobali.console) consoleUnici[e] = (consoleUnici[e] || 0) + 1;

const report = {
  base: BASE,
  generato: new Date().toISOString(),
  totali: { test: risultati.length, ok: n.ok, ko: n.ko, warn: n.warn },
  risultati,
  erroriGlobali: {
    console: consoleUnici,
    http: httpUnici,
    page: [...new Set(erroriGlobali.page)],
    failed: [...new Set(erroriGlobali.failed)],
  },
};
writeFileSync("scripts/audit-funzionale-report.json", JSON.stringify(report, null, 2));

console.log("════════ RIEPILOGO AUDIT FUNZIONALE ════════");
console.log(`Test totali: ${risultati.length} | OK: ${n.ok} | KO: ${n.ko} | WARN: ${n.warn}`);
const kozz = risultati.filter((r) => r.esito === "KO");
if (kozz.length) {
  console.log("\n── KO ──");
  for (const k of kozz) console.log(`  ❌ [${k.sezione}] ${k.nome} @ ${k.route} — ${k.dettaglio}`);
}
const warnz = risultati.filter((r) => r.esito === "WARN");
if (warnz.length) {
  console.log("\n── WARN ──");
  for (const w of warnz) console.log(`  ⚠️  [${w.sezione}] ${w.nome} @ ${w.route} — ${w.dettaglio}`);
}
console.log("\n── Errori console (unici) ──");
for (const [e, c] of Object.entries(consoleUnici)) console.log(`  [x${c}] ${e.slice(0, 220)}`);
console.log("\n── HTTP ≥400 (unici) ──");
for (const [e, c] of Object.entries(httpUnici)) console.log(`  [x${c}] ${e}`);
console.log("\n── Page errors ──");
for (const e of new Set(erroriGlobali.page)) console.log(`  ${e.slice(0, 220)}`);
console.log("\nReport JSON: scripts/audit-funzionale-report.json");
process.exit(n.ko > 0 ? 2 : 0);
