import { test, expect, type Cookie } from "@playwright/test";
import { apriMenuAccedi, apriMenuOspite } from "./fixtures/guest";

/**
 * TEST OBBLIGATORIO — ciclo completo della modalità ospite NEL BROWSER.
 *
 * ANONIMO
 *   ↓ click "ACQUISTA SENZA ACCOUNT" (form POST nativo, nessun fetch)
 *   ↓ POST /api/auth/guest → 303 + Set-Cookie lh_guest=1
 *   ↓ OSPITE visibile nell'header (renderizzato server-side)
 *   ↓ /prodotto/.../acquista e /checkout accessibili
 *   ↓ click "ESCI DALLA MODALITÀ OSPITE" → lh_guest assente
 *   ↓ OSPITE assente → acquisto nuovamente bloccato (redirect a /login)
 *
 * Il test usa un contesto browser NUOVO (equivalente incognito) e verifica
 * stato HTTP, Set-Cookie, attributi del cookie e persistenza dopo reload.
 */

const SLUG = "nutella-400-g";
const GUEST_ENDPOINT = "/api/auth/guest";

function cookieGuest(cookies: Cookie[]): Cookie | undefined {
  return cookies.find((c) => c.name === "lh_guest");
}

/** headers() non espone sempre Set-Cookie: si usa headersArray() (async). */
async function setCookieDi(risposta: {
  headersArray(): Promise<{ name: string; value: string }[]>;
}): Promise<string> {
  return (await risposta.headersArray())
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value)
    .join("\n");
}

test.describe("Modalità ospite — ciclo completo (browser reale)", () => {
  test("ANONIMO → ACQUISTA SENZA ACCOUNT → lh_guest=1 → OSPITE → acquisto → ESCI → blocco", async ({ browser }) => {
    // 1. browser completamente nuovo/incognito
    const context = await browser.newContext();
    const page = await context.newPage();

    // 2. GET /
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Stato iniziale: nessun cookie guest, nessun indicatore OSPITE
    expect(cookieGuest(await context.cookies())).toBeUndefined();
    await expect(page.getByTestId("ospite-indicatore")).toHaveCount(0);

    // A) anonimo SENZA modalità ospite → acquisto BLOCCATO (redirect login)
    await page.goto(`/prodotto/${SLUG}/acquista`, { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/login");
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // 3-4. aprire AccountMenu e verificare la voce "ACQUISTA SENZA ACCOUNT"
    await apriMenuAccedi(page);

    // 5-8. click REALE (navigazione form POST) + cattura richiesta/risposta
    const [attivazione] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(GUEST_ENDPOINT) && r.request().method() === "POST",
      ),
      page.getByRole("menuitem", { name: /acquista senza account/i }).click(),
    ]);
    // 7. status HTTP reale: 303 See Other (PRG), non un semplice 200 JSON
    expect(attivazione.status()).toBe(303);
    // 8. Set-Cookie reale con lh_guest=1 e attributi corretti
    const setCookieAttivazione = await setCookieDi(attivazione);
    expect(setCookieAttivazione).toContain("lh_guest=1");
    expect(setCookieAttivazione).toMatch(/HttpOnly/i);
    expect(setCookieAttivazione).toMatch(/SameSite=Lax/i);
    expect(setCookieAttivazione).toMatch(/Max-Age=\d+/);

    // il browser ha seguito il 303 e ricaricato la pagina di provenienza
    await page.waitForLoadState("domcontentloaded");

    // 9-11. cookie nel contesto, dominio/path/SameSite/HttpOnly/expiry corretti
    const cookie = cookieGuest(await context.cookies());
    expect(cookie).toBeTruthy();
    expect(cookie!.value).toBe("1");
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    expect(cookie!.path).toBe("/");
    const hostname = new URL(page.url()).hostname;
    expect(hostname.endsWith(cookie!.domain.replace(/^\./, ""))).toBe(true);
    if (new URL(page.url()).protocol === "https:") {
      expect(cookie!.secure).toBe(true);
    }
    // cookie PERSISTENTE (~30 giorni), non di sessione
    const ora = Date.now() / 1000;
    expect(cookie!.expires ?? -1).toBeGreaterThan(ora - 60);

    // 12-13. NON cancellato da proxy/layout: dopo il click l'URL è quello di
    // provenienza e il cookie è ancora nel browser
    expect(new URL(page.url()).pathname).toBe("/");
    expect(cookieGuest(await context.cookies())).toBeTruthy();

    // 14. riaprendo il menu compare OSPITE con la voce di uscita
    await expect(page.getByTestId("ospite-indicatore")).toBeVisible();
    await apriMenuOspite(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("ospite-indicatore")).toBeVisible();

    // 15. /prodotto/<slug>/acquista accessibile in modalità ospite
    await page.goto(`/prodotto/${SLUG}/acquista`, { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe(`/prodotto/${SLUG}/acquista`);
    await expect(page.getByText("Ritiro in negozio")).toBeVisible();

    // 16. /checkout accessibile (renderizza la pagina, NON il login)
    const checkout = await page.goto("/checkout", { waitUntil: "domcontentloaded" });
    expect(checkout?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/checkout");

    // 17. ESCI DALLA MODALITÀ OSPITE → cookie rimosso → acquisto di nuovo bloccato
    await apriMenuOspite(page);
    const [uscita] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(GUEST_ENDPOINT) && r.request().method() === "POST",
      ),
      page.getByRole("menuitem", { name: /esci dalla modalità ospite/i }).click(),
    ]);
    expect(uscita.status()).toBe(303);
    const setCookieUscita = await setCookieDi(uscita);
    expect(setCookieUscita).toMatch(/lh_guest=;/);
    expect(setCookieUscita).toMatch(/Max-Age=0/);

    await page.waitForLoadState("domcontentloaded");
    expect(cookieGuest(await context.cookies())).toBeUndefined();
    await expect(page.getByTestId("ospite-indicatore")).toHaveCount(0);

    // l'acquisto torna BLOCCATO per l'anonimo
    await page.goto(`/prodotto/${SLUG}/acquista`, { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/login");

    await context.close();
  });

  test("E) ospite → 'Entra come Cliente' → il cookie lh_guest viene rimosso", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // attivazione ospite dal menu
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await apriMenuAccedi(page);
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(GUEST_ENDPOINT) && r.request().method() === "POST",
      ),
      page.getByRole("menuitem", { name: /acquista senza account/i }).click(),
    ]);
    await page.waitForLoadState("domcontentloaded");
    expect(cookieGuest(await context.cookies())).toBeTruthy();

    // dal menu ospite: "Entra come Cliente" → /login → proxy rimuove lh_guest
    await apriMenuOspite(page);
    await page.getByRole("menuitem", { name: /entra come cliente/i }).click();
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");

    expect(cookieGuest(await context.cookies())).toBeUndefined();
    await expect(page.getByTestId("ospite-indicatore")).toHaveCount(0);

    await context.close();
  });
});
