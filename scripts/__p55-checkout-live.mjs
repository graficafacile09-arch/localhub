// P5.5 — CHECKOUT LIVE (produzione): rende la pagina e cattura i metodi
// realmente mostrati + il loro stato (selezionabile / non disponibile).
import { chromium } from "playwright";

const URLS = [
  // Panificio Rossi (prodotto attivo)
  { nome: "Panificio Rossi", url: "https://www.incitta.online/prodotto/orologio-da-polso-cesare-paciotti-4us/acquista/spedizione" },
  // Barone Gioielli
  { nome: "Barone Gioielli", url: "https://www.incitta.online/prodotto/orologio-da-polso-liu-jo-in-acciaio-con-quadrante-nero-e-dettagli-brillanti/acquista/spedizione" },
  // Bar dei Capoccioni
  { nome: "Bar dei Capoccioni", url: "https://www.incitta.online/prodotto/logo-a-b-b-a-unionturismo/acquista/spedizione" },
  // Terre del Pollino – DEMO
  { nome: "Terre del Pollino – DEMO", url: "https://www.incitta.online/prodotto/caffe-in-grani-250-g/acquista/spedizione" },
  // Bottega del Pollino – DEMO
  { nome: "Bottega del Pollino – DEMO", url: "https://www.incitta.online/prodotto/latte-fresco-polenghi-1l/acquista/spedizione" },
  // Sapori di Castrovillari – DEMO
  { nome: "Sapori di Castrovillari – DEMO", url: "https://www.incitta.online/prodotto/nutella-400-g/acquista/spedizione" },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" });
// Modalità ospite esplicita: stesso cookie httpOnly lh_guest=1 usato dal
// flusso reale "ACQUISTA SENZA ACCOUNT" (POST /api/auth/guest).
await ctx.addCookies([{ name: "lh_guest", value: "1", domain: ".incitta.online", path: "/", httpOnly: true, secure: true }]);

for (const t of URLS) {
  const page = await ctx.newPage();
  try {
    await page.goto(t.url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(1500);
    // Blocca la scelta: leggi i radio "pagamento" e il testo della sezione.
    const dati = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('input[name="pagamento"]')).map((r) => {
        const label = r.closest("label");
        return {
          value: r.value,
          disabled: r.disabled,
          testo: label ? label.textContent.replace(/\s+/g, " ").trim().slice(0, 120) : "",
        };
      });
      // Testo di riepilogo "Metodi disponibili per questo negozio"
      const riepilogo = Array.from(document.querySelectorAll("p")).map((p) => p.textContent ? p.textContent.trim() : "").find((t) => t.startsWith("Metodi disponibili"));
      const titolo = document.title;
      const errorePage = (document.body.textContent || "").slice(0, 300).includes("404") ? "404?" : "ok";
      return { radios: labels, riepilogo: riepilogo ?? null, titolo, errorePage, url: location.href };
    });
    console.log("=".repeat(60));
    console.log(t.nome, "→", dati.url);
    console.log("titolo:", dati.titolo);
    console.log("errorePage:", dati.errorePage);
    console.log("riepilogo:", dati.riepilogo);
    for (const r of dati.radios) console.log("  radio:", r.value, "| disabled:", r.disabled, "|", r.testo);
  } catch (e) {
    console.log("=".repeat(60));
    console.log(t.nome, "→ ERRORE:", String(e).slice(0, 200));
  } finally {
    await page.close();
  }
}

await browser.close();