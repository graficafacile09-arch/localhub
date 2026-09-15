/**
 * VERIFICA VISUALE Prodotti Tipici — screenshot + controlli layout.
 * Viewport: 375 / 390 / 1440. Cattura homepage (sezione ECCELLENZE),
 * pagina /prodotti-tipici e dettaglio prodotto.
 *
 * Uso: npx tsx scripts/__verifica-visuale-prodotti-tipici.ts [BASE_URL]
 */
import { chromium, type Page } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";
const VIEWPORTS = [
  { w: 375, h: 812, label: "mobile-375" },
  { w: 390, h: 844, label: "mobile-390" },
  { w: 1440, h: 900, label: "desktop-1440" },
];

const OUT = "scripts/__verifica-visuale-shots";

type OverflowInfo = {
  innerW: number;
  docScrollW: number;
  bodyScrollW: number;
  hasOverflow: boolean;
  offenders: Array<{ tag: string; cls: string; right: number; left: number; w: number; text: string }>;
};

async function checkOverflow(page: Page): Promise<OverflowInfo> {
  return page.evaluate(() => {
    const innerW = window.innerWidth;
    const docScrollW = document.documentElement.scrollWidth;
    const bodyScrollW = document.body.scrollWidth;
    const hasOverflow = docScrollW > innerW + 1 || bodyScrollW > innerW + 1;
    const offenders: Array<{ tag: string; cls: string; right: number; left: number; w: number; text: string }> = [];
    if (hasOverflow) {
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.right > innerW + 1 || r.left < -1) {
          let p = el.parentElement;
          let ancestorOverflows = false;
          while (p && p !== document.body && p !== document.documentElement) {
            const pr = p.getBoundingClientRect();
            if (pr.right > innerW + 1 || pr.left < -1) { ancestorOverflows = true; break; }
            p = p.parentElement;
          }
          if (!ancestorOverflows) {
            const cls = typeof el.className === "string" ? el.className : "";
            offenders.push({
              tag: el.tagName,
              cls: cls.slice(0, 90),
              right: Math.round(r.right),
              left: Math.round(r.left),
              w: Math.round(r.width),
              text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 45),
            });
          }
        }
      });
    }
    return { innerW, docScrollW, bodyScrollW, hasOverflow, offenders: offenders.slice(0, 8) };
  });
}

/** Misura la card del primo prodotto della sezione ECCELLENZE (homepage). */
async function misuraCardHome(page: Page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("a[href^='/prodotto/']")).filter(
      (a) => a.closest("section") !== null
    );
    // La sezione ECCELLENZE è l'unica le cui card hanno il badge "Prodotto tipico".
    const tipica = cards.find((a) => a.querySelector("span")?.textContent?.includes("tipico"));
    if (!tipica) return null;
    const card = tipica.closest(".group");
    if (!card) return null;
    const r = card.getBoundingClientRect();
    const img = card.querySelector("[role='img']");
    const ir = img ? img.getBoundingClientRect() : null;
    const badges = Array.from(card.querySelectorAll("span")).map((s) => ({
      text: (s.textContent || "").trim().replace(/\s+/g, " "),
      right: Math.round(s.getBoundingClientRect().right),
      left: Math.round(s.getBoundingClientRect().left),
      top: Math.round(s.getBoundingClientRect().top),
    }));
    return {
      cardW: Math.round(r.width),
      imgW: ir ? Math.round(ir.width) : null,
      imgH: ir ? Math.round(ir.height) : null,
      ratio: ir && ir.height ? (ir.width / ir.height).toFixed(2) : null,
      badges,
      nome: card.querySelector("h3")?.textContent?.trim() ?? "",
      prezzo: card.querySelector("p")?.textContent?.trim() ?? "",
      negozio: card.querySelectorAll("p")[1]?.textContent?.trim() ?? "",
      linkProdotto: tipica.getAttribute("href"),
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const fs = await import("fs");
  fs.mkdirSync(OUT, { recursive: true });

  const paths = ["/", "/prodotti-tipici", "/prodotto/ciotaredda-castrovillari"];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    console.log(`\n══════════ VIEWPORT ${vp.label} (${vp.w}px) ══════════`);

    for (const path of paths) {
      try {
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60000 });
      } catch (e) {
        console.log(`  ⚠️ ${path}: ${(e as Error).message.slice(0, 70)}`);
        continue;
      }
      await page.waitForTimeout(600);

      const overflow = await checkOverflow(page);
      const statoOverflow = overflow.hasOverflow ? "❌ OVERFLOW" : "✅ no overflow";
      console.log(`  ${statoOverflow} ${path} (doc=${overflow.docScrollW} inner=${overflow.innerW})`);
      for (const o of overflow.offenders) {
        console.log(`      <${o.tag}> .${o.cls} right=${o.right} left=${o.left} w=${o.w} "${o.text}"`);
      }

      if (path === "/") {
        const card = await misuraCardHome(page);
        console.log(`  Card ECCELLENZE: ${JSON.stringify(card)}`);
        // Screenshot della sezione: scorri finché il titolo ECCELLENZE è visibile.
        try {
          await page.getByText("ECCELLENZE CALABRESI").first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
        } catch {}
      }
      await page.screenshot({ path: `${OUT}/${vp.label}${path === "/" ? "-home" : path.replace(/\//g, "-")}.png`, fullPage: false });
    }
    await context.close();
  }

  await browser.close();
  console.log(`\nScreenshot salvati in ${OUT}/`);
}

main().catch((e) => { console.error("Errore:", e); process.exit(1); });
