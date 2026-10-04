import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const OUT = "screenshots/card-negozi";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "playwright" });
const errors = [];
let failed = false;

function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failed = true;
}

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
]) {
  const page = await browser.newPage({ viewport });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${BASE}/negozi`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // Raccogli le card (quelle con la targhetta gialla della categoria).
  const cards = await page.$$eval("a[href^='/negozio/']", (links) =>
    links
      .map((a) => a.closest("div"))
      .filter((d) => d && d.querySelector("span.bg-yellow-400"))
      .map((d, i) => ({ i }))
  );
  check(`[${viewport.name}] card negozi trovate`, cards.length > 0, `n=${cards.length}`);

  const data = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a[href^='/negozio/']")];
    const cards = links
      .map((a) => a.closest("div"))
      .filter((d) => d && d.querySelector("span.bg-yellow-400"));

    return cards.slice(0, 6).map((card) => {
      const nome = card.querySelector("h2")?.textContent?.trim() || "?";
      const btn = [...card.querySelectorAll("button")].find((b) =>
        (b.getAttribute("aria-label")?.startsWith("Condividi ") ?? false)
      );
      const cardRect = card.getBoundingClientRect();
      const btnRect = btn?.getBoundingClientRect();
      const logo = card.querySelector("div.absolute.-bottom-4");
      const logoRect = logo?.getBoundingClientRect();
      return {
        nome,
        cardTop: cardRect.top,
        cardBottom: cardRect.bottom,
        btnTop: btnRect?.top ?? null,
        btnBottom: btnRect?.bottom ?? null,
        btnLeft: btnRect?.left ?? null,
        btnRight: btnRect?.right ?? null,
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        logoBottom: logoRect?.bottom ?? null,
        aria: btn?.getAttribute("aria-label") ?? null,
      };
    });
  });

  // 1. Il tasto Condividi è dentro i limiti verticali della propria card.
  for (const c of data) {
    check(
      `[${viewport.name}] "${c.nome}": il tasto Condividi è dentro la card`,
      c.btnTop !== null && c.btnBottom !== null && c.btnBottom <= c.cardBottom + 1,
      `btnBottom=${c.btnBottom?.toFixed(1)} cardBottom=${c.cardBottom.toFixed(1)}`
    );
    check(
      `[${viewport.name}] "${c.nome}": il tasto è sotto il logo`,
      c.btnTop !== null && c.logoBottom !== null && c.btnTop >= c.logoBottom - 60,
      `btnTop=${c.btnTop?.toFixed(1)} logoBottom=${c.logoBottom?.toFixed(1)}`
    );
  }

  // 2. Nessuna sovrapposizione tra il tasto di una card e la card successiva.
  for (let i = 0; i < data.length - 1; i++) {
    const cur = data[i];
    const next = data[i + 1];
    // Solo coppie che stanno in colonne che si sovrappongono orizzontalmente
    // (cioè card adiacenti). Serve a ignorare le card affiancate nella stessa riga.
    const sameColumn = !(cur.cardRight <= next.cardLeft + 1 || next.cardRight <= cur.cardLeft + 1);
    if (!sameColumn) continue;
    const gap = next.cardTop - cur.cardBottom;
    check(
      `[${viewport.name}] "${cur.nome}" → "${next.nome}": spazio tra le righe`,
      gap > 0,
      `gap=${gap.toFixed(1)}px`
    );
    if (cur.btnBottom !== null) {
      const clearance = next.cardTop - cur.btnBottom;
      check(
        `[${viewport.name}] "${cur.nome}": il tasto non tocca la card sotto`,
        clearance > 2,
        `clearance=${clearance.toFixed(1)}px`
      );
    }
  }

  // 3. Nessuno scroll orizzontale.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  check(`[${viewport.name}] nessuno scroll orizzontale`, overflow <= 0, `overflow=${overflow}`);

  // 4. Il menu si apre sopra la card giusta.
  const first = data[0];
  if (first) {
    const btn = page.getByRole("button", { name: `Condividi ${first.nome}`, exact: true }).first();
    await btn.click();
    await page.waitForTimeout(400);
    const menu = await page
      .locator("[role='menu'][aria-label='Condividi attività']")
      .first()
      .isVisible()
      .catch(() => false);
    check(`[${viewport.name}] menu Condividi si apre`, menu);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  await page.screenshot({
    path: `${OUT}/condividi-sotto-${viewport.name}.png`,
    fullPage: false,
  });
  await page.close();
}

check("nessun errore console", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
console.log(failed ? "\nRISULTATO: FALLITO" : "\nRISULTATO: OK");
process.exit(failed ? 1 : 0);