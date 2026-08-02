/**
 * Helper condivisi di autenticazione per la suite Playwright.
 * Unico punto da cui gli spec fanno login: tutti gli account provengono
 * da tests/fixtures/users.ts (mai email/password hardcoded nei test).
 */
import type { Page } from "@playwright/test";
import { UTENTI, type UtenteFixture } from "./users";

export { UTENTI };
export type { UtenteFixture };

/** Base URL del server di test locale. */
export const BASE = "http://localhost:3100";

export interface LoginOptions {
  /** Pattern URL atteso dopo il submit (passato a waitForURL). */
  waitFor?: string | RegExp;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

/** Effettua il login tramite il form pubblico /login. */
export async function loginUtente(
  page: Page,
  utente: UtenteFixture,
  opts: LoginOptions = {}
) {
  await page.goto(`${BASE}/login`, {
    waitUntil: opts.waitUntil ?? "networkidle",
  });
  await page.locator("#email").fill(utente.email);
  await page.locator("#password").fill(utente.password);
  await page
    .locator('form[action="/api/auth/login"] button[type="submit"]')
    .click();
  if (opts.waitFor) {
    await page.waitForURL(opts.waitFor, { timeout: 20000 });
  }
}
