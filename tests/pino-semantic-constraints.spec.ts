import { expect, test } from "@playwright/test";

import {
  fallbackPlan,
  estraiPrezzoEsplicitoPino,
  interpretaRichiestaPino,
  limitiVincolantiPino,
  pianoLocaleIntelligente,
  type PinoSemanticPlan,
} from "../lib/assistente/semantica";
import { analizzaIntentoPino } from "../lib/assistente/intent";
import type { PinoMemoriaVoce } from "../lib/assistente/memoria";

const NESSUNA_MEMORIA: PinoMemoriaVoce[] = [];

async function piano(query: string) {
  return interpretaRichiestaPino(
    query,
    [{ role: "user", content: query }],
    analizzaIntentoPino(query),
    NESSUNA_MEMORIA
  );
}

test.describe("Pino — separazione query e vincoli semantici", () => {
  test("1) il prezzo diventa filtro e non finisce nella query prodotto", async () => {
    const p = await piano("scarpe da uomo eleganti sotto 100");
    expect(p.surface).toBe("products");
    expect(p.maxPrice).toBe(100);
    expect(p.query).toBe("scarpe da uomo eleganti");
    expect(p.query).not.toMatch(/sotto|100/);
  });

  test("2) il range di prezzo viene separato dalla query", async () => {
    const p = await piano("scarpe tra 50 e 120 euro");
    expect(p.minPrice).toBe(50);
    expect(p.maxPrice).toBe(120);
    expect(p.query).toBe("scarpe");
  });

  test("3) una negazione generica diventa esclusione", async () => {
    const p = await piano("scarpe da uomo non nere");
    expect(p.query).toBe("scarpe da uomo");
    expect(p.exclusions).toContain("nere");
  });

  test("4) 'senza' mantiene il soggetto e separa la caratteristica esclusa", async () => {
    const p = await piano("pizza senza glutine");
    expect(p.surface).toBe("products");
    expect(p.query).toBe("pizza");
    expect(p.exclusions).toContain("glutine");
  });

  test("5) 'analcolica' resta una caratteristica positiva e non viene eliminata", async () => {
    const p = await piano("birra analcolica");
    expect(p.query).toContain("birra");
    expect(p.query).toContain("analcolica");
    expect(p.exclusions).toContain("alcolica");
  });

  test("6) apertura ora viene estratta e non entra nel testo prodotto", async () => {
    const p = await piano("pizzeria aperta ora");
    expect(p.surface).toBe("stores");
    expect(p.openNow).toBe(true);
    expect(p.query).toBe("pizzeria");
  });

  test("7) la città riconosciuta diventa vincolo separato", async () => {
    const p = await piano("scarpe a Castrovillari");
    expect(p.city).toBe("castrovillari");
    expect(p.query).toBe("scarpe");
  });

  test("8) gli attributi positivi restano nella query", async () => {
    const p = await piano("scarpe da uomo eleganti");
    expect(p.query).toBe("scarpe da uomo eleganti");
    expect(p.query).not.toMatch(/cerco|voglio|sotto|massimo/);
  });
});

// ─── Prezzo esplicito: tetto, soglia, intervalli ───────────────────────────
// [frase, soggetto atteso, minPrice, maxPrice]
const CASI_PREZZO: Array<[string, string, number | null, number | null]> = [
  ["Mi trovi cuffie non oltre 50 euro", "cuffie", null, 50],
  ["Cerco cuffie oltre 50 euro", "cuffie", 50, null],
  ["Vorrei una giacca inferiore a 50 euro", "giacca", null, 50],
  ["Vorrei una giacca superiore a 50 euro", "giacca", 50, null],
  ["Vorrei scarpe tra 50 e 120 euro", "scarpe", 50, 120],
  ["Vorrei scarpe tra 120 e 50 euro", "scarpe", 50, 120],
  ["Cerco olio entro 15 euro", "olio", null, 15],
  ["Cerco cuffie almeno 50 euro", "cuffie", 50, null],
  ["Cerco pasta sotto 5 euro", "pasta", null, 5],
  ["I'm looking for pasta between 5 and 15 euros", "pasta", 5, 15],
  ["I'm looking for pasta above 10 euros", "pasta", 10, null],
];

const RESIDUI_VINCOLO =
  /(?:\bnon\b|\boltre\b|\bentro\b|\balmeno\b|\binferiore\b|\bsuperiore\b|\bsotto\b|\bsopra\b|\btra\b|\bmassimo\b|\bminimo\b|\beuro\b|\bbetween\b|\babove\b|\bunder\b|\bover\b|\band\b|\d)/i;

test.describe("Pino — prezzo esplicito nel piano locale e nel fallback", () => {
  for (const [frase, soggetto, minPrice, maxPrice] of CASI_PREZZO) {
    test(`${frase} → min ${minPrice} / max ${maxPrice}`, () => {
      const analisi = analizzaIntentoPino(frase);
      const locale = pianoLocaleIntelligente(frase, analisi);
      expect(locale).not.toBeNull();
      expect(locale!.minPrice).toBe(minPrice);
      expect(locale!.maxPrice).toBe(maxPrice);
      expect(locale!.query).toContain(soggetto);
      expect(locale!.query).not.toMatch(RESIDUI_VINCOLO);

      const fb = fallbackPlan(frase, analisi);
      expect(fb.minPrice).toBe(minPrice);
      expect(fb.maxPrice).toBe(maxPrice);
      expect(fb.query).toContain(soggetto);
      expect(fb.query).not.toMatch(RESIDUI_VINCOLO);
    });
  }

  test("le clausole inglesi non lasciano residui nella query prodotto", () => {
    for (const frase of [
      "I'm looking for pasta between 5 and 15 euros",
      "I'm looking for pasta above 10 euros",
    ]) {
      const analisi = analizzaIntentoPino(frase);
      expect(pianoLocaleIntelligente(frase, analisi)?.query, frase).toBe("pasta");
      expect(fallbackPlan(frase, analisi).query, frase).toBe("pasta");
    }
  });

  test("importi generici senza parola chiave: sempre tetto, mai soglia", () => {
    for (const frase of ["Cerco cuffie 50 euro", "Cerco cuffie €50", "Cerco cuffie con 50 euro"]) {
      const esito = estraiPrezzoEsplicitoPino(frase);
      expect(esito, frase).toEqual({ minPrice: null, maxPrice: 50 });
    }
  });

  test("nessun prezzo espresso: nessun limite inventato", () => {
    for (const frase of ["Cerco cuffie", "Vorrei un regalo per mia moglie", "Cerco pasta senza glutine"]) {
      expect(estraiPrezzoEsplicitoPino(frase), frase).toEqual({ minPrice: null, maxPrice: null });
      const locale = pianoLocaleIntelligente(frase, analizzaIntentoPino(frase));
      expect(locale?.minPrice ?? null, frase).toBeNull();
      expect(locale?.maxPrice ?? null, frase).toBeNull();
    }
  });

  test("zero è un budget esplicito valido, non un budget assente", () => {
    const frase = "Cerco pasta entro 0 euro";
    expect(estraiPrezzoEsplicitoPino(frase)).toEqual({ minPrice: null, maxPrice: 0 });

    const locale = pianoLocaleIntelligente(frase, analizzaIntentoPino(frase));
    expect(locale?.maxPrice).toBe(0);
    expect(locale?.query).toBe("pasta");
    expect(limitiVincolantiPino(locale, null)).toEqual({ minPrice: null, maxPrice: 0 });

    const fb = fallbackPlan(frase, analizzaIntentoPino(frase));
    expect(fb.maxPrice).toBe(0);
    expect(fb.query).toBe("pasta");
  });
});
