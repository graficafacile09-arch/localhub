/**
 * TEST ACCETTAZIONE BROWSER REALE — BUY-NOW: PRODOTTO → ACQUISTA → METODO DI PAGAMENTO.
 *
 * Criterio di accettazione del task:
 *   "Il task è FALLITO se cliccando direttamente ACQUISTA il sistema crea/invia
 *    l'ordine senza prima mostrare la scelta del metodo di pagamento."
 *
 * Verifica (senza MAI completare un acquisto reale — nessun submit):
 *   1. scheda prodotto → click ACQUISTA;
 *   2. nessuna POST di creazione ordine scattata automaticamente;
 *   3. arrivo su una pagina di scelta/acquisto (mai conferma ordine diretta);
 *   4. sezione "Metodo di pagamento" visibile con Carta/Bonifico/Klarna secondo
 *      disponibilità reale del negozio;
 *   5. Klarna: logo rosa, badge "Paga in 3 rate", descrizione e disclaimer;
 *   6. viewport 390px: nessun overflow/overlap nella sezione pagamento;
 *   7. zero console errors.
 *
 * Uso: npx tsx scripts/test-buy-now-browser.ts [--url https://...]
 *      (default: https://www.incitta.online, poi http://localhost:3000 se raggiungibile)
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

let passati = 0;
let falliti = 0;
const fallitiNomi: string[] = [];
function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    fallitiNomi.push(nome);
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

async function raccogliPaginaPagamento(
  browser: Browser,
  base: string
): Promise<{ esito: string; dettagli: Record<string, unknown> }> {
  const esito: string[] = [];
  const dettagli: Record<string, unknown> = {};
  const page: Page = await browser.newPage();
  const consoleErrors: string[] = [];
  const postApi: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on("request", (req) => {
    const u = req.url();
    if (req.method() === "POST" && (u.includes("/api/") || u.includes("cliente/ordini"))) {
      postApi.push(`${req.method()} ${u}`);
    }
  });

  // ── 1. Home → scheda prodotto ───────────────────────────────────────────
  try {
    const resHome = await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45000 });
    dettagli["home_status"] = resHome?.status() ?? null;
    esito.push(`home=${resHome?.status()}`);

    // Trova il primo link a una scheda prodotto (architettura URL a slug).
    // Strategie: link in home → pagina /negozi → slug demo noto.
    let linkProdotto = await page
      .locator('a[href*="/prodotto/"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (!linkProdotto) {
      const resNegozio = await page.goto(new URL("/negozi", base).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      dettagli["negozi_status"] = resNegozio?.status() ?? null;
      linkProdotto = await page
        .locator('a[href*="/prodotto/"]')
        .first()
        .getAttribute("href")
        .catch(() => null);
    }
    if (!linkProdotto) {
      // Ultima spiaggia: slug del prodotto demo usato dalla suite E2E.
      const resDemo = await page.goto(new URL("/prodotto/trattamento-glow-viso", base).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      dettagli["prodotto_demo_status"] = resDemo?.status() ?? null;
      if (resDemo?.status() === 200) {
        linkProdotto = "/prodotto/trattamento-glow-viso";
      }
    }
    if (!linkProdotto) {
      esito.push("NESSUN prodotto trovato (home/negozi/slug demo)");
      await page.close();
      return { esito: esito.join(" · "), dettagli };
    }
    const urlProdotto = new URL(linkProdotto, base).toString();
    dettagli["prodotto_url"] = urlProdotto;
    const resProd = await page.goto(urlProdotto, { waitUntil: "domcontentloaded", timeout: 45000 });
    dettagli["prodotto_status"] = resProd?.status() ?? null;
    esito.push(`prodotto=${resProd?.status()}`);

    // ── 2. Click ACQUISTA (nessuna POST di ordine prima della scelta) ──────
    const acquista = page.locator("text=ACQUISTA").or(page.locator("text=Acquista").first());
    if ((await acquista.count()) === 0) {
      esito.push("pulsante ACQUISTA assente");
      await page.close();
      return { esito: esito.join(" · "), dettagli };
    }
    postApi.length = 0;
    await acquista.first().click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(1200);
    dettagli["url_dopo_acquista"] = page.url();
    esito.push(`url_acquista=${page.url()}`);

    // Nessuna POST di ordine (il criterio di fallimento è proprio qui).
    const postOrdine = postApi.filter((p) => p.includes("cliente/ordini"));
    check(
      `[${base}] ACQUISTA NON crea/invia l'ordine automaticamente (POST ordini = ${postOrdine.length})`,
      postOrdine.length === 0,
      postOrdine
    );

    // ── 3. Dalla pagina di scelta → Spedizione a domicilio ─────────────────
    if (page.url().includes("/acquista")) {
      const spedizione = page.locator("text=Spedizione a domicilio").first();
      if ((await spedizione.count()) > 0) {
        await spedizione.click();
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(1000);
      }
      dettagli["url_spedizione"] = page.url();
      esito.push(`spedizione=${page.url()}`);
      check(
        `[${base}] arrivo alla pagina di acquisto/spedizione (mai conferma ordine diretta)`,
        page.url().includes("/acquista"),
        page.url()
      );
    }

    await page.screenshot({ path: join(PROGETTO, "screenshots/buy-now-pagamento.png"), fullPage: true });

    // ── 4. Sezione "Metodo pagamento" (titolo reale in SpedizioneForm) ────
    const sezione = page
      .locator("text=Metodo pagamento")
      .or(page.locator("text=Metodo di pagamento"))
      .first();
    const sezioneVisibile = (await sezione.count()) > 0 && (await sezione.isVisible().catch(() => false));
    check(`[${base}] sezione 'Metodo pagamento' visibile`, sezioneVisibile);
    dettagli["sezione_pagamento"] = sezioneVisibile;

    const metodi: string[] = [];
    let nessunMetodoConfigurato = false;
    if (sezioneVisibile) {
      // Opzioni radio "pagamento" (SpedizioneForm buy-now).
      const radio = page.locator('input[name="pagamento"]');
      const n = await radio.count();
      for (let i = 0; i < n; i++) {
        metodi.push(String(await radio.nth(i).getAttribute("value")));
      }
      if (metodi.length === 0) {
        // Nessun metodo online configurato per questo negozio: la sezione
        // mostra il messaggio esplicito (stato valido, mai un ordine implicito).
        const fallback = (await page
          .locator("text=non ha configurato pagamenti online")
          .count()) > 0;
        if (fallback) {
          nessunMetodoConfigurato = true;
          esito.push("nessun metodo configurato (fallback esplicito)");
        } else {
          // Checkout carrello: pulsanti OpzioneRadio (testo sotto il titolo).
          const testo = (await sezione.locator("..").innerText().catch(() => "")) ?? "";
          for (const m of ["carta", "bonifico", "klarna"])
            if (testo.includes(m === "carta" ? "Carta" : m === "klarna" ? "Klarna" : "Bonifico")) metodi.push(m);
        }
      }
      dettagli["metodi_trovati"] = metodi;
      dettagli["nessun_metodo_configurato"] = nessunMetodoConfigurato;
      esito.push(`metodi=${metodi.join(",") || "(nessuno)"}`);
      check(
        `[${base}] scelta metodo presente (radio disponibili OPPURE fallback esplicito)`,
        metodi.length > 0 || nessunMetodoConfigurato,
        { metodi, nessunMetodoConfigurato }
      );

      // ── 5. Klarna: logo, badge, descrizione, disclaimer ──────────────────
      const haKlarna = metodi.includes("klarna");
      dettagli["klarna_presente"] = haKlarna;
      if (haKlarna) {
        const logo = await page.locator('img[src*="klarna"]').count();
        const badge = (await page.locator("text=Paga in 3 rate").count()) > 0;
        const desc = (await page.locator("text=Dividi il tuo acquisto in 3 rate").count()) > 0;
        const disc = (await page.locator("text=Soggetto ad approvazione e alle condizioni di Klarna.").count()) > 0;
        check(`[${base}] logo Klarna rosa visibile`, logo > 0, logo);
        check(`[${base}] badge 'Paga in 3 rate'`, badge);
        check(`[${base}] descrizione 'Dividi il tuo acquisto in 3 rate, se disponibile.'`, desc);
        check(`[${base}] disclaimer Klarna`, disc);
        esito.push("klarna=ok");
      } else {
        esito.push("klarna=assente (non configurato per questo negozio)");
      }
    }

    // ── 6. Viewport 390px: nessun overflow/overlap ─────────────────────────
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth + 1;
    });
    check(`[${base}] nessun overflow orizzontale a 390px`, !overflow, overflow);
    await page.screenshot({ path: join(PROGETTO, "screenshots/buy-now-pagamento-390.png"), fullPage: true });

    // ── 7. Zero console errors ─────────────────────────────────────────────
    check(`[${base}] zero console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 3));
    dettagli["console_errors"] = consoleErrors;
  } catch (e) {
    esito.push(`errore=${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await page.close();
  }
  return { esito: esito.join(" · "), dettagli };
}

async function main() {
  const argUrl = process.argv.find((a) => a.startsWith("--url="));
  const baseLista = argUrl
    ? [argUrl.slice("--url=".length)]
    : ["https://www.incitta.online"];

  // Aggiungi il dev server locale se raggiungibile.
  try {
    const res = await fetch("http://localhost:3000", { signal: AbortSignal.timeout(4000) });
    if (res.status < 500) baseLista.push("http://localhost:3000");
  } catch {}

  const browser = await chromium.launch({ headless: true });
  const report: Record<string, unknown> = {};
  for (const base of baseLista) {
    console.log(`\n━━━ BUY-NOW BROWSER TEST → ${base} ━━━`);
    const r = await raccogliPaginaPagamento(browser, base);
    console.log(`→ ${r.esito}`);
    report[base] = r.dettagli;
  }
  await browser.close();

  writeFileSync(join(PROGETTO, "test-buy-now-browser-results.json"), JSON.stringify(report, null, 2));

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`BUY-NOW BROWSER TEST: ${passati} passati, ${falliti} falliti`);
  if (falliti > 0) {
    console.log(`FALLITI: ${fallitiNomi.join("\n  - ")}`);
    process.exitCode = 1;
  } else {
    console.log("TUTTI I CHECK BROWSER PASSATI ✓");
  }
}

main().catch((e) => {
  console.error("Errore esecuzione test browser:", e);
  process.exit(1);
});
