import { test, expect } from "@playwright/test";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

/**
 * Collaudo della nuova funzione: l'ADMIN crea un negozio dall'Area
 * Amministratore usando lo STESSO wizard e lo STESSO Store Editor del
 * venditore (nessun secondo editor).
 *
 * Verifica (in ordine):
 *   1. accesso admin a /amministratore/negozi/nuovo;
 *   2. presenza del pulsante "Crea negozio";
 *   3. apertura del Wizard (3 modalità: Da zero / Da Template / Duplica);
 *   4. creazione di un negozio;
 *   5. redirect a /amministratore/negozi/{id}/edit;
 *   6. apertura dello STESSO Store Editor completo del merchant (6 sezioni);
 *   7. il negozio è modificabile e salvabile dall'admin;
 *   8. il merchant continua a usare il proprio editor senza regressioni.
 *
 * Gli account non sono MAI condivisi tra spec concorrenti: questo spec usa
 * esclusivamente UTENTI.admin (mai signOut) e UTENTI.merchantA; va eseguito
 * con `--workers=1` se insieme ad altre suite.
 *
 * Il negozio creato viene ELIMINATO DEFINITIVAMENTE alla fine del test
 * (API admin cestina + definitivo): nessun residuo nel DB.
 */

const suffisso = Date.now().toString(36);
const NOME_NEGOZIO = `E2E Admin ${suffisso}`;
const NOME_MODIFICATO = `E2E Admin Rinominato ${suffisso}`;

test.describe("Admin → Crea negozio → Store Editor", () => {
  test.describe.configure({ mode: "serial" });

  let storeId: string | null = null;

  // La pulizia del negozio creato avviene alla fine del test 3 (sessione
  // admin ancora attiva): best-effort, non fa fallire i test.
  async function eliminaNegozioCreato(page: import("@playwright/test").Page) {
    if (!storeId) return;
    try {
      await page.evaluate(async (id) => {
        await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
        await fetch(`/api/amministratore/negozi/${id}/definitivo`, { method: "DELETE" });
      }, storeId);
    } catch {
      // best-effort
    }
    storeId = null;
  }

  test("1. Accesso admin alla pagina di creazione + CTA 'Crea negozio' + Wizard", async ({ page }) => {
    await loginUtente(page, UTENTI.admin);

    // 1a) Il pannello "Gestione Negozi" espone il pulsante "Crea negozio".
    await page.goto(`${BASE}/amministratore/attivita`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Gestione Negozi" })).toBeVisible();
    const cta = page.getByRole("link", { name: "Crea negozio" });
    await expect(cta).toBeVisible();

    // 2) Il click apre il wizard dell'admin.
    await cta.click();
    await page.waitForURL("**/amministratore/negozi/nuovo", { timeout: 30000 });
    await expect(page.getByRole("heading", { name: "Nuovo negozio" })).toBeVisible();

    // 3) Wizard completo: le 3 modalità del venditore.
    await expect(page.getByRole("button", { name: "Da zero" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Da Template" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Duplica negozio" })).toBeVisible();
  });

  test("2. Creazione negozio → redirect all'editor condiviso con tutte le sezioni", async ({ page }) => {
    await loginUtente(page, UTENTI.admin);
    await page.goto(`${BASE}/amministratore/negozi/nuovo`, { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Nuovo negozio" })).toBeVisible();

    // 4) Compila il wizard (modalità "Da zero", profilo default) e crea.
    await page.getByPlaceholder("es. Panificio Rossi").fill(NOME_NEGOZIO);
    // Il wizard non associa la label al select via htmlFor: uso il combobox.
    await page.getByRole("combobox").selectOption("Bar");
    await page.getByPlaceholder("es. Castrovillari").fill("Castrovillari");
    await page.getByRole("button", { name: "Crea negozio" }).click();

    // 5) Redirect automatico all'editor condiviso in area admin.
    await page.waitForURL(/\/amministratore\/negozi\/[0-9a-f-]+\/edit$/, { timeout: 30000 });
    const url = page.url();
    storeId = url.match(/\/amministratore\/negozi\/([0-9a-f-]+)\/edit/)?.[1] ?? null;
    expect(storeId, "redirect a /amministratore/negozi/{id}/edit").toBeTruthy();

    // 6) Store Editor COMPLETO del venditore: 6 sezioni (stessa struttura).
    await expect(page.getByText("Sezione 01 di 6")).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("heading", { name: "Attività" })).toBeVisible();

    // La sidebar renderizza numero ("01") e titolo in span separati.
    const sidebar = page.locator("aside");
    for (const titolo of [
      "Attività",
      "Contatti e orari",
      "Presentazione",
      "Catalogo e servizi",
      "Vendita e agenda",
      "Anteprima e pubblicazione",
    ]) {
      await expect(sidebar.getByText(titolo, { exact: true })).toBeVisible();
    }

    // Il modulo "Informazioni" dell'editor è caricato (campo nome precompilato).
    // Le label dell'editor non hanno htmlFor: ancoriamo al placeholder univoco.
    await expect(page.getByPlaceholder("es. Panificio Rossi")).toHaveValue(NOME_NEGOZIO);
  });

  test("3. Il negozio è modificabile e salvabile dall'admin", async ({ page }) => {
    await loginUtente(page, UTENTI.admin);
    expect(storeId, "negozio creato dal test precedente").toBeTruthy();

    // Riapertura successiva: stesso editor (verifica anche la modifica "in seguito").
    await page.goto(`${BASE}/amministratore/negozi/${storeId}/edit`, { waitUntil: "networkidle" });
    await expect(page.getByText("Sezione 01 di 6")).toBeVisible({ timeout: 30000 });

    // 7) Modifica il nome dall'editor e salva.
    const campoNome = page.getByPlaceholder("es. Panificio Rossi");
    await campoNome.fill(NOME_MODIFICATO);
    await page.getByRole("button", { name: "Salva modifiche" }).click();

    // Il salvataggio persiste (il messaggio "Modifiche salvate." può essere
    // transitorio perché l'editor si ri-fetcha i dati): attendi che l'API
    // settings rifletta il nuovo nome.
    await expect
      .poll(
        async () => {
          const settings = await page.evaluate(async (id) => {
            const res = await fetch(`/api/merchant/stores/${id}/settings`);
            const json = await res.json();
            return json.success ? json.data.settings?.nome ?? null : null;
          }, storeId);
          return settings;
        },
        { timeout: 15000 }
      )
      .toBe(NOME_MODIFICATO);

    // Riapertura successiva (modifica "in seguito"): reload → nome persistito.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByPlaceholder("es. Panificio Rossi")).toHaveValue(NOME_MODIFICATO, {
      timeout: 30000,
    });

    // Pulizia: elimina definitivamente il negozio di test creato dall'admin.
    await eliminaNegozioCreato(page);
  });

  test("4. Il merchant continua a usare il proprio editor (nessuna regressione)", async ({ page }) => {
    await loginUtente(page, UTENTI.merchantA);

    // Trova il negozio fixture del merchant via API (stessa sessione).
    const negozi = await page.evaluate(async () => {
      const res = await fetch("/api/merchant/stores");
      const json = await res.json();
      return json.success ? json.data.stores : [];
    });
    const negozio = negozi.find((s: { nome: string }) => s.nome === "Negozio QA Commerciante A");
    expect(negozio, "negozio fixture del merchant presente").toBeTruthy();

    // 8) Editor del merchant: apre normalmente con le 6 sezioni.
    await page.goto(`${BASE}/merchant/${negozio.id}/edit`, { waitUntil: "networkidle" });
    await expect(page.getByText("Sezione 01 di 6")).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("heading", { name: "Attività" })).toBeVisible();
    await expect(page.getByPlaceholder("es. Panificio Rossi")).toBeVisible();

    // La commissione (blocco solo admin) NON compare per il merchant.
    await expect(page.getByText("Commissione", { exact: false })).toHaveCount(0);
  });
});
