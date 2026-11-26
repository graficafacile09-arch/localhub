import { expect, test } from "@playwright/test";

import { chatConAssistente } from "../lib/assistente/index";
import { analizzaIntentoPino } from "../lib/assistente/intent";
import { pianoLocaleIntelligente } from "../lib/assistente/semantica";
import { richiestaConoscenzaPino } from "../lib/assistente/routing-policy";
import { cercaConoscenzaLocale, cercaConoscenzaSito } from "../lib/conoscenza/cerca";

// RAG locale: le domande discorsive leggono i testi del sito e rispondono in
// prosa, senza schede di attività commerciali. Le richieste di acquisto
// restano invece sul catalogo.
// Nessuna chiamata di rete: senza GROQ_API_KEY la risposta usa il testo
// deterministico, che deve comunque contenere gli estratti reali.

const u = (content: string) => ({ role: "user" as const, content });

test.describe("Ricerca unificata sui contenuti del sito", () => {
  test("«Cos'è la Sila?» trova il racconto completo del Parco", async () => {
    const fonti = await cercaConoscenzaSito("Cos'è la Sila?", 6);
    expect(fonti.length).toBeGreaterThan(0);

    const prima = fonti[0];
    expect(prima.url).toBe("/territorio/sila");
    expect(prima.estratto).toContain("73.695 ettari");
    expect(prima.estratto).toMatch(/pino laricio/i);
    // Estratto ricco, non un titolo di tre parole.
    expect(prima.estratto.length).toBeGreaterThan(700);
  });

  test("«Cos'è la Sila?» non si porta dietro ogni testo che nomina la Sila", async () => {
    // Corpus locale puro: il ranking dei testi del sito non deve dipendere
    // dall'archivio `pino_conoscenza`, che in produzione aggiunge altre voci.
    const locali = cercaConoscenzaLocale("Cos'è la Sila?", 6);
    // La Piana di Crotone e le filiere citano la Sila di passaggio: non sono
    // la risposta alla domanda.
    expect(locali.map((f) => f.url)).toEqual(["/territorio/sila"]);

    // La ricerca unificata conserva quel testo come prima fonte, anche quando
    // l'archivio o i contenuti dinamici aggiungono voci in coda.
    const fonti = await cercaConoscenzaSito("Cos'è la Sila?", 6);
    expect(fonti[0].url).toBe("/territorio/sila");
  });

  test("«Parlami di filiera» parte dall'indice e porta i testi delle filiere", async () => {
    const fonti = await cercaConoscenzaSito("Parlami di filiera", 6);
    expect(fonti[0].chiave).toBe("filiera:indice");
    expect(fonti[0].url).toBe("/filiere");
    expect(fonti[0].estratto).toContain("dieci filiere");

    const testi = fonti.map((f) => f.estratto).join("\n");
    expect(testi).toMatch(/olivicol/i);
    expect(testi.length).toBeGreaterThan(1000);
    for (const fonte of fonti) {
      expect(fonte.url).toMatch(/^\//);
      expect(fonte.estratto.length).toBeGreaterThan(100);
    }
  });

  test("«Parlami di filiera» presenta le filiere della Regione Calabria, non di Radici Calabria", () => {
    const testi = cercaConoscenzaLocale("Parlami di filiera", 6)
      .map((f) => f.estratto)
      .join("\n");
    expect(testi).toContain("Regione Calabria");
    expect(testi).not.toMatch(/filiere di Radici Calabria/i);
  });

  test("«Quali sono i prodotti DOP del Pollino?» include i prodotti certificati dei comuni del Parco", () => {
    const fonti = cercaConoscenzaLocale("Quali sono i prodotti DOP del Pollino?", 8);
    const prodotti = fonti.find((f) => f.chiave === "territorio:pollino");
    expect(prodotti).toBeDefined();
    // Fagioli Bianchi di Rotonda DOP e Melanzana Rossa di Rotonda DOP.
    expect(prodotti!.estratto).toMatch(/fagioli-bianchi/i);
    expect(prodotti!.estratto).toMatch(/melanzana/i);
    expect(prodotti!.estratto).toMatch(/DOP/);
  });
});

test.describe("Modalità informativa vs attività", () => {
  for (const domanda of [
    "Cos'è la Sila?",
    "Che cos'è il Pollino?",
    "Parlami di filiera",
    "Spiegami i prodotti DOP",
    "Come funziona il sito?",
  ]) {
    test(`«${domanda}» è informativa`, () => {
      expect(richiestaConoscenzaPino(domanda)).toBe(true);
    });
  }

  for (const domanda of [
    "Dove comprare l'olio?",
    "Mostrami i negozi di Castrovillari",
    "Produttori e eccellenze del territorio",
    "Quali attività vendono la soppressata?",
  ]) {
    test(`«${domanda}» resta sulle attività`, () => {
      expect(richiestaConoscenzaPino(domanda)).toBe(false);
    });
  }

  test("il piano locale non trasforma le domande informative in ricerche prodotto", () => {
    for (const domanda of ["Cos'è la Sila?", "Parlami di filiera"]) {
      const piano = pianoLocaleIntelligente(domanda, analizzaIntentoPino(domanda));
      expect(piano?.surface, domanda).not.toBe("products");
    }
  });
});

test.describe("Risposta discorsiva di Pino", () => {
  test("«Cos'è la Sila?» risponde con il testo del Parco, senza schede", async () => {
    const r = await chatConAssistente([u("Cos'è la Sila?")]);

    expect(r.risposta).toMatch(/Parco Nazionale della Sila/);
    expect(r.risposta).toMatch(/73\.695|pino laricio/i);
    expect(r.risposta).toContain("/territorio/sila");
    expect(r.negozi).toEqual([]);
    expect(r.prodotti).toEqual([]);
    expect(r.risposta).not.toMatch(/Non trovo risultati|momentaneamente in difficoltà/);
  });

  test("«Parlami di filiera» spiega le filiere senza elencare attività", async () => {
    const r = await chatConAssistente([u("Parlami di filiera")]);

    expect(r.risposta).toMatch(/filier/i);
    expect(r.risposta).toMatch(/olivicol/i);
    expect(r.risposta).toContain("/filiere");
    expect(r.negozi).toEqual([]);
    expect(r.prodotti).toEqual([]);
    expect(r.risposta).not.toMatch(/Non trovo risultati|attività commerciali trovate/);
  });

  test("«Dove comprare l'olio?» non passa alla modalità discorsiva", async () => {
    expect(richiestaConoscenzaPino("Dove comprare l'olio?")).toBe(false);

    const r = await chatConAssistente([u("Dove comprare l'olio?")]);
    expect(r.risposta).not.toMatch(/cosa raccontano i contenuti del sito/i);
    expect(r.risposta).not.toContain("/territorio/sila");
  });
});
