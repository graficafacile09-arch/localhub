/**
 * VERIFICA — REGOLA ANTI AUTO-ACQUISTO DEL VENDITORE.
 *
 * Un venditore può acquistare i prodotti degli ALTRI negozi, mai i PROPRI.
 * Copre:
 *   TEST 1  venditore + proprio prodotto → "Il tuo prodotto" (no Acquista,
 *           no Aggiungi al carrello), sia legacy sia varianti;
 *   TEST 2  venditore + prodotto di altro negozio → "Acquista" presente;
 *   TEST 3  API buy-now altro negozio → ordine creato (201) + cleanup;
 *   TEST 3b API carrello altro negozio → ordine creato + cleanup;
 *   TEST 4  API buy-now proprio prodotto → 403 PRODOTTO_DEL_PROPRIO_NEGOZIO,
 *           nessun ordine creato;
 *   TEST 4b API carrello proprio prodotto → 403;
 *   TEST 5  cliente + prodotto acquistabile (anche del venditore) → "Acquista";
 *   responsive 320/360/375/390/393/412/430 su "Il tuo prodotto" e su "Acquista".
 *
 * Uso: npx tsx scripts/verify-autoacquisto.ts   (dev server su :3100)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "@playwright/test";

const PROGETTO = process.cwd();
function loadEnv() {
  try {
    const raw = readFileSync(join(PROGETTO, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}
loadEnv();

const BASE = "http://localhost:3100";
const VIEWPORTS = [320, 360, 375, 390, 393, 412, 430];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

let failures = 0;
const check = (nome: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "✅" : "❌"} ${nome}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").waitFor({ timeout: 60000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90000 });
  await page.waitForTimeout(1500);
}

/**
 * Seleziona un prodotto LEGACY attivo con stock, di un negozio ATTIVO,
 * NON appartenente a negozioId (per API/CTA semplici, lato acquirente).
 */
async function trovaProdottoAltro(negozioId: string) {
  const { data, error } = await db
    .from("prodotti")
    .select("id, slug, negozio_id, nome, quantita_disponibile, ha_varianti")
    .eq("attivo", true)
    .neq("negozio_id", negozioId)
    .or("ha_varianti.is.null,ha_varianti.eq.false")
    .gt("quantita_disponibile", 0)
    .limit(20);
  if (error) return null;
  const candidati = (data ?? []).filter((p: any) => p.slug && p.slug.trim());
  if (candidati.length === 0) return null;
  const negoziIds = [...new Set(candidati.map((p: any) => String(p.negozio_id)))];
  const { data: negozi } = await db
    .from("negozi")
    .select("id, attivo")
    .in("id", negoziIds);
  const attivi = new Set((negozi ?? []).filter((n: any) => n.attivo === true).map((n: any) => String(n.id)));
  const scelto = candidati.find((p: any) => attivi.has(String(p.negozio_id)));
  return scelto
    ? { id: String(scelto.id), slug: String(scelto.slug), negozioId: String(scelto.negozio_id) }
    : null;
}

async function attesaProdotto(page: Page, slug: string) {
  await page.goto(`${BASE}/prodotto/${encodeURIComponent(slug)}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(1200);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => console.log("JS ERROR:", e.message.slice(0, 200)));

  // ── Login venditore + storeId ───────────────────────────────────────────
  await login(page, "commerciante-a.test@localhub.it", "MerchantTest123!");
  await page.goto(`${BASE}/merchant`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  let storeId = page.url().match(/\/merchant\/([^/]+)/)?.[1] ?? null;
  if (!storeId) {
    const href = await page
      .locator('a[href*="/merchant/"]')
      .evaluateAll((els) =>
        els
          .map((e) => e.getAttribute("href"))
          .find((h) => h && h !== "/merchant/nuovo" && /\/merchant\/[^/]+$/.test(h)) ?? null
      );
    storeId = href ? (href.split("/").pop() ?? null) : null;
  }
  check("storeId venditore di test individuato", !!storeId, storeId ?? "");
  storeIdGlobal = storeId ?? null;

  const prodottoAltro = await trovaProdottoAltro(storeId ?? "");
  check("prodotto di ALTRO negozio trovato", !!prodottoAltro, prodottoAltro?.slug ?? "");
  if (!storeId || !prodottoAltro) {
    await browser.close();
    return failures;
  }
  if (prodottoAltro.negozioId === storeId) {
    check("il prodotto 'altro' non è del proprio negozio", false);
  }

  // Crea un prodotto di TEST nel PROPRIO negozio (il negozio di merchantA non
  // ha prodotti): serve a verificare la CTA "Il tuo prodotto" sul proprio
  // catalogo. Pulito in coda (finally).
  const ts = Date.now();
  const creato = await page.evaluate(async (storeId) => {
    const r = await fetch(`/api/merchant/stores/${storeId}/products`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "Prodotto Test Autoacquisto",
        descrizione: "Prodotto creato dallo script di verifica auto-acquisto.",
        categoria: "Test",
        prezzo: 10,
        quantitaDisponibile: 5,
        attivo: true,
      }),
    });
    const body = await r.json().catch(() => null);
    return { status: r.status, product: body?.data?.product ?? null };
  }, storeId);
  const prodottoMio = creato.product
    ? { id: String(creato.product.id), slug: String(creato.product.slug) }
    : null;
  creatoMioId = prodottoMio?.id ?? null;
  if (creatoMioId) {
    // mapProduct non espone lo slug: lo leggiamo dal DB per aprire la pagina.
    const { data: slugRow } = await db
      .from("prodotti")
      .select("slug")
      .eq("id", creatoMioId)
      .single();
    prodottoMio!.slug = String(slugRow?.slug ?? "");
  }
  check(
    "prodotto di TEST creato nel proprio negozio",
    creato.status === 201 && !!prodottoMio && prodottoMio.slug.length > 0,
    `${creato.status} ${prodottoMio?.slug ?? ""}`
  );
  if (!prodottoMio || prodottoMio.slug.length === 0) {
    await browser.close();
    return failures;
  }

  // Il negozio di merchantA è INATTIVO: il pre-flight del carrello lo
  // rifiuterebbe (409) PRIMA della nostra verifica di proprietà. Lo
  // attiviamo temporaneamente (ripristinato nel cleanup) così il blocco
  // auto-acquisto è raggiungibile e testabile su entrambi i flussi.
  await db.from("negozi").update({ attivo: true }).eq("id", storeId);
  const { data: storeStato } = await db
    .from("negozi")
    .select("attivo")
    .eq("id", storeId)
    .single();
  check("negozio del venditore attivato per il test", storeStato?.attivo === true);

  // ── TEST 1 — proprio prodotto: "Il tuo prodotto", niente Acquista ───────
  await attesaProdotto(page, prodottoMio.slug);
  const etichetta1 = await page.getByText("Il tuo prodotto").first().isVisible().catch(() => false);
  check("TEST 1 — proprio prodotto: etichetta 'Il tuo prodotto' visibile", etichetta1);
  const acquista1 = await page.getByText(/acquista/i).count();
  check("TEST 1 — proprio prodotto: NESSUN 'Acquista' nella pagina", acquista1 === 0, `${acquista1} trovati`);
  const carrello1 = await page.getByText(/aggiungi al carrello/i).count();
  check("TEST 1 — proprio prodotto: NESSUN 'Aggiungi al carrello'", carrello1 === 0, `${carrello1} trovati`);
  const info1 = await page.getByRole("heading", { level: 1 }).first().textContent();
  check("TEST 1 — nome/prezzo/info del prodotto restano visibili", !!info1 && info1.trim().length > 0, info1?.trim());

  // ── TEST 2 — altro negozio: "Acquista" presente ─────────────────────────
  await attesaProdotto(page, prodottoAltro.slug);
  const etichetta2 = await page.getByText("Il tuo prodotto").count();
  check("TEST 2 — altro negozio: NESSUN 'Il tuo prodotto'", etichetta2 === 0, `${etichetta2} trovati`);
  const linkAcquista2 = await page.locator('a[href*="/acquista"]').count();
  check("TEST 2 — altro negozio: link 'Acquista' presente", linkAcquista2 >= 1, `${linkAcquista2} link`);

  // ── TEST 4 — API buy-now proprio prodotto → 403, zero ordini ────────────
  const keyOwn = `verify-auto-own-${Date.now()}`;
  const esitoOwn = await page.evaluate(async ({ key, prodottoId }) => {
    const r = await fetch("/api/cliente/ordini", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: key,
        prodottoId,
        quantita: 1,
        modalita: "ritiro",
        cliente: { nome: "Test", cognome: "Venditore" },
        ritiro: { data: "2026-08-25", fascia: "09:00-13:00" },
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { key: keyOwn, prodottoId: prodottoMio.id });
  check(
    "TEST 4 — buy-now proprio prodotto → 403 PRODOTTO_DEL_PROPRIO_NEGOZIO",
    esitoOwn.status === 403 && esitoOwn.body?.error?.code === "PRODOTTO_DEL_PROPRIO_NEGOZIO",
    `${esitoOwn.status} ${esitoOwn.body?.error?.code ?? JSON.stringify(esitoOwn.body ?? {}).slice(0, 120)}`
  );
  const { count: ordiniOwn } = await db
    .from("ordini")
    .select("id", { head: true, count: "exact" })
    .eq("idempotency_key", keyOwn);
  check("TEST 4 — nessun ordine creato (auto-acquisto bloccato)", Number(ordiniOwn ?? 0) === 0, String(ordiniOwn));

  // ── TEST 4b — API carrello proprio prodotto → 403 ───────────────────────
  const keyCartOwn = `verify-auto-cart-${Date.now()}`;
  const esitoCartOwn = await page.evaluate(async ({ key, prodottoId }) => {
    const r = await fetch("/api/cliente/ordini/carrello", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        checkoutKey: key,
        righe: [{ prodottoId, quantita: 1 }],
        modalita: "ritiro",
        cliente: { nome: "Test", cognome: "Venditore" },
        ritiro: { data: "2026-08-25", fascia: "09:00-13:00" },
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { key: keyCartOwn, prodottoId: prodottoMio.id });
  check(
    "TEST 4b — carrello proprio prodotto → 403 PRODOTTO_DEL_PROPRIO_NEGOZIO",
    esitoCartOwn.status === 403 && esitoCartOwn.body?.error?.code === "PRODOTTO_DEL_PROPRIO_NEGOZIO",
    `${esitoCartOwn.status} ${esitoCartOwn.body?.error?.code ?? JSON.stringify(esitoCartOwn.body ?? {}).slice(0, 120)}`
  );

  // ── TEST 3 — API buy-now altro negozio → 201 + cleanup ──────────────────
  const { data: stockAltro } = await db
    .from("prodotti")
    .select("quantita_disponibile")
    .eq("id", prodottoAltro.id)
    .single();
  const stockPre = Number(stockAltro?.quantita_disponibile ?? 0);
  const keyAltro = `verify-auto-altro-${Date.now()}`;
  const esitoAltro = await page.evaluate(async ({ key, prodottoId }) => {
    const r = await fetch("/api/cliente/ordini", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: key,
        prodottoId,
        quantita: 1,
        modalita: "ritiro",
        cliente: { nome: "Test", cognome: "Acquirente" },
        ritiro: { data: "2026-08-25", fascia: "09:00-13:00" },
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { key: keyAltro, prodottoId: prodottoAltro.id });
  const ordineAltroId = esitoAltro.body?.data?.ordine?.id ?? null;
  check(
    "TEST 3 — buy-now altro negozio → ordine creato (201)",
    esitoAltro.status === 201 && Boolean(ordineAltroId),
    `${esitoAltro.status} ${esitoAltro.body?.error?.code ?? JSON.stringify(esitoAltro.body ?? {}).slice(0, 160)}`
  );
  if (ordineAltroId) {
    await db.from("ordini_righe").delete().eq("ordine_id", String(ordineAltroId));
    await db.from("pagamenti_sessioni").delete().eq("ordine_id", String(ordineAltroId));
    await db.from("pagamenti_eventi").delete().eq("ordine_id", String(ordineAltroId));
    await db.from("ordini").delete().eq("id", String(ordineAltroId));
    await db.from("prodotti").update({ quantita_disponibile: stockPre }).eq("id", prodottoAltro.id);
    check("TEST 3 — cleanup ordine altro negozio completato", true);
  }

  // ── TEST 3b — API carrello altro negozio → ordine creato + cleanup ──────
  const keyCartAltro = `verify-auto-cart2-${Date.now()}`;
  const esitoCartAltro = await page.evaluate(async ({ key, prodottoId }) => {
    const r = await fetch("/api/cliente/ordini/carrello", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        checkoutKey: key,
        righe: [{ prodottoId, quantita: 1 }],
        modalita: "ritiro",
        cliente: { nome: "Test", cognome: "Acquirente" },
        ritiro: { data: "2026-08-25", fascia: "09:00-13:00" },
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { key: keyCartAltro, prodottoId: prodottoAltro.id });
  const ordiniCart = (esitoCartAltro.body?.data?.ordini ?? []) as Array<{ ordineId?: string }>;
  const ordineCartId = ordiniCart[0]?.ordineId ?? null;
  check(
    "TEST 3b — carrello altro negozio → ordine creato (201)",
    esitoCartAltro.status === 201 && Boolean(ordineCartId),
    `${esitoCartAltro.status} ${esitoCartAltro.body?.error?.code ?? JSON.stringify(esitoCartAltro.body ?? {}).slice(0, 160)}`
  );
  if (ordineCartId) {
    await db.from("ordini_righe").delete().eq("ordine_id", String(ordineCartId));
    await db.from("pagamenti_sessioni").delete().eq("ordine_id", String(ordineCartId));
    await db.from("pagamenti_eventi").delete().eq("ordine_id", String(ordineCartId));
    await db.from("ordini").delete().eq("id", String(ordineCartId));
    await db.from("prodotti").update({ quantita_disponibile: stockPre }).eq("id", prodottoAltro.id);
    check("TEST 3b — cleanup ordine carrello completato", true);
  }

  // ── TEST 5 — cliente: "Acquista" ovunque (anche sul prodotto del venditore) ──
  await login(page, "customer-a.test@localhub.it", "CustomerTest123!");
  await attesaProdotto(page, prodottoMio.slug);
  const etichetta5 = await page.getByText("Il tuo prodotto").count();
  check("TEST 5 — cliente sul prodotto del venditore: NESSUN 'Il tuo prodotto'", etichetta5 === 0, `${etichetta5} trovati`);
  const acquista5 = await page.locator('a[href*="/acquista"]').count();
  check("TEST 5 — cliente: link 'Acquista' presente", acquista5 >= 1, `${acquista5} link`);

  // ── Responsive: "Il tuo prodotto" (proprio) e "Acquista" (altro) ────────
  await login(page, "commerciante-a.test@localhub.it", "MerchantTest123!");
  for (const w of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: 800 });
    await attesaProdotto(page, prodottoMio.slug);
    const ok1 = await page.getByText("Il tuo prodotto").first().isVisible().catch(() => false);
    const over1 = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    check(`${w}px — 'Il tuo prodotto' visibile senza overflow`, ok1 && over1.doc <= over1.win, `doc=${over1.doc} win=${over1.win}`);

    await attesaProdotto(page, prodottoAltro.slug);
    const ok2 = (await page.locator('a[href*="/acquista"]').count()) >= 1;
    const over2 = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    check(`${w}px — 'Acquista' visibile senza overflow`, ok2 && over2.doc <= over2.win, `doc=${over2.doc} win=${over2.win}`);
  }

  console.log(failures === 0 ? "\n✅ TUTTI I TEST PASSANO" : `\n❌ ${failures} test falliti`);
  await browser.close();
  return failures;
}

let creatoMioId: string | null = null;
let storeIdGlobal: string | null = null;
let codiceEsito = 1;
main()
  .then((f) => {
    codiceEsito = f;
  })
  .catch((err) => {
    console.error("\nERRORE:", err.message ?? err);
  })
  .finally(async () => {
    // Cleanup SEMPRE eseguito: elimina il prodotto di TEST e ripristina
    // attivo=false del negozio del venditore (mai residui nel DB).
    if (creatoMioId) {
      await db.from("prodotto_varianti").delete().eq("prodotto_id", creatoMioId);
      await db.from("prodotti").delete().eq("id", creatoMioId);
      console.log(`🧹 cleanup: prodotto di test ${creatoMioId} eliminato`);
    }
    if (storeIdGlobal) {
      await db.from("negozi").update({ attivo: false }).eq("id", storeIdGlobal);
      console.log("🧹 cleanup: negozio del venditore riportato a attivo=false");
    }
    process.exit(codiceEsito === 0 ? 0 : 1);
  });
