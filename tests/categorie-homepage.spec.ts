import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3100";

test.describe("CATEGORIE HOMEPAGE — dinamiche dal catalogo", () => {
  test("la homepage mostra 8 categorie + tile 'Tutte le categorie' (niente più ?q= hardcoded)", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

    await expect(page.locator("body")).toContainText("Categorie");

    // Esattamente 8 tile dinamiche ?categoria=...
    const tiles = page.locator('a[href^="/ricerca?categoria="]');
    await expect(tiles).toHaveCount(8);

    // Nona tile "Tutte le categorie" → /categorie
    const tutte = page.getByRole("link", { name: "Tutte le categorie" });
    await expect(tutte, "la tile Tutte le categorie deve esistere").toBeVisible();
    await expect(tutte).toHaveAttribute("href", "/categorie");

    // Le vecchie tile hardcoded ?q=... non devono esistere
    const oldTiles = page.locator(
      'a[href="/ricerca?q=Negozi"], a[href="/ricerca?q=Food"], a[href="/ricerca?q=Moda"], a[href="/ricerca?q=Servizi"]'
    );
    await expect(oldTiles).toHaveCount(0);
  });

  test("click su una categoria della homepage → /ricerca?categoria=<slug> → negozi filtrati", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

    // "Tech & Elettronica" è nel catalogo e ha negozi (storici "elettronica"/"Elettronica")
    const tile = page
      .locator('a[href^="/ricerca?categoria="]')
      .filter({ hasText: "Tech & Elettronica" });
    await expect(tile, "tile Tech & Elettronica deve esistere").toBeVisible();
    await tile.click();

    await expect(page).toHaveURL(/\/ricerca\?categoria=tech-elettronica/);

    // Vetrina categoria: header con nome, conteggio "X negozi in" e card negozio
    await expect(page.locator("h1")).toContainText("Tech & Elettronica", { timeout: 10000 });
    await expect(page.locator("body")).toContainText("11 negozi in", { timeout: 10000 });
    await expect(page.locator('a[href^="/negozio/"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("categoria senza negozi → empty state professionale con Torna alle categorie", async ({ page }) => {
    // fioraio è una categoria del catalogo senza negozi visibili
    await page.goto(`${BASE}/ricerca?categoria=fioraio`, { waitUntil: "networkidle" });

    await expect(page.locator("body")).toContainText("Nessun negozio presente in questa categoria", {
      timeout: 10000,
    });
    const torna = page.getByRole("link", { name: "Torna alle categorie" });
    await expect(torna, "il pulsante Torna alle categorie deve esistere").toBeVisible();
    await expect(torna).toHaveAttribute("href", "/categorie");
  });

  test("le card negozio mostrano il pulsante Entra nel negozio / Prodotti in arrivo", async ({ page }) => {
    // Tech Store 2 ha 1 prodotto attivo → "Entra nel negozio"; i Test Store Vision hanno 0 prodotti → "Prodotti in arrivo"
    await page.goto(`${BASE}/ricerca?categoria=tech-elettronica`, { waitUntil: "networkidle" });

    const cardConProdotti = page.locator('a[href^="/negozio/"]', { hasText: "Tech Store 2" });
    await expect(cardConProdotti).toContainText("Entra nel negozio", { timeout: 10000 });
    await expect(cardConProdotti).toContainText("1 prodotto attivo");

    const cardSenzaProdotti = page
      .locator('a[href^="/negozio/"]', { hasText: "Test Store Vision" })
      .first();
    await expect(cardSenzaProdotti).toContainText("Prodotti in arrivo", { timeout: 10000 });
  });

  test("il numero visualizzato nel header coincide con le card mostrate", async ({ page }) => {
    await page.goto(`${BASE}/ricerca?categoria=tech-elettronica`, { waitUntil: "networkidle" });

    // Header: "11 negozi in"
    await expect(page.locator("body")).toContainText("11 negozi in", { timeout: 10000 });

    // 11 card negozio (Tech Store 2 + 10 Test Store Vision)
    const cardNegozi = page.locator('a[href^="/negozio/"]');
    await expect(cardNegozi.first()).toBeVisible({ timeout: 10000 });
    expect(await cardNegozi.count()).toBe(11);
  });

  test("ogni negozio demo è raggiungibile cliccando la SUA categoria (non la ricerca testuale)", async ({ page }) => {
    // Panificio Rossi → categoria Panificio (era Alimentari, orfano)
    await page.goto(`${BASE}/ricerca?categoria=panificio`, { waitUntil: "networkidle" });
    // Header grammaticale: 1 negozio (singolare) in "Panificio"
    await expect(page.locator("body")).toContainText("1 negozio in", { timeout: 10000 });
    await expect(page.locator('a[href^="/negozio/"]', { hasText: "Panificio Rossi" })).toBeVisible({
      timeout: 10000,
    });

    // Tech Store 2 e Test Store Vision → categoria Tech & Elettronica
    await page.goto(`${BASE}/ricerca?categoria=tech-elettronica`, { waitUntil: "networkidle" });
    await expect(page.locator('a[href^="/negozio/"]', { hasText: "Tech Store 2" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('a[href^="/negozio/"]', { hasText: "Test Store Vision" }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("i negozi della categoria sono ordinati per ranking (prodotti attivi prima)", async ({ page }) => {
    await page.goto(`${BASE}/ricerca?categoria=tech-elettronica`, { waitUntil: "networkidle" });

    const cardNegozi = page.locator('a[href^="/negozio/"]');
    await expect(cardNegozi.first()).toBeVisible({ timeout: 10000 });

    // Nel DB: "Tech Store 2" ha 1 prodotto attivo, i 10 "Test Store Vision" ne hanno 0.
    // Il ranking (criterio 2: maggior numero di prodotti attivi) deve metterlo PRIMO.
    const primo = (await cardNegozi.first().locator("h3").textContent())?.trim();
    expect(primo, "il negozio con più prodotti attivi deve essere primo").toBe("Tech Store 2");

    // Ordinamento stabile e deterministico: ricaricando la pagina l'ordine resta identico.
    const ordine1 = await cardNegozi.evaluateAll((els) =>
      els.map((el) => el.querySelector("h3")?.textContent?.trim() ?? "")
    );
    await page.reload({ waitUntil: "networkidle" });
    const ordine2 = await page
      .locator('a[href^="/negozio/"]')
      .evaluateAll((els) =>
        els.map((el) => el.querySelector("h3")?.textContent?.trim() ?? "")
      );
    expect(ordine2).toEqual(ordine1);
  });
});

test.describe("PAGINA /categorie — elenco completo", () => {
  test("mostra TUTTE le categorie e ogni tile apre /ricerca?categoria=<slug>", async ({ page }) => {
    await page.goto(`${BASE}/categorie`, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toContainText("Tutte le categorie");

    // Più delle 8 della homepage (22 nel catalogo)
    const tiles = page.locator('a[href^="/ricerca?categoria="]');
    const count = await tiles.count();
    expect(count, "la pagina /categorie deve mostrare tutte le categorie").toBeGreaterThan(8);

    // Ogni tile punta a /ricerca?categoria=<slug>
    const hrefs = await tiles.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href"))
    );
    for (const href of hrefs) {
      expect(href).toMatch(/^\/ricerca\?categoria=[a-z0-9-]+$/);
    }

    // Click su una categoria → pagina di ricerca con i negozi
    const tech = tiles.filter({ hasText: "Tech & Elettronica" });
    await expect(tech).toBeVisible();
    await tech.click();
    await expect(page).toHaveURL(/\/ricerca\?categoria=tech-elettronica/);
    await expect(page.locator("h1")).toContainText("Tech & Elettronica", { timeout: 10000 });
    await expect(page.locator("body")).toContainText("11 negozi in", { timeout: 10000 });
    await expect(page.locator('a[href^="/negozio/"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("ogni categoria mostra il conteggio reale dei negozi attivi", async ({ page }) => {
    await page.goto(`${BASE}/categorie`, { waitUntil: "networkidle" });

    // Ogni tile mostra un conteggio "X negozi" o "1 negozio" / "0 negozi"
    const tiles = page.locator('a[href^="/ricerca?categoria="]');
    const count = await tiles.count();
    expect(count).toBeGreaterThan(8);

    const conteggi = await tiles.evaluateAll((els) =>
      els.map((el) => el.textContent ?? "")
    );
    for (const testo of conteggi) {
      expect(testo).toMatch(/\d+ negoz[io]/);
    }

    // Il conteggio reale dal DB: il numero mostrato deve coincidere con i
    // negozi attivi effettivamente filtrati nella pagina /ricerca.
    // Tech & Elettronica ha 11 negozi attivi (valori storici "elettronica"/"Elettronica").
    const tech = tiles.filter({ hasText: "Tech & Elettronica" });
    await expect(tech).toContainText("11 negozi");

    // Dopo la normalizzazione demo, Panificio ha 1 negozio visibile (Panificio Rossi)
    const panificio = tiles.filter({ hasText: "Panificio" });
    await expect(panificio).toContainText("1 negozio");
    await expect(panificio).toBeVisible();

    // Una categoria davvero senza negozi mostra "0 negozi" ed è cliccabile
    const fioraio = tiles.filter({ hasText: "Fioraio" });
    await expect(fioraio).toContainText("0 negozi");
    await expect(fioraio).toBeVisible();
  });

  test("conteggio /categorie == numero card negozio in /ricerca (filtro collegato)", async ({ page }) => {
    await page.goto(`${BASE}/categorie`, { waitUntil: "networkidle" });

    // Legge il conteggio mostrato sulla tile (es. "11 negozi" → 11)
    const tech = page
      .locator('a[href^="/ricerca?categoria="]')
      .filter({ hasText: "Tech & Elettronica" });
    const testo = (await tech.textContent()) ?? "";
    const match = testo.match(/(\d+)\s+negoz[io]/);
    expect(match, "la tile deve mostrare un conteggio numerico").not.toBeNull();
    const conteggioTile = Number(match![1]);

    // Click → /ricerca?categoria=tech-elettronica
    await tech.click();
    await expect(page).toHaveURL(/\/ricerca\?categoria=tech-elettronica/);

    // Il numero di card negozio deve coincidere ESATTAMENTE col conteggio
    const cardNegozi = page.locator('a[href^="/negozio/"]');
    await expect(cardNegozi.first()).toBeVisible({ timeout: 10000 });
    const nCard = await cardNegozi.count();
    expect(nCard, "numero card negozio == conteggio /categorie").toBe(conteggioTile);
  });
});
