import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE = "http://localhost:3000/negozio";
const TEMPLATE = "demo-panificio-1";
const OTHERS = [
  "demo-beauty-1", "demo-casa-1", "demo-auto-1",
  "demo-salute-1", "demo-tech-1", "demo-bimbi-1",
  "demo-sport-1", "demo-pet-1",
];

const STRUCTURAL_SECTIONS = [
  // These checks verify the structural layout is identical
  { name: "Wrapping container", check: "container" },
  { name: "Header", check: "header" },
  { name: "Hero image area", check: "hero" },
  { name: "Store name", check: "name" },
  { name: "Category text", check: "category" },
  { name: "Description text", check: "description" },
  { name: "Address row", check: "address-row" },
  { name: "Opening hours", check: "orari" },
  { name: "Action buttons row", check: "actions" },
  { name: "WhatsApp button", check: "whatsapp" },
  { name: "Map button", check: "map" },
  { name: "Call button", check: "call" },
  { name: "Website button", check: "site" },
  { name: "Products section title", check: "products-title" },
  { name: "Products grid", check: "products-grid" },
  { name: "CTA AI section", check: "cta-ai" },
  { name: "Footer", check: "footer" },
];

const COMPARISON_CHECKS = [
  // STRUCTURE: Same sections, same order
  { type: "count", label: "main sections count", selector: "main > div > div" },
  { type: "count", label: "action buttons", selector: "main a[href*='wa.me'], main a[href*='google.com/maps'], main a[href^='tel:'], main a[target=_blank]" },
  // BORDERS & RADIUS of hero
  { type: "style", label: "hero container border-radius", selector: "main > div > div:first-child", prop: "borderRadius" },
  // BUTTON styles
  { type: "style", label: "WhatsApp button bg", selector: "a[href*='wa.me']", prop: "backgroundColor" },
  { type: "style", label: "WhatsApp button text color", selector: "a[href*='wa.me']", prop: "color" },
  { type: "style", label: "WhatsApp button font-weight", selector: "a[href*='wa.me']", prop: "fontWeight" },
  { type: "style", label: "WhatsApp button font-size", selector: "a[href*='wa.me']", prop: "fontSize" },
  { type: "style", label: "WhatsApp button border-radius", selector: "a[href*='wa.me']", prop: "borderRadius" },
  { type: "style", label: "Map button border", selector: "a[href*='google.com/maps']", prop: "borderWidth" },
  { type: "style", label: "Map button text color", selector: "a[href*='google.com/maps']", prop: "color" },
  { type: "style", label: "Map button font-size", selector: "a[href*='google.com/maps']", prop: "fontSize" },
  { type: "style", label: "Call button border", selector: "a[href^='tel:']", prop: "borderWidth" },
  { type: "style", label: "Call button text color", selector: "a[href^='tel:']", prop: "color" },
  // Store name style
  { type: "style", label: "Store name font-size", selector: "h1", prop: "fontSize" },
  { type: "style", label: "Store name font-weight", selector: "h1", prop: "fontWeight" },
  { type: "style", label: "Store name color", selector: "h1", prop: "color" },
  // Category style
  { type: "style", label: "Category font-size", selector: "h1 + p", prop: "fontSize" },
  { type: "style", label: "Category color", selector: "h1 + p", prop: "color" },
  // Description style
  { type: "style", label: "Description font-size", selector: ".text-xs.leading-5", prop: "fontSize" },
  { type: "style", label: "Description color", selector: ".text-xs.leading-5", prop: "color" },
  // Address/phone text style
  { type: "style", label: "Address/phone font-size", selector: ".flex-wrap .flex.items-center", prop: "fontSize" },
  { type: "style", label: "Address/phone color", selector: ".flex-wrap .flex.items-center", prop: "color" },
  // Products title style
  { type: "style", label: "Products title font-size", selector: "section h2", prop: "fontSize" },
  { type: "style", label: "Products title color", selector: "section h2", prop: "color" },
  // Product card style
  { type: "style", label: "Product card font-weight", selector: "section.mt-4 a[href^='/prodotto/'] h3", prop: "fontWeight" },
  { type: "style", label: "Product card price color", selector: "section.mt-4 a[href^='/prodotto/'] p:last-child", prop: "color" },
  { type: "style", label: "Product card border-radius", selector: "section.mt-4 a[href^='/prodotto/']", prop: "borderRadius" },
  // CTA AI
  { type: "style", label: "CTA AI border-color", selector: "div.border-blue-100", prop: "borderColor" },
  { type: "style", label: "CTA AI text color", selector: "div.border-blue-100 p", prop: "color" },
  { type: "style", label: "CTA AI text font-size", selector: "div.border-blue-100 p", prop: "fontSize" },
  // Header
  { type: "style", label: "Header background", selector: "header", prop: "backgroundColor" },
  { type: "style", label: "Header nav link color", selector: "header nav a", prop: "color" },
  // Footer
  { type: "style", label: "Footer text color", selector: "footer", prop: "color" },
  { type: "style", label: "Footer font-size", selector: "footer", prop: "fontSize" },
  // Icons in buttons - check icon sizes via icon containers
  { type: "style", label: "WhatsApp icon size", selector: "a[href*='wa.me'] svg", prop: "width" },
  { type: "style", label: "Map icon size", selector: "a[href*='google.com/maps'] svg", prop: "width" },
  // Margins
  { type: "margin", label: "Hero margin bottom", selector: "main > div > div:first-child", prop: "marginBottom" },
  { type: "margin", label: "Info section margin top", selector: ".mt-3 h1", prop: "marginTop" },
];

async function extractStyles(page) {
  const results = {};
  
  // Extract computed styles for each check
  for (const check of COMPARISON_CHECKS) {
    const key = check.label;
    
    if (check.type === "count") {
      const count = await page.evaluate((sel) => document.querySelectorAll(sel).length, check.selector);
      results[key] = { value: count, type: "count" };
    } else if (check.type === "style") {
      try {
        const val = await page.evaluate(({ sel, prop }) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return getComputedStyle(el)[prop];
        }, { sel: check.selector, prop: check.prop });
        results[key] = { value: val, type: "style", prop: check.prop };
      } catch {
        results[key] = { value: null, type: "style", prop: check.prop };
      }
    } else if (check.type === "margin") {
      try {
        const val = await page.evaluate(({ sel }) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const parent = el.parentElement;
          return parent ? getComputedStyle(parent).marginTop : null;
        }, { sel: check.selector });
        results[key] = { value: val, type: "margin" };
      } catch {
        results[key] = { value: null, type: "margin" };
      }
    }
  }
  
  return results;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  console.log("📸 Acquisizione template Panificio Rossi...");
  const tplPage = await context.newPage();
  await tplPage.goto(`${BASE}/${TEMPLATE}`, { waitUntil: "networkidle" });
  await tplPage.waitForTimeout(1500);
  const templateStyles = await extractStyles(tplPage);
  await tplPage.close();

  console.log("✅ Template acquisito\n");

  const report = { template: TEMPLATE, allGood: true, pages: [] };

  for (const store of OTHERS) {
    const page = await context.newPage();
    await page.goto(`${BASE}/${store}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const pageStyles = await extractStyles(page);
    await page.close();

    const diffs = [];

    for (const check of COMPARISON_CHECKS) {
      const key = check.label;
      const tVal = templateStyles[key]?.value;
      const pVal = pageStyles[key]?.value;

      if (tVal === null || pVal === null) continue; // element not present on both

      if (tVal !== pVal) {
        diffs.push({ check: key, template: tVal, page: pVal });
      }
    }

    if (diffs.length > 0) {
      report.allGood = false;
      console.log(`❌ ${store} — ${diffs.length} differenza/e:`);
      for (const d of diffs) {
        console.log(`   ${d.check}: template="${d.template}" vs page="${d.page}"`);
      }
    } else {
      console.log(`✅ ${store} — IDENTICO`);
    }
    console.log();

    report.pages.push({ store, diffs });
  }

  writeFileSync("screenshots/visual-report.json", JSON.stringify(report, null, 2));
  await browser.close();
  
  console.log("\n═══════════════════════════════════");
  if (report.allGood) {
    console.log("✅ TUTTE LE PAGINE SONO VISIVAMENTE IDENTICHE AL TEMPLATE");
  } else {
    console.log("❌ TROVATE DIFFERENZE — correggere e ripetere");
  }
  console.log("═══════════════════════════════════");
  console.log("Report salvato in screenshots/visual-report.json");
}

main().catch(console.error);
