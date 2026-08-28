import { expect, type Page } from "@playwright/test";

export const GUEST_ENDPOINT = "/api/auth/guest";

/**
 * Apre il menu "Accedi" in modo robusto rispetto all'idratazione React:
 * il pulsante è reso dal server ma il toggle è un handler React, quindi il
 * click va ripetuto finché il menu non si apre davvero.
 */
export async function apriMenuAccedi(page: Page): Promise<void> {
  const voce = page.getByRole("menuitem", { name: /acquista senza account/i });
  for (let tentativo = 0; tentativo < 10; tentativo++) {
    if (await voce.isVisible().catch(() => false)) return;
    await page
      .getByRole("button", { name: "Accedi" })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(300);
  }
  await expect(voce).toBeVisible({ timeout: 5000 });
}

/**
 * Apre il menu dell'indicatore OSPITE (stessa robustezza all'idratazione).
 */
export async function apriMenuOspite(page: Page): Promise<void> {
  const voce = page.getByRole("menuitem", { name: /esci dalla modalità ospite/i });
  for (let tentativo = 0; tentativo < 10; tentativo++) {
    if (await voce.isVisible().catch(() => false)) return;
    await page
      .getByTestId("ospite-indicatore")
      .click()
      .catch(() => {});
    await page.waitForTimeout(300);
  }
  await expect(voce).toBeVisible({ timeout: 5000 });
}

/**
 * Attiva la modalità ospite tramite il CLICK REALE sulla voce del menu
 * (form POST nativo → 303 → reload della pagina) e verifica che l'header
 * riappaia nello stato OSPITE.
 */
export async function attivaOspite(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await apriMenuAccedi(page);

  const voce = page.getByRole("menuitem", { name: /acquista senza account/i });
  const [attivazione] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(GUEST_ENDPOINT) && r.request().method() === "POST",
    ),
    voce.click(),
  ]);
  expect(attivazione.status()).toBe(303);

  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("ospite-indicatore")).toBeVisible();
}
