// TEST TEMPORANEO — verifica funzionale del crop dell'editor immagini.
// Da eliminare dopo la verifica. NON committare.
import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://localhost:3177";

/** Verifica l'immagine salvata: dimensione + colore di pixel campione. */
async function verifySaved(page, { expectW, expectH, tl, br }) {
  const out = await page.evaluate(() => {
    const dataUrl = window.__saved;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const px = (x, y) => {
          const d = ctx.getImageData(x, y, 1, 1).data;
          return { r: d[0], g: d[1], b: d[2] };
        };
        resolve({ w: c.width, h: c.height, tl: px(1, 1), br: px(c.width - 2, c.height - 2) });
      };
      img.onerror = () => resolve({ error: "decode-failed" });
      img.src = dataUrl;
    });
  });
  const near = (a, b, tol = 8) => Math.abs(a - b) <= tol;
  const check = (got, exp, label) => {
    if (exp === undefined) return true;
    const ok = near(got.r, exp.r) && near(got.g, exp.g);
    console.log(`   ${label}: got r=${got.r} g=${got.g}  expected r=${exp.r} g=${exp.g}  ${ok ? "OK" : "FAIL"}`);
    return ok;
  };
  let ok = out.w === expectW && out.h === expectH;
  console.log(`   size: got ${out.w}x${out.h}  expected ${expectW}x${expectH}  ${ok ? "OK" : "FAIL"}`);
  ok = check(out.tl, tl, "pixel(1,1)  ") && ok;
  ok = check(out.br, br, "ultimo px  ") && ok;
  return ok;
}

/** Scorre la preview nel viewport e misura il box di crop corrente. */
async function readyBox(page, box) {
  await page.locator("[data-editor-preview]").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const bb = await box.boundingBox();
  if (!bb) throw new Error("box non visibile");
  return bb;
}

/** Ritaglia → resize al 50% (maniglia se, presa a corner-4) → move al centro (+25%). */
async function cropCenterHalf(page) {
  await page.getByRole("button", { name: "Ritaglia" }).click();
  const box = page.locator("[data-editor-preview] .cursor-move");
  await box.waitFor();

  // resize: presa sulla maniglia se (centro = angolo box, margine -4px) → target = presa + 0.5*rect
  let bb = await readyBox(page, box);
  const grabX = bb.x + bb.width - 3;
  const grabY = bb.y + bb.height - 3;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + bb.width * 0.5, grabY + bb.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-editor-preview] .cursor-move");
    return el && parseFloat(el.style.width) < 90;
  });

  // move: presa al centro del box → target = centro + 0.5*bb (dx = 0.25 di rect)
  bb = await readyBox(page, box);
  const cx = bb.x + bb.width * 0.5;
  const cy = bb.y + bb.height * 0.5;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + bb.width * 0.5, cy + bb.height * 0.5, { steps: 12 });
  await page.mouse.up();
}

/** Ritaglia → resize al 50% da (0,0) (maniglia se). */
async function cropTopLeftHalf(page) {
  await page.getByRole("button", { name: "Ritaglia" }).click();
  const box = page.locator("[data-editor-preview] .cursor-move");
  await box.waitFor();
  const bb = await readyBox(page, box);
  const grabX = bb.x + bb.width - 3;
  const grabY = bb.y + bb.height - 3;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + bb.width * 0.5, grabY + bb.height * 0.5, { steps: 12 });
  await page.mouse.up();
}

async function save(page) {
  await page.getByRole("button", { name: "Salva modifiche" }).click();
  await page.waitForFunction(() => window.__saved !== undefined, null, { timeout: 10000 });
}

const browser = await chromium.launch();
const results = [];
let failed = 0;

// ── A) Orizzontale 800x600: crop centrale 50% (x:200,y:150, 400x300) ─────
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/test-editor?w=800&h=600`);
  await page.getByRole("button", { name: "Ritaglia" }).waitFor();
  await cropCenterHalf(page);
  await save(page);
  const ok = await verifySaved(page, {
    expectW: 400, expectH: 300,
    tl: { r: 50, g: 37 },   // sorgente (201,151) → x/4, y/4
    br: { r: 149, g: 112 }, // sorgente (598,448)
  });
  results.push(["A orizzontale 800x600 crop centrale", ok]);
  if (!ok) failed++;
  await page.close();
}

// ── B) Verticale 600x800: crop centrale 50% (x:150,y:200, 300x400) ────────
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/test-editor?w=600&h=800`);
  await page.getByRole("button", { name: "Ritaglia" }).waitFor();
  await cropCenterHalf(page);
  await save(page);
  const ok = await verifySaved(page, {
    expectW: 300, expectH: 400,
    tl: { r: 37, g: 50 },   // sorgente (151,201)
    br: { r: 112, g: 149 }, // sorgente (448,598)
  });
  results.push(["B verticale 600x800 crop centrale", ok]);
  if (!ok) failed++;
  await page.close();
}

// ── C) Preview ridimensionata 1600x1200 (export scale 0.75 → 1200x900) ────
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/test-editor?w=1600&h=1200`);
  await page.getByRole("button", { name: "Ritaglia" }).waitFor();
  await cropCenterHalf(page);
  await save(page);
  const ok = await verifySaved(page, {
    expectW: 600, expectH: 450,
    tl: { r: 0, g: 0 },     // sorgente (1.3,1.3)
    br: { r: 199, g: 149 }, // sorgente (797,597)
  });
  results.push(["C preview ridimensionata 1600x1200", ok]);
  if (!ok) failed++;
  await page.close();
}

// ── F) Rotazione 90° dx su 800x600 → 600x800, crop 50% in alto a sx ───────
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/test-editor?w=800&h=600`);
  await page.getByRole("button", { name: "Ritaglia" }).waitFor();
  await page.getByRole("button", { name: "Ruota dx" }).click();
  await cropTopLeftHalf(page);
  await save(page);
  // rot CW: T(x',y') = S(y', 599-x'); crop da (0,0) 300x400
  const ok = await verifySaved(page, {
    expectW: 300, expectH: 400,
    tl: { r: 0, g: 149 },   // T(1,1) = S(1,598)
    br: { r: 99, g: 75 },   // T(298,398) = S(398,301)
  });
  results.push(["F rotazione 90° dx + crop", ok]);
  if (!ok) failed++;
  await page.close();
}

// ── G) Riflessione orizzontale su 800x600, crop centrale 50% ──────────────
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/test-editor?w=800&h=600`);
  await page.getByRole("button", { name: "Ritaglia" }).waitFor();
  await page.getByRole("button", { name: "Rifletti ↔" }).click();
  await cropCenterHalf(page);
  await save(page);
  // flip H: T(x',y') = S(799-x',y'); crop (0.25,0.25,0.5,0.5) → 400x300
  const ok = await verifySaved(page, {
    expectW: 400, expectH: 300,
    tl: { r: 149, g: 37 },  // T(201,151) = S(598,151)
    br: { r: 50, g: 74 },   // T(398,298) = S(201,298)
  });
  results.push(["G riflessione orizzontale + crop", ok]);
  if (!ok) failed++;
  await page.close();
}

await browser.close();

console.log("\n=== RISULTATI ===");
for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
console.log(failed === 0 ? "\nTUTTI I TEST PASSANO" : `\n${failed} TEST FALLITI`);
process.exit(failed === 0 ? 0 : 1);
