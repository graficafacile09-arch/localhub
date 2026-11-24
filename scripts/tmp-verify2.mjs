import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome" });
for (const [name, w, h, dpr] of [["desk", 1500, 950, 1], ["mob", 390, 844, 2]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await p.goto("https://radicicalabria.vercel.app/", { waitUntil: "networkidle", timeout: 60000 });
  await p.addStyleTag({ content: "[class*='cookie' i], [id*='cookie' i] { display:none !important }" }).catch(() => {});
  await p.waitForTimeout(700);
  const s = await p.evaluate(() => {
    const sec = document.querySelector("section.incitta-home-hero");
    const imgs = [...sec.querySelectorAll("img")].filter((i) => (i.currentSrc || "").includes("loghi"));
    const lg = document.querySelector('header a[aria-label^="Radici Calabria"] img');
    const lr = lg.getBoundingClientRect();
    const row = [...sec.querySelectorAll("div")].find((d) => d.querySelectorAll(":scope > span > img").length === 7);
    const rr = row ? row.getBoundingClientRect() : null;
    return {
      marchi: imgs.length,
      caricati: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      altezzaLoghi: [...new Set(imgs.map((i) => Math.round(i.getBoundingClientRect().height)))],
      logoWidth: Math.round(lr.width),
      riga: rr ? { t: Math.round(rr.top), l: Math.round(rr.left), w: Math.round(rr.width) } : null,
    };
  });
  console.log(name, JSON.stringify(s));
  await (await p.$("section.incitta-home-hero")).screenshot({ path: `preview-restyle/prod2-hero-${name}.jpg`, type: "jpeg", quality: 92 });
  await p.close();
}
await b.close();
