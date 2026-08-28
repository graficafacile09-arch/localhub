import { test, expect } from "@playwright/test";
import { attivaOspite } from "./fixtures/guest";

/**
 * Modalità ospite — gate di acquisto e UI.
 *
 * Modello attuale:
 * - utente anonimo SENZA modalità ospite → acquisto BLOCCATO (redirect /login);
 * - dopo il click "ACQUISTA SENZA ACCOUNT" (POST /api/auth/guest) → pagine
 *   di acquisto e checkout accessibili, indicatore OSPITE visibile.
 * (Il ciclo completo cookie/HTTP è in guest-mode-cycle.spec.ts.)
 */

const SLUG = "nutella-400-g";

test.describe("Modalità ospite — gate di acquisto e UI", () => {
  test("A) anonimo SENZA modalità ospite → acquista/checkout BLOCCATI (login)", async ({ page }) => {
    await page.goto(`/prodotto/${SLUG}/acquista`, { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/login");

    await page.goto(`/checkout`, { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("B) dopo attivazione ospite → scelta acquisto accessibile + callout", async ({ page }) => {
    await attivaOspite(page);

    await page.goto(`/prodotto/${SLUG}/acquista`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Acquista come vuoi")).toBeVisible();
    await expect(page.locator("text=continuare come ospite senza account")).toBeVisible();
  });

  test("C) ospite → form spedizione e ritiro renderizzati con nota ospite", async ({ page }) => {
    await attivaOspite(page);

    await page.goto(`/prodotto/${SLUG}/acquista/spedizione`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#nome")).toBeVisible();
    await expect(page.locator("#cognome")).toBeVisible();
    await expect(page.locator("#indirizzo")).toBeVisible();
    await expect(page.locator("text=Stai acquistando come ospite").first()).toBeVisible();

    await page.goto(`/prodotto/${SLUG}/acquista/ritiro`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#nome-ritiro")).toBeVisible();
    await expect(page.locator("#cognome-ritiro")).toBeVisible();
    await expect(page.locator("text=Stai acquistando come ospite").first()).toBeVisible();
  });

  test("D) ospite → /checkout raggiungibile (nessun redirect al login)", async ({ page }) => {
    await attivaOspite(page);

    const ck = await page.goto(`/checkout`, { waitUntil: "domcontentloaded" });
    expect(ck?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/checkout");
  });
});
