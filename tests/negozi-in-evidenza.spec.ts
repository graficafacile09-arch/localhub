import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const BASE = "http://localhost:3100";

// Il config Playwright ha fullyParallel: true. Questi test mutano le STESSE
// righe (flag in_evidenza) quindi devono girare in seriale, e ogni test
// imposta/ripristina i propri flag con try/finally (niente beforeAll/afterAll
// condivisi che possano entrare in race tra loro).
test.describe.configure({ mode: "serial" });

// Client admin per impostare/ripristinare temporaneamente il flag in_evidenza
// (self-cleaning: i valori originali vengono sempre ripristinati).
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const raw = fs.readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// I due negozi demo usati per i test (con conteggio prodotti noto).
// Panificio Rossi ha 11 prodotti attivi, Tech Store 2 ne ha 1.
const NOMI_DEMO = ["Panificio Rossi", "Tech Store 2"];

async function getStores() {
  const { data, error } = await admin
    .from("negozi")
    .select("id, nome, in_evidenza")
    .in("nome", NOMI_DEMO);
  if (error) throw new Error(`Errore lettura negozi: ${error.message}`);
  return (data ?? []) as { id: string; nome: string; in_evidenza: boolean }[];
}

async function setFeatured(stores: { id: string }[], on: boolean) {
  await admin
    .from("negozi")
    .update({ in_evidenza: on })
    .in(
      "id",
      stores.map((s) => s.id)
    );
}

// Imposta il flag e restituisce una funzione di ripristino dei valori originali.
async function flagAndRestore(on: boolean): Promise<() => Promise<void>> {
  const stores = await getStores();
  const originali = new Map<string, boolean>();
  for (const s of stores) originali.set(s.id, s.in_evidenza);
  await setFeatured(stores, on);
  return async () => {
    for (const s of stores) {
      await admin
        .from("negozi")
        .update({ in_evidenza: originali.get(s.id) ?? false })
        .eq("id", s.id);
    }
  };
}

test.describe("NEGOZI IN EVIDENZA", () => {
  test("empty state: homepage senza sezione e /negozi?featured=1 con Empty State", async ({ page }) => {
    const restore = await flagAndRestore(false);
    try {
      // Homepage: sezione nascosta quando non ci sono evidenziati
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      await expect(page.locator("h2", { hasText: "Negozi in evidenza" })).toHaveCount(0);

      // Pagina completa: Empty State professionale
      await page.goto(`${BASE}/negozi?featured=1`, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toContainText("Nessun negozio in evidenza", {
        timeout: 10000,
      });
      const torna = page.getByRole("link", { name: "Vedi tutti i negozi" });
      await expect(torna, "il pulsante Vedi tutti i negozi deve esistere").toBeVisible();
      await expect(torna).toHaveAttribute("href", "/negozi");
    } finally {
      await restore();
    }
  });

  test("homepage: sezione ⭐ Negozi in evidenza con max 8 card e pulsante Vedi tutti", async ({ page }) => {
    const restore = await flagAndRestore(true);
    try {
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

      const heading = page.locator("h2", { hasText: "Negozi in evidenza" });
      await expect(heading, "la sezione deve comparire quando esistono evidenziati").toBeVisible();

      // Max 8 card (nella sezione)
      const card = page
        .locator("section", { hasText: "Negozi in evidenza" })
        .locator('a[href^="/negozio/"]');
      const nCard = await card.count();
      expect(nCard, "al massimo 8 card in evidenza").toBeGreaterThanOrEqual(1);
      expect(nCard, "al massimo 8 card in evidenza").toBeLessThanOrEqual(8);

      // Pulsante Vedi tutti → /negozi?featured=1
      const vediTutti = page.getByRole("link", { name: "Vedi tutti" });
      await expect(vediTutti).toBeVisible();
      await expect(vediTutti).toHaveAttribute("href", "/negozi?featured=1");
    } finally {
      await restore();
    }
  });

  test("pagina completa: /negozi?featured=1 mostra solo gli evidenziati", async ({ page }) => {
    const restore = await flagAndRestore(true);
    try {
      await page.goto(`${BASE}/negozi?featured=1`, { waitUntil: "networkidle" });

      // I due negozi flaggati devono comparire
      await expect(
        page.locator('a[href^="/negozio/"]', { hasText: "Panificio Rossi" })
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.locator('a[href^="/negozio/"]', { hasText: "Tech Store 2" })
      ).toBeVisible({ timeout: 10000 });

      // Solo gli evidenziati: nessun altro negozio demo presente
      await expect(
        page.locator('a[href^="/negozio/"]', { hasText: "Test Store Vision" })
      ).toHaveCount(0);
    } finally {
      await restore();
    }
  });

  test("ordinamento: Panificio Rossi (11 prodotti) prima di Tech Store 2 (1 prodotto)", async ({ page }) => {
    const restore = await flagAndRestore(true);
    try {
      await page.goto(`${BASE}/negozi?featured=1`, { waitUntil: "networkidle" });

      const cardNegozi = page.locator('a[href^="/negozio/"]');
      await expect(cardNegozi).toHaveCount(2, { timeout: 10000 });

      const nomi = await cardNegozi.evaluateAll((els) =>
        els.map((el) => el.querySelector("h2")?.textContent?.trim() ?? "")
      );
      expect(nomi[0], "il negozio con più prodotti attivi deve essere primo").toBe(
        "Panificio Rossi"
      );
      expect(nomi[1], "il secondo deve essere Tech Store 2").toBe("Tech Store 2");
    } finally {
      await restore();
    }
  });
});
