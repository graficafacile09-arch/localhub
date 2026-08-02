import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3100";

// ─── Chiavi univoche (SLUG) ─────────────────────────────────────────────────
// I negozi vengono identificati ESCLUSIVAMENTE per slug (href), mai per nome:
// i nomi possono ripetersi (es. due "Panificio Rossi"), gli slug no.
const HREF_PANIFICIO = "/negozio/panificio-rossi";
const HREF_TECH = "/negozio/tech-store-2";
const HREF_VISION_PREFIX = "/negozio/test-store-vision";

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

    // La tile si seleziona per slug (href), non per nome visualizzato.
    const tile = page.locator('a[href="/ricerca?categoria=tech-elettronica"]');
    await expect(tile, "tile Tech & Elettronica deve esistere").toBeVisible();
    await tile.click();

    await expect(page).toHaveURL(/\/ricerca\?categoria=tech-elettronica/);

    // Vetrina categoria: header con nome, conteggio dinamico e card negozio
    await expect(page.locator("h1")).toContainText("Tech & Elettronica", { timeout: 10000 });
    await expect(page.locator("body")).toContainText(/\d+ negoz[io] in/, { timeout: 10000 });
    await expect(page.locator('a[href^="/negozio/"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("categoria senza negozi → empty state professionale con Torna alle categorie", async ({ page }) => {
    // Si sceglie dinamicamente una categoria con 0 negozi (fioraio oggi, ma il
    // test resta valido anche se in futuro cambia: verifica il comportamento
    // empty-state, non un conteggio hardcoded).
    await page.goto(`${BASE}/categorie`, { waitUntil: "networkidle" });
    const zero = page.locator('a[href^="/ricerca?categoria="]', { hasText: "0 negozi" });
    await expect(zero.first()).toBeVisible({ timeout: 10000 });
    const hrefZero = await zero.first().getAttribute("href");

    await page.goto(`${BASE}${hrefZero}`, { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText("Nessun negozio presente in questa categoria", {
      timeout: 10000,
    });
    const torna = page.getByRole("link", { name: "Torna alle categorie" });
    await expect(torna, "il pulsante Torna alle categorie deve esistere").toBeVisible();
    await expect(torna).toHaveAttribute("href", "/categorie");
  });

  test("le card negozio mostrano il pulsante Entra nel negozio / Prodotti in arrivo", async ({ page }) => {
    // Il negozio Tech Store 2 (identificato per slug) ha prodotti attivi →
    // "Entra nel negozio". Un negozio senza prodotti (prefix test-store-vision)
    // → "Prodotti in arrivo". Nessun conteggio numerico hardcoded.
    await page.goto(`${BASE}/ricerca?categoria=tech-elettronica`, { waitUntil: "networkidle" });

    const cardConProdotti = page.locator(`a[href="${HREF_TECH}"]`);
    await expect(cardConProdotti).toContainText("Entra nel negozio", { timeout: 10000 });

    const cardSenzaProdotti = page
      .locator(`a[href^="${HREF_VISION_PREFIX}"]`)
      .first();
    await expect(cardSenzaProdotti).toContainText("Prodotti in arrivo", { timeout: 10000 });
  });

  test("il numero visualizzato nel header coincide con le card mostrate (conteggio dinamico)", async ({ page }) => {
    await page.goto(`${BASE}/ricerca?categoria=tech-elettronica`, { waitUntil: "networkidle" });

    // Conteggio ricavato dinamicamente dal header della pagina (regex), non
    // hardcoded: il test resta valido con qualsiasi numero di negozi.
    const header = await page.locator("body").textContent();
    const match = header?.match(/(\d+)\s+negoz[io]\s+in/);
    expect(match, "l'header deve mostrare un conteggio numerico").not.toBeNull();
    const conteggioHeader = Number(match![1]);

    // Le card effettivamente renderizzate devono coincidere col conteggio.
    const cardNegozi = page.locator('a[href^="/negozio/"]');
    await expect(cardNegozi.first()).toBeVisible({ timeout: 10000 });
    expect(await cardNegozi.count()).toBe(conteggioHeader);
  });

  test("ogni negozio demo è raggiungibile cliccando la SUA categoria (identificato per slug)", async ({ page }) => {
    // Panificio Rossi (reale, slug panificio-rossi) → categoria Panificio.
    // Il clic sulla card per slug deve aprire la pagina del negozio.
    await page.goto(`${BASE}/ricerca?categoria=panificio`, { waitUntil: "networkidle" });
    const cardPanificio = page.locator(`a[href="${HREF_PANIFICIO}"]`);
    await expect(cardPanificio).toBeVisible({ timeout: 10000 });
    await cardPanificio.click();
    await expect(page).toHaveURL(new RegExp(HREF_PANIFICIO.replace("/", "\\/")));
    await expect(page.locator("h1")).toContainText("Panificio Rossi", { timeout: 10000 });

    // Tech Store 2 e un Test Store Vision → categoria Tech & Elettronica
    await page.goto(`${BASE}/ricerca?categoria=tech-elettronica`, { waitUntil: "networkidle" });
    await expect(page.locator(`a[href="${HREF_TECH}"]`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`a[href^="${HREF_VISION_PREFIX}"]`).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("i negozi della categoria sono ordinati per ranking (più prodotti attivi prima, verificato dinamicamente)", async ({ page }) => {
    await page.goto(`${BASE}/ricerca?categoria=tech-elettronica`, { waitUntil: "networkidle" });

    const cardNegozi = page.locator('a[href^="/negozio/"]');
    await expect(cardNegozi.first()).toBeVisible({ timeout: 10000 });

    // Il ranking dell'app ordina i negozi per numero di prodotti attivi.
    // Verifichiamo DINAMICAMENTE: per ogni card leggiamo il testo del pulsante
    // stato ("Entra nel negozio" = ha prodotti, "Prodotti in arrivo" = nessuno)
    // e ci assicuriamo che i negozi con prodotti precedano quelli senza.
    // Nessun numero hardcoded: il test resta valido con qualsiasi combinazione.
    const stati = await cardNegozi.evaluateAll((els) =>
      els.map((el) => (el.textContent ?? "").includes("Entra nel negozio"))
    );
    let vistoSenzaProdotti = false;
    for (const haProdotti of stati) {
      if (haProdotti) {
        expect(
          vistoSenzaProdotti,
          "un negozio con prodotti non può seguire uno senza prodotti"
        ).toBe(false);
      } else {
        vistoSenzaProdotti = true;
      }
    }

    // Ordinamento stabile e deterministico: ricaricando la pagina l'ordine resta identico.
    const ordine1 = await cardNegozi.evaluateAll((els) =>
      els.map((el) => el.getAttribute("href") ?? "")
    );
    await page.reload({ waitUntil: "networkidle" });
    const ordine2 = await page
      .locator('a[href^="/negozio/"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
    expect(ordine2).toEqual(ordine1);
  });
});

test.describe("PAGINA /categorie — elenco completo", () => {
  test("mostra TUTTE le categorie e ogni tile apre /ricerca?categoria=<slug>", async ({ page }) => {
    await page.goto(`${BASE}/categorie`, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toContainText("Tutte le categorie");

    // Più delle 8 della homepage (conteggio dinamico: nessun numero hardcoded)
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
    const tech = page.locator('a[href="/ricerca?categoria=tech-elettronica"]');
    await expect(tech).toBeVisible();
    await tech.click();
    await expect(page).toHaveURL(/\/ricerca\?categoria=tech-elettronica/);
    await expect(page.locator("h1")).toContainText("Tech & Elettronica", { timeout: 10000 });
    await expect(page.locator('a[href^="/negozio/"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("ogni categoria mostra un conteggio reale (verificato dinamicamente su quella cliccata)", async ({ page }) => {
    await page.goto(`${BASE}/categorie`, { waitUntil: "networkidle" });

    // Ogni tile mostra un conteggio "X negozi" / "X negozio" (regex, mai hardcoded)
    const tiles = page.locator('a[href^="/ricerca?categoria="]');
    const count = await tiles.count();
    expect(count).toBeGreaterThan(8);

    const conteggi = await tiles.evaluateAll((els) =>
      els.map((el) => el.textContent ?? "")
    );
    for (const testo of conteggi) {
      expect(testo).toMatch(/\d+ negoz[io]/);
    }

    // La categoria Panificio deve esistere e mostrare almeno 1 negozio
    // (verifica di presenza per slug, senza numeri hardcoded) — prima del click.
    const panificio = page.locator('a[href="/ricerca?categoria=panificio"]');
    await expect(panificio).toBeVisible();
    await expect(panificio).toContainText(/\d+ negoz[io]/);

    // Verifica dinamica su UNA categoria: il conteggio mostrato sulla tile deve
    // coincidere col numero di card nella pagina /ricerca.
    const tech = page.locator('a[href="/ricerca?categoria=tech-elettronica"]');
    await expect(tech).toBeVisible();
    const testo = (await tech.textContent()) ?? "";
    const match = testo.match(/(\d+)\s+negoz[io]/);
    expect(match, "la tile deve mostrare un conteggio numerico").not.toBeNull();
    const conteggioTile = Number(match![1]);

    await tech.click();
    await expect(page).toHaveURL(/\/ricerca\?categoria=tech-elettronica/);
    const cardNegozi = page.locator('a[href^="/negozio/"]');
    await expect(cardNegozi.first()).toBeVisible({ timeout: 10000 });
    expect(await cardNegozi.count()).toBe(conteggioTile);
  });

  test("conteggio /categorie == numero card negozio in /ricerca (filtro collegato)", async ({ page }) => {
    await page.goto(`${BASE}/categorie`, { waitUntil: "networkidle" });

    // Legge il conteggio mostrato sulla tile (regex) → click → confronta col
    // numero di card renderizzate. Dinamico, nessun numero hardcoded.
    const tech = page
      .locator('a[href="/ricerca?categoria=tech-elettronica"]');
    const testo = (await tech.textContent()) ?? "";
    const match = testo.match(/(\d+)\s+negoz[io]/);
    expect(match, "la tile deve mostrare un conteggio numerico").not.toBeNull();
    const conteggioTile = Number(match![1]);

    await tech.click();
    await expect(page).toHaveURL(/\/ricerca\?categoria=tech-elettronica/);

    const cardNegozi = page.locator('a[href^="/negozio/"]');
    await expect(cardNegozi.first()).toBeVisible({ timeout: 10000 });
    const nCard = await cardNegozi.count();
    expect(nCard, "numero card negozio == conteggio /categorie").toBe(conteggioTile);
  });
});
