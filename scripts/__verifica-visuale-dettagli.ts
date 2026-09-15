/**
 * Verifica mirata: sovrapposizione badge "Prodotto tipico" ↔ FavoritoButton,
 * ordine sezioni homepage, titolo/link sezione, dettaglio prodotto.
 */
import { chromium, type Page } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });

  for (const vp of [
    { w: 320, h: 700, label: "320" },
    { w: 375, h: 812, label: "375" },
    { w: 1440, h: 900, label: "1440" },
  ]) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await context.newPage();
    console.log(`\n════ VIEWPORT ${vp.label}px ════`);

    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(500);

    // Ordine sezioni: posizione Y dei titoli.
    const ordine = await page.evaluate(() => {
      const titoli = ["Categorie", "ECCELLENZE CALABRESI", "Negozi in evidenza", "Prodotti in evidenza"];
      const out: Record<string, number> = {};
      for (const t of titoli) {
        const el = Array.from(document.querySelectorAll("h1,h2,h3")).find((h) => (h.textContent || "").trim() === t);
        out[t] = el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1;
      }
      return out;
    });
    console.log("Ordine sezioni (Y):", JSON.stringify(ordine));

    // Sovrapposizione badge ↔ cuore su una card tipica.
    const badge = await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll(".group"))
        .find((c) => (c.textContent || "").includes("Prodotto tipico"));
      if (!card) return null;
      const badge = Array.from(card.querySelectorAll("span")).find((s) =>
        (s.textContent || "").includes("Prodotto tipico")
      );
      const cuore = card.querySelector("button[aria-label]");
      const b = badge?.getBoundingClientRect();
      const h = cuore?.getBoundingClientRect();
      if (!b || !h) return { badge: null, cuore: null };
      const sovrapposti = !(b.right <= h.left || h.right <= b.left || b.bottom <= h.top || h.bottom <= b.top);
      return {
        badge: { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom) },
        cuore: { left: Math.round(h.left), right: Math.round(h.right), top: Math.round(h.top), bottom: Math.round(h.bottom) },
        sovrapposti,
      };
    });
    console.log("Badge↔Cuore:", JSON.stringify(badge));

    // Titolo sezione: una riga? Misura altezza del box del titolo.
    const titolo = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll("h1,h2,h3")).find(
        (h) => (h.textContent || "").trim() === "ECCELLENZE CALABRESI"
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), text: el.textContent?.trim() };
    });
    console.log("Titolo ECCELLENZE:", JSON.stringify(titolo));

    await context.close();
  }

  // Dettaglio prodotto tipico: deve essere la pagina prodotto normale.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/prodotto/ciotaredda-castrovillari`, { waitUntil: "networkidle", timeout: 60000 });
  const dettaglio = await page.evaluate(() => {
    return {
      url: location.pathname,
      h1: document.querySelector("h1")?.textContent?.trim() ?? "",
      hasPrezzo: /€/.test(document.body.textContent || ""),
      hasBreadcrumb: /Castrovillari|negozio|Home/.test(document.querySelector("nav")?.textContent || ""),
    };
  });
  console.log("\nDettaglio /prodotto/ciotaredda-castrovillari:", JSON.stringify(dettaglio));
  await ctx.close();

  await browser.close();
}

main().catch((e) => { console.error("Errore:", e); process.exit(1); });
