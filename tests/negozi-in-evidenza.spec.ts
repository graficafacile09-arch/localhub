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

// Chiave UNIVOCA per selezionare i negozi: lo SLUG (mai il nome — i nomi
// possono ripetersi, gli slug no). Panificio Rossi esiste in 2 copie reali
// (panificio-rossi e demo-panificio-1): il test flagga SOLO lo slug scelto.
const SLUG_DEMO = ["panificio-rossi", "tech-store-2"];

async function getStores() {
  const { data, error } = await admin
    .from("negozi")
    .select("id, slug, in_evidenza")
    .in("slug", SLUG_DEMO);
  if (error) throw new Error(`Errore lettura negozi: ${error.message}`);
  return (data ?? []) as { id: string; slug: string; in_evidenza: boolean }[];
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

  test("pagina completa: /negozi?featured=1 mostra i negozi flaggati (identificati per slug)", async ({ page }) => {
    const restore = await flagAndRestore(true);
    try {
      await page.goto(`${BASE}/negozi?featured=1`, { waitUntil: "networkidle" });

      // I negozi flaggati per slug devono comparire (href univoco = chiave).
      for (const slug of SLUG_DEMO) {
        await expect(
          page.locator(`a[href="/negozio/${slug}"]`)
        ).toBeVisible({ timeout: 10000 });
      }

      // I negozi NON flaggati non devono comparire. Identifichiamo un negozio
      // reale NON in evidenza per slug (test-store-vision-* sono stati di test
      // con 0 prodotti; panificio demo resta fuori perché mai flaggato).
      const nonEvidenziati = await admin
        .from("negozi")
        .select("slug")
        .eq("attivo", true)
        .is("deleted_at", null)
        .eq("in_evidenza", false)
        .limit(1);
      const slugNonEvidenziato = nonEvidenziati.data?.[0]?.slug as string | undefined;
      if (slugNonEvidenziato) {
        await expect(
          page.locator(`a[href="/negozio/${slugNonEvidenziato}"]`)
        ).toHaveCount(0);
      }
    } finally {
      await restore();
    }
  });

  test("ordinamento: i negozi in evidenza rispettano il ranking reale (più prodotti attivi prima)", async ({ page }) => {
    const restore = await flagAndRestore(true);
    try {
      await page.goto(`${BASE}/negozi?featured=1`, { waitUntil: "networkidle" });

      const cardNegozi = page.locator('a[href^="/negozio/"]');
      await expect(cardNegozi.first()).toBeVisible({ timeout: 10000 });

      // Ranking dinamico: la stessa query usata dall'app (conteggio prodotti
      // attivi per i negozi flaggati) determina l'ordine atteso — nessun
      // numero hardcoded, il test resta valido se domani i dati cambiano.
      const stores = await getStores();
      const { data: prodotti } = await admin
        .from("prodotti")
        .select("negozio_id")
        .eq("attivo", true)
        .in(
          "negozio_id",
          stores.map((s) => s.id)
        );
      const conteggio = new Map<string, number>();
      for (const p of prodotti ?? []) {
        const id = p.negozio_id as string;
        conteggio.set(id, (conteggio.get(id) ?? 0) + 1);
      }
      const slugPerId = new Map(stores.map((s) => [s.id, s.slug]));
      const ordineAtteso = [...stores].sort((a, b) => {
        const diff = (conteggio.get(b.id) ?? 0) - (conteggio.get(a.id) ?? 0);
        if (diff !== 0) return diff;
        return (a.slug ?? "").localeCompare(b.slug ?? "");
      });

      const hrefs = await cardNegozi.evaluateAll((els) =>
        els.map((el) => el.getAttribute("href") ?? "")
      );

      // L'ordine visualizzato deve coincidere col ranking dinamico.
      expect(hrefs[0]).toBe(`/negozio/${slugPerId.get(ordineAtteso[0].id)}`);
      expect(hrefs[1]).toBe(`/negozio/${slugPerId.get(ordineAtteso[1].id)}`);
    } finally {
      await restore();
    }
  });
});
