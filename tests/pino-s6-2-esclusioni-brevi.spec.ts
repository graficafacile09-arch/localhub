import { expect, test } from "@playwright/test";

import {
  analizzaComprensionePino,
  fallbackPlan,
  pianoLocaleIntelligente,
} from "../lib/assistente/semantica";
import { analizzaIntentoPino } from "../lib/assistente/intent";
import {
  applicaAttributiProdottiPino,
  attributiProdottiPino,
  parametriFallbackPiano,
  pianoProdottoEsclusionePino,
  richiestaGuidaAttrazioniPino,
} from "../lib/assistente/index";
import { rilevaRichiestaServizioPino, validaToolParams } from "../lib/assistente/tools";

// ─── S6.2: negazioni brevi senza piano deterministico ────────────────────
//
// «borsa without leather» non ha formule introduttive: il planner locale
// restituisce `null`, ma l'esclusione è già determinabile lessicalmente. Deve
// arrivare ai tool e la richiesta deve seguire il percorso prodotti ordinario,
// senza LLM aggiuntivo, senza searchAll e senza inventare un servizio.

/** Il piano locale non esiste per queste richieste: il difetto di partenza. */
const SENZA_PIANO_LOCALE: Array<{ frase: string; esclusioni: string[]; canoniche: string[] }> = [
  { frase: "borsa without leather", esclusioni: ["leather"], canoniche: ["pelle"] },
  { frase: "shoes not made of plastic", esclusioni: ["plastic"], canoniche: ["plastica"] },
  { frase: "borsa nera non in tessuto", esclusioni: ["tessuto"], canoniche: ["tessuto"] },
  { frase: "black bag without leather", esclusioni: ["leather"], canoniche: ["pelle"] },
  { frase: "not black shoes", esclusioni: ["black"], canoniche: ["nero"] },
  { frase: "borsa senza plastica", esclusioni: ["plastica"], canoniche: ["plastica"] },
];

test.describe("S6.2 — esclusioni indipendenti dal piano", () => {
  for (const caso of SENZA_PIANO_LOCALE) {
    test(`«${caso.frase}»: piano assente, esclusione conservata`, () => {
      const analisi = analizzaIntentoPino(caso.frase);
      expect(pianoLocaleIntelligente(caso.frase, analisi)).toBeNull();

      const u = analizzaComprensionePino(caso.frase);
      expect(u.esclusioni).toEqual(caso.esclusioni);

      // La comprensione propaga l'esclusione anche al fallback dei tool.
      expect(parametriFallbackPiano(undefined, u, caso.frase).esclusioni).toEqual(caso.esclusioni);

      // Il confine dei tool la rende canonica prima della ricerca.
      expect(
        validaToolParams("searchProducts", { esclusioni: u.esclusioni }).params.esclusioni
      ).toEqual(caso.canoniche);
    });
  }

  test("quando il piano c'è, le sue esclusioni restano la fonte (nessun duplicato)", () => {
    const u = analizzaComprensionePino("scarpe non nere");
    expect(u.esclusioni).toEqual(["nere"]);
    expect(u.esclusioni).not.toContain("nero");
  });
});

// ─── Percorso prodotti deterministico ─────────────────────────────────────

const CASI: Array<{
  frase: string;
  query: string;
  esclusioni: string[];
  colori: string[];
  materiali: string[];
}> = [
  {
    frase: "borsa without leather",
    query: "borsa",
    esclusioni: ["pelle"],
    colori: [],
    materiali: [],
  },
  {
    frase: "shoes not made of plastic",
    query: "scarpe",
    esclusioni: ["plastica"],
    colori: [],
    materiali: [],
  },
  {
    frase: "scarpe non nere",
    query: "scarpe",
    esclusioni: ["nero"],
    colori: [],
    materiali: [],
  },
  {
    frase: "borsa nera non in tessuto",
    query: "borsa nera",
    esclusioni: ["tessuto"],
    colori: ["nero"],
    materiali: [],
  },
  {
    frase: "black bag without leather",
    query: "black borsa",
    esclusioni: ["pelle"],
    colori: ["nero"],
    materiali: [],
  },
  {
    frase: "scarpe non rosse ma nere",
    query: "scarpe nere",
    esclusioni: ["rosso"],
    colori: ["nero"],
    materiali: [],
  },
  {
    frase: "not black shoes",
    query: "scarpe",
    esclusioni: ["nero"],
    colori: [],
    materiali: [],
  },
  {
    frase: "borsa senza plastica",
    query: "borsa",
    esclusioni: ["plastica"],
    colori: [],
    materiali: [],
  },
];

test.describe("S6.2 — richiesta breve di prodotto con esclusione", () => {
  for (const caso of CASI) {
    test(`«${caso.frase}»: una sola ricerca prodotti con esclusione canonica`, () => {
      const analisi = analizzaIntentoPino(caso.frase);
      expect(analisi.confidence).toBe("bassa");

      const invocazioni = pianoProdottoEsclusionePino(analisi, undefined, caso.frase);
      expect(invocazioni).not.toBeNull();
      expect(invocazioni).toHaveLength(1);
      expect(invocazioni?.[0].tool).toBe("searchProducts");

      const params = validaToolParams("searchProducts", invocazioni?.[0].params).params;
      expect(params.query).toBe(caso.query);
      expect(params.esclusioni).toEqual(caso.esclusioni);

      const u = analizzaComprensionePino(caso.frase);
      const attributi = attributiProdottiPino(u, caso.frase);
      expect(attributi?.colori ?? []).toEqual(caso.colori);
      expect(attributi?.materiali ?? []).toEqual(caso.materiali);
      // Nessun attributo richiesto è anche escluso.
      for (const valore of [...(attributi?.colori ?? []), ...(attributi?.materiali ?? [])]) {
        expect(caso.esclusioni).not.toContain(valore);
      }
    });
  }

  test("il piano semantico già disponibile viene riusato senza duplicare query", () => {
    const frase = "borsa without leather";
    const analisi = analizzaIntentoPino(frase);
    const semantica = fallbackPlan(frase, analisi);

    expect(pianoProdottoEsclusionePino(analisi, semantica, frase)).toEqual(
      pianoProdottoEsclusionePino(analisi, undefined, frase)
    );
  });
});

test.describe("S6.2 — attributi positivi ed esclusioni non confliggono", () => {
  test("«black bag without leather»: nero positivo, pelle esclusa", () => {
    const frase = "black bag without leather";
    const u = analizzaComprensionePino(frase);
    const attributi = attributiProdottiPino(u, frase);

    expect(attributi).toEqual({ colori: ["nero"] });
    expect(u.esclusioni).toEqual(["leather"]);

    const invocazioni = applicaAttributiProdottiPino(
      pianoProdottoEsclusionePino(analizzaIntentoPino(frase), undefined, frase) ?? [],
      u,
      frase
    );
    expect(invocazioni[0].params).toMatchObject({
      query: "black borsa",
      colori: ["nero"],
      esclusioni: ["pelle"],
    });
    expect(invocazioni[0].params?.materiali).toBeUndefined();
  });

  test("«borsa nera non in tessuto»: nero positivo, tessuto escluso", () => {
    const frase = "borsa nera non in tessuto";
    const u = analizzaComprensionePino(frase);

    expect(attributiProdottiPino(u, frase)).toEqual({ colori: ["nero"] });
    expect(u.esclusioni).toEqual(["tessuto"]);
  });

  test("«scarpe non rosse ma nere»: nero positivo, rosso escluso", () => {
    const frase = "scarpe non rosse ma nere";
    const u = analizzaComprensionePino(frase);

    expect(attributiProdottiPino(u, frase)).toEqual({ colori: ["nero"] });
    expect(validaToolParams("searchProducts", { esclusioni: u.esclusioni }).params.esclusioni).toEqual([
      "rosso",
    ]);
  });
});

test.describe("S6.2 — nessuna deviazione dalle altre superfici", () => {
  test("«I speak English» resta una preferenza linguistica", () => {
    const frase = "I speak English";
    const u = analizzaComprensionePino(frase);

    expect(u.languagePreferenceOnly).toBe(true);
    expect(u.esclusioni).toEqual([]);
    expect(pianoProdottoEsclusionePino(analizzaIntentoPino(frase), undefined, frase)).toBeNull();
  });

  test("«I speak English and I'm looking for pasta» resta una ricerca prodotti", () => {
    const frase = "I speak English and I'm looking for pasta";
    const u = analizzaComprensionePino(frase);

    expect(u.languagePreferenceOnly).toBe(false);
    expect(u.soggetto).toBe("pasta");
    expect(u.esclusioni).toEqual([]);
    expect(pianoProdottoEsclusionePino(analizzaIntentoPino(frase), undefined, frase)).toBeNull();
  });

  test("una richiesta breve di servizio non diventa ricerca prodotti", () => {
    const frase = "mi serve qualcuno per i capelli";
    expect(rilevaRichiestaServizioPino(frase)?.servizio).toBe("capelli");
    expect(pianoProdottoEsclusionePino(analizzaIntentoPino(frase), undefined, frase)).toBeNull();

    const barbiere = "Cerco un barbiere per taglio e barba";
    expect(rilevaRichiestaServizioPino(barbiere)).toEqual({
      servizio: "taglio barba",
      attivita: "barbiere",
    });
    expect(pianoProdottoEsclusionePino(analizzaIntentoPino(barbiere), undefined, barbiere)).toBeNull();
  });

  test("una richiesta di Attrazioni con esclusione resta nella guida", () => {
    const frase = "museo non egizio";
    expect(richiestaGuidaAttrazioniPino(frase)).toBe(true);
    expect(pianoProdottoEsclusionePino(analizzaIntentoPino(frase), undefined, frase)).toBeNull();
  });

  test("senza esclusione il percorso ordinario non cambia", () => {
    expect(pianoProdottoEsclusionePino(analizzaIntentoPino("borsa"), undefined, "borsa")).toBeNull();
    expect(pianoProdottoEsclusionePino(analizzaIntentoPino("I need a haircut"), undefined, "I need a haircut")).toBeNull();
  });
});
