import { expect, test } from "@playwright/test";

import {
  analizzaComprensionePino,
  estraiEsclusioniPino,
  fallbackPlan,
  pianoLocaleIntelligente,
  rimuoviClausoleEsclusionePino,
} from "../lib/assistente/semantica";
import { analizzaIntentoPino } from "../lib/assistente/intent";
import { attributiProdottiPino, parametriFallbackPiano } from "../lib/assistente/index";

// ─── S4.6: esclusioni negative ────────────────────────────────────────────
//
// «non in tessuto» deve escludere IL MATERIALE, non la preposizione. Tra la
// negazione e il termine negato possono stare preposizioni, articoli e
// costrutti inglesi («not made of plastic»). Connettori e articoli non sono mai
// esclusioni autonome, e una richiesta positiva non diventa una negazione.

const PREPOSIZIONI = [
  "in",
  "di",
  "del",
  "della",
  "dei",
  "delle",
  "degli",
  "dello",
  "da",
  "con",
  "a",
  "al",
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "un",
  "uno",
  "una",
  "the",
  "an",
  "of",
  "from",
  "with",
  "made",
  "out",
];

test.describe("S4.6 — estrazione del termine negato", () => {
  test("«non in»: la preposizione non è l'esclusione", () => {
    expect(estraiEsclusioniPino("borsa nera, non in tessuto")).toEqual(["tessuto"]);
    expect(estraiEsclusioniPino("borsa non in pelle")).toEqual(["pelle"]);
  });

  test("«non di»: esclusione il sostantivo, non la preposizione", () => {
    expect(estraiEsclusioniPino("borsa non di plastica")).toEqual(["plastica"]);
  });

  test("«senza» continua a funzionare", () => {
    expect(estraiEsclusioniPino("borsa senza pelle")).toEqual(["pelle"]);
    expect(estraiEsclusioniPino("birra senza glutine")).toEqual(["glutine"]);
  });

  test("inglese: «without» e «not made of»", () => {
    expect(estraiEsclusioniPino("bag without leather")).toEqual(["leather"]);
    expect(estraiEsclusioniPino("not made of plastic")).toEqual(["plastic"]);
    expect(estraiEsclusioniPino("shoes not in leather")).toEqual(["leather"]);
  });

  test("nessuna preposizione tra le esclusioni", () => {
    const frasi = [
      "borsa nera, non in tessuto",
      "borsa non di plastica",
      "borsa senza pelle",
      "bag without leather",
      "not made of plastic",
      "non in pelle",
    ];
    for (const frase of frasi) {
      const esclusioni = estraiEsclusioniPino(frase);
      expect(esclusioni.length).toBeGreaterThan(0);
      for (const esclusione of esclusioni) {
        expect(PREPOSIZIONI).not.toContain(esclusione);
      }
    }
  });

  test("una richiesta positiva non diventa un'esclusione", () => {
    expect(estraiEsclusioniPino("borsa in pelle")).toEqual([]);
    expect(estraiEsclusioniPino("borsa nera")).toEqual([]);
    expect(estraiEsclusioniPino("bag in leather")).toEqual([]);
  });

  test("più esclusioni nella stessa frase, senza duplicati", () => {
    expect(estraiEsclusioniPino("borsa non in pelle e senza tessuto")).toEqual([
      "pelle",
      "tessuto",
    ]);
    expect(estraiEsclusioniPino("non in pelle, non in pelle")).toEqual(["pelle"]);
  });

  test("le esclusioni già funzionanti restano invariate", () => {
    expect(estraiEsclusioniPino("scarpe non nere")).toEqual(["nere"]);
    expect(estraiEsclusioniPino("prodotto non usato")).toEqual(["usato"]);
    expect(estraiEsclusioniPino("birra non alcolica")).toEqual(["alcolica"]);
  });

  test("la clausola viene rimossa dalla query senza lasciare connettori", () => {
    expect(rimuoviClausoleEsclusionePino("borsa nera, non in tessuto").trim()).toBe(
      "borsa nera,"
    );
    expect(rimuoviClausoleEsclusionePino("bag not made of plastic").trim()).toBe("bag");
  });
});

test.describe("S4.6 — piano locale", () => {
  test("«borsa nera, non in tessuto»: tessuto escluso, colore positivo conservato", () => {
    const frase = "Cerco una borsa nera, non in tessuto";
    const piano = pianoLocaleIntelligente(frase, analizzaIntentoPino(frase));

    expect(piano).not.toBeNull();
    expect(piano?.exclusions).toEqual(["tessuto"]);
    expect(piano?.query).toContain("borsa");
    expect(piano?.query).toContain("nera");
    expect(piano?.query).not.toMatch(/\bnon\b|\btessuto\b/);
  });

  test("«non di plastica» e «senza pelle»: esclusione giusta e query pulita", () => {
    const plastica = "Cerco una borsa non di plastica";
    const pianoPlastica = pianoLocaleIntelligente(plastica, analizzaIntentoPino(plastica));
    expect(pianoPlastica?.exclusions).toEqual(["plastica"]);
    expect(pianoPlastica?.query).toContain("borsa");
    expect(pianoPlastica?.query).not.toMatch(/\bplastica\b/);

    const pelle = "Cerco una borsa senza pelle";
    const pianoPelle = pianoLocaleIntelligente(pelle, analizzaIntentoPino(pelle));
    expect(pianoPelle?.exclusions).toEqual(["pelle"]);
    expect(pianoPelle?.query).toContain("borsa");
    expect(pianoPelle?.query).not.toMatch(/\bpelle\b/);
  });

  test("richiesta positiva senza esclusioni", () => {
    const frase = "Cerco una borsa in pelle";
    const piano = pianoLocaleIntelligente(frase, analizzaIntentoPino(frase));

    expect(piano?.exclusions).toEqual([]);
    expect(piano?.query).toContain("pelle");
  });

  test("inglese: «without leather» non lascia la clausola nella query", () => {
    const frase = "I need a bag without leather";
    const piano = pianoLocaleIntelligente(frase, analizzaIntentoPino(frase));

    expect(piano?.exclusions).toEqual(["leather"]);
    expect(piano?.query).not.toMatch(/\bwithout\b|\bleather\b/);
  });
});

test.describe("S4.6 — fallbackPlan", () => {
  test("stessa estrazione del piano locale e query senza connettori", () => {
    const frase = "borsa nera, non in tessuto";
    const piano = fallbackPlan(frase, analizzaIntentoPino(frase));

    expect(piano.exclusions).toEqual(["tessuto"]);
    expect(piano.query).not.toMatch(/\bnon\b|\bin\b|\btessuto\b/);
    expect(piano.query).toContain("borsa");
  });

  test("inglese: «not made of plastic» esclude plastic e non made/of", () => {
    const frase = "bag not made of plastic";
    const piano = fallbackPlan(frase, analizzaIntentoPino(frase));

    expect(piano.exclusions).toEqual(["plastic"]);
    expect(piano.exclusions).not.toContain("made");
    expect(piano.exclusions).not.toContain("of");
    expect(piano.query).not.toMatch(/\bplastic\b/);
  });

  test("«senza glutine» resta un'esclusione e non entra nella query", () => {
    const frase = "birra senza glutine";
    const piano = fallbackPlan(frase, analizzaIntentoPino(frase));

    expect(piano.exclusions).toEqual(["glutine"]);
    expect(piano.query).not.toMatch(/\bglutine\b/);
  });
});

test.describe("S4.6 — integrazione con i filtri S4.3", () => {
  test("«borsa nera, non in tessuto»: colore richiesto, tessuto escluso, nessun «in»", () => {
    const frase = "Cerco una borsa nera, non in tessuto";
    const u = analizzaComprensionePino(frase);

    expect(u.esclusioni).toEqual(["tessuto"]);
    expect(u.attributi.colori).toEqual(["nero"]);
    expect(u.esclusioni).not.toContain("in");

    const attributi = attributiProdottiPino(u, frase);
    // Il colore resta un requisito positivo; il materiale negato non diventa
    // un materiale richiesto.
    expect(attributi).toEqual({ colori: ["nero"] });

    const vincoli = parametriFallbackPiano(undefined, u, frase);
    expect(vincoli.esclusioni).toEqual(["tessuto"]);
    expect(vincoli.colori).toEqual(["nero"]);
    expect(vincoli.materiali).toBeUndefined();
  });

  test("«borsa senza pelle»: pelle è esclusa, non richiesta", () => {
    const frase = "Cerco una borsa senza pelle";
    const u = analizzaComprensionePino(frase);

    expect(u.esclusioni).toEqual(["pelle"]);
    // S6.1/P1: un materiale negato non è anche un requisito positivo: resta
    // solo nell'esclusione, come già dichiara il titolo di questo caso.
    expect(u.attributi.materiali).toEqual([]);
    expect(attributiProdottiPino(u, frase)).toBeNull();
    expect(parametriFallbackPiano(undefined, u, frase).esclusioni).toEqual(["pelle"]);
  });

  test("«non di plastica»: esclusione propagata ai parametri dei tool", () => {
    const frase = "Cerco una borsa non di plastica";
    const u = analizzaComprensionePino(frase);

    expect(u.esclusioni).toEqual(["plastica"]);
    expect(parametriFallbackPiano(undefined, u, frase).esclusioni).toEqual(["plastica"]);
  });
});
