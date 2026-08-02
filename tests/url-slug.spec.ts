import { test, expect } from "@playwright/test";

// ─── Architettura URL pubbliche basate su slug ───────────────────────────────
// Le URL pubbliche usano SOLO slug (/negozio/<slug>, /prodotto/<slug>).
// Le vecchie URL con ID (UUID per negozi, bigint per prodotti) devono
// rispondere con un redirect permanente verso l'URL canonica.
//
// I dati demo sono seedati da supabase/migrations/20260802_seed_demo_completo.sql
// con UUID deterministici (10000000-...-0002 per demo-beauty-1) e il prodotto
// "Trattamento Glow Viso" (slug trattamento-glow-viso, id bigint 54).

const NEGOZIO_SLUG = "demo-beauty-1";
const NEGOZIO_ID_LEGACY = "10000000-0000-4000-8000-000000000002"; // UUID demo-beauty-1
const PRODOTTO_SLUG = "trattamento-glow-viso";
const PRODOTTO_ID_LEGACY = "54"; // id bigint di Trattamento Glow Viso

test.describe("URL pubbliche a slug", () => {
  test("il negozio demo è raggiungibile con lo slug", async ({ page }) => {
    const response = await page.goto(`/negozio/${NEGOZIO_SLUG}`, { timeout: 30000 });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Atelier Bellezza");
    expect(page.url()).toContain(`/negozio/${NEGOZIO_SLUG}`);
  });

  test("il prodotto demo è raggiungibile con lo slug", async ({ page }) => {
    const response = await page.goto(`/prodotto/${PRODOTTO_SLUG}`, { timeout: 30000 });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Trattamento Glow Viso");
    expect(page.url()).toContain(`/prodotto/${PRODOTTO_SLUG}`);
  });

  test("il flusso acquista usa le URL con slug", async ({ page }) => {
    const response = await page.goto(`/prodotto/${PRODOTTO_SLUG}/acquista`, { timeout: 30000 });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Completa l'acquisto");
    expect(page.url()).toContain(`/prodotto/${PRODOTTO_SLUG}/acquista`);
  });

  test("la sitemap espone gli slug pubblici", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain(`/negozio/${NEGOZIO_SLUG}`);
    expect(body).toContain(`/prodotto/${PRODOTTO_SLUG}`);
  });

  test("robots.txt è servito", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("Sitemap:");
  });
});

test.describe("Ponte legacy: redirect permanenti verso gli slug", () => {
  test("URL negozio con UUID legacy → redirect permanente allo slug", async ({ request }) => {
    const response = await request.get(`/negozio/${NEGOZIO_ID_LEGACY}`, {
      maxRedirects: 0,
    });
    // Next.js App Router emette 308 per i redirect permanenti (equivalente
    // semantico del 301: "permanent"). L'header Location deve puntare allo slug.
    expect([301, 308]).toContain(response.status());
    const location = response.headers()["location"] ?? "";
    expect(location).toContain(`/negozio/${NEGOZIO_SLUG}`);
  });

  test("URL prodotto con id numerico legacy → redirect permanente allo slug", async ({ request }) => {
    const response = await request.get(`/prodotto/${PRODOTTO_ID_LEGACY}`, {
      maxRedirects: 0,
    });
    expect([301, 308]).toContain(response.status());
    const location = response.headers()["location"] ?? "";
    expect(location).toContain(`/prodotto/${PRODOTTO_SLUG}`);
  });

  test("il redirect legacy di un negozio risolve alla pagina corretta", async ({ page }) => {
    // Seguendo il redirect (default) si arriva alla pagina canonica a slug.
    await page.goto(`/negozio/${NEGOZIO_ID_LEGACY}`, { timeout: 30000 });
    expect(page.url()).toContain(`/negozio/${NEGOZIO_SLUG}`);
    await expect(page.locator("h1")).toContainText("Atelier Bellezza");
  });

  test("un negozio inesistente → pagina non trovata", async ({ page }) => {
    const response = await page.goto("/negozio/negozio-che-non-esiste-xyz", { timeout: 30000 });
    expect(response?.status()).toBe(404);
    await expect(page.locator("body")).toContainText("Contenuto non trovato");
  });
});
