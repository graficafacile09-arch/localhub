import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  analizzaComprensionePino,
  costruisciStatoConversazionale,
  fondiVincoliPino,
  limitiVincolantiPino,
  pianoLocaleIntelligente,
  type PinoSemanticPlan,
} from "../lib/assistente/semantica";
import { analizzaIntentoPino } from "../lib/assistente/intent";
import { rispostaPreferenzaLinguaPino } from "../lib/assistente/greetings";
import {
  applicaBudgetVincolantePino,
  filtraProdottiRecuperoPino,
  invocazioniRegaloPino,
  parametriFallbackPiano,
  parametriRecuperoPino,
} from "../lib/assistente/index";
import type { ToolParams } from "../lib/assistente/tools";
import type { PinoUnderstanding } from "../lib/assistente/understanding";
import type { ProdottoRicerca } from "../lib/ricerca-ai";

// ─── S4.1: il contratto PinoUnderstanding arriva all'orchestratore ────────
//
// S3 ha introdotto il contratto; S4.1 lo collega al flusso reale. Questi test
// coprono il punto di contatto: una sola comprensione per richiesta, i suoi
// vincoli che arrivano ai parametri dei tool e al fallback, e la preferenza
// linguistica che impedisce qualsiasi ricerca quando l'utente parla solo della
// lingua.

const utente = (content: string) => ({ role: "user" as const, content });

/** Comprensione come la costruisce l'orchestratore (valori già calcolati). */
function comprensioneOrchestratore(domanda: string, storico = [utente(domanda)]) {
  const stato = costruisciStatoConversazionale(storico);
  const domandaSemantica = stato.richiesta || domanda;
  const analisiSemantica = analizzaIntentoPino(domandaSemantica);
  return analizzaComprensionePino(domanda, storico, {
    richiesta: domandaSemantica,
    analisi: analisiSemantica,
  });
}

test.describe("S4.1 — una sola comprensione per richiesta", () => {
  test("i valori precalcolati non cambiano il risultato della comprensione", () => {
    for (const frase of [
      "Cerco una borsa di pelle nera",
      "I speak English and I'm looking for pasta",
      "Cerco un regalo per una donna di 30 anni, entro 50 euro",
      "Vorrei un prodotto artigianale calabrese, non alimentare",
    ]) {
      const diretto = analizzaComprensionePino(frase);
      const orchestrato = comprensioneOrchestratore(frase);
      expect(orchestrato, frase).toEqual(diretto);
    }
  });

  test("l'orchestratore calcola la comprensione una volta sola", () => {
    const sorgente = readFileSync(
      join(process.cwd(), "lib", "assistente", "index.ts"),
      "utf8"
    );
    expect(sorgente.match(/analizzaComprensionePino\(/g)).toHaveLength(1);
    expect(sorgente.match(/costruisciStatoConversazionale\(/g)).toHaveLength(1);
    // La decisione "solo lingua" viene dal contratto, non da un secondo check.
    expect(sorgente).toMatch(/comprensione\.languagePreferenceOnly/);
  });
});

test.describe("S4.1 — preferenza linguistica nel flusso reale", () => {
  test("'I speak English': nessun vincolo e nessuna ricerca da avviare", () => {
    const u = comprensioneOrchestratore("I speak English");

    expect(u.languagePreferenceOnly).toBe(true);
    expect(u.lingua).toBe("en");
    expect(u.soggetto).toBe("");
    expect(u.minPrice).toBeNull();
    expect(u.maxPrice).toBeNull();
    expect(u.esclusioni).toEqual([]);
    // Il testo della risposta esiste: la guardia dell'orchestratore risponde
    // diretto, prima di qualsiasi tool.
    expect(rispostaPreferenzaLinguaPino("I speak English")).toMatch(/English/);
    // Nessun parametro di ricerca propagato.
    expect(parametriFallbackPiano(undefined, u)).toEqual({});
  });

  test("'I speak English and I'm looking for pasta': la richiesta resta", () => {
    const frase = "I speak English and I'm looking for pasta";
    const u = comprensioneOrchestratore(frase);

    expect(u.languagePreferenceOnly).toBe(false);
    expect(u.lingua).toBe("en");
    expect(u.soggetto).toBe("pasta");
    expect(rispostaPreferenzaLinguaPino(frase)).toBeNull();
    expect(pianoLocaleIntelligente(frase, analizzaIntentoPino(frase))?.query).toBe("pasta");
  });

  test("richiesta senza preferenza: lingua e vincoli invariati", () => {
    const u = comprensioneOrchestratore("Cerco scarpe da uomo");

    expect(u.languagePreferenceOnly).toBe(false);
    expect(u.linguaPreferita).toBeNull();
    expect(u.lingua).toBe("it");
    expect(u.maxPrice).toBeNull();
    expect(u.minPrice).toBeNull();
    expect(parametriFallbackPiano(undefined, u)).toEqual({});
  });
});

test.describe("S4.1 — soggetto e attributi conservati", () => {
  test("'Cerco una borsa di pelle nera' conserva soggetto e attributi", () => {
    const frase = "Cerco una borsa di pelle nera";
    const u = comprensioneOrchestratore(frase);

    expect(u.soggetto).toBe("borsa");
    expect(u.attributi.materiali).toEqual(["pelle"]);
    expect(u.attributi.colori).toEqual(["nero"]);
    // Gli attributi restano anche nella query di retrieval: non vengono
    // trasformati in parole chiave scollegate né persi.
    expect(pianoLocaleIntelligente(frase, analizzaIntentoPino(frase))?.query).toContain("borsa");
    expect(pianoLocaleIntelligente(frase, analizzaIntentoPino(frase))?.query).toMatch(/pelle/);
  });

  test("l'inglese conserva gli stessi attributi", () => {
    const u = comprensioneOrchestratore("I need a black leather bag");
    expect(u.lingua).toBe("en");
    expect(u.soggetto).toBe("borsa");
    expect(u.attributi.colori).toEqual(["nero"]);
    expect(u.attributi.materiali).toEqual(["pelle"]);
  });
});

test.describe("S4.1 — esclusioni e budget verso i tool", () => {
  test("'Cerco un prodotto non alimentare': l'esclusione arriva ai parametri", () => {
    const u = comprensioneOrchestratore("Cerco un prodotto non alimentare");

    expect(u.esclusioni.length).toBe(1);
    expect(u.esclusioni[0]).toMatch(/^aliment/);

    // Senza piano (planner spento) il contratto non perde l'esclusione.
    const senzaPiano = parametriFallbackPiano(undefined, u);
    expect(senzaPiano.esclusioni).toEqual(u.esclusioni);
    // Con un piano che ha già le sue esclusioni, il piano resta la fonte.
    const conPiano = parametriFallbackPiano(
      {
        surface: "products",
        intent: "product",
        query: "prodotto",
        terms: ["prodotto"],
        exclusions: ["glutine"],
        minPrice: null,
        maxPrice: null,
        city: null,
        openNow: false,
        confidence: "media",
      },
      u
    );
    expect(conPiano.esclusioni).toEqual(["glutine"]);
  });

  test("fondiVincoliPino: il piano vince, il contratto completa, niente duplicati", () => {
    const u: PinoUnderstanding = {
      lingua: "it",
      linguaPreferita: null,
      languagePreferenceOnly: false,
      intent: "product",
      soggetto: "prodotto",
      attributi: { colori: [], materiali: [], destinatario: null, eta: null, provenienza: [], taglie: [], genere: null, altri: [] },
      esclusioni: ["alimentare", "glutine"],
      minPrice: 10,
      maxPrice: 50,
    };

    const soloContratto = fondiVincoliPino(null, u);
    expect(soloContratto.esclusioni).toEqual(["alimentare", "glutine"]);
    expect(soloContratto.minPrice).toBe(10);
    expect(soloContratto.maxPrice).toBe(50);

    const conPiano = fondiVincoliPino(
      {
        surface: "products",
        intent: "food",
        query: "pasta",
        terms: ["pasta"],
        exclusions: ["glutine", "uovo"],
        minPrice: null,
        maxPrice: 30,
        city: null,
        openNow: false,
        confidence: "alta",
      },
      u
    );
    // Unione senza duplicati, piano prima; prezzi del piano prioritari.
    expect(conPiano.esclusioni).toEqual(["glutine", "uovo", "alimentare"]);
    expect(conPiano.maxPrice).toBe(30);
    expect(conPiano.minPrice).toBe(10);
  });

  test("zero esplicito valido, null/undefined assenti, negativi scartati", () => {
    const zero: PinoUnderstanding = {
      lingua: "it",
      linguaPreferita: null,
      languagePreferenceOnly: false,
      intent: "product",
      soggetto: "pasta",
      attributi: { colori: [], materiali: [], destinatario: null, eta: null, provenienza: [], taglie: [], genere: null, altri: [] },
      esclusioni: [],
      minPrice: 0,
      maxPrice: 0,
    };
    expect(fondiVincoliPino(null, zero)).toEqual({
      esclusioni: [],
      minPrice: 0,
      maxPrice: 0,
    });
    expect(parametriFallbackPiano(undefined, zero)).toEqual({
      minPrice: 0,
      maxPrice: 0,
      prezzoRigido: true,
    });

    const nullo: PinoUnderstanding = {
      ...zero,
      minPrice: null,
      maxPrice: null,
    };
    expect(fondiVincoliPino(null, nullo)).toEqual({
      esclusioni: [],
      minPrice: null,
      maxPrice: null,
    });
    expect(parametriFallbackPiano(undefined, nullo)).toEqual({});

    const nonDefinito = {
      ...zero,
      minPrice: undefined,
      maxPrice: undefined,
    } as unknown as PinoUnderstanding;
    expect(fondiVincoliPino(null, nonDefinito)).toEqual({
      esclusioni: [],
      minPrice: null,
      maxPrice: null,
    });
    expect(parametriFallbackPiano(undefined, nonDefinito)).toEqual({});

    const negativi: PinoUnderstanding = {
      ...zero,
      minPrice: -1,
      maxPrice: -5,
    };
    expect(fondiVincoliPino(null, negativi)).toEqual({
      esclusioni: [],
      minPrice: null,
      maxPrice: null,
    });
    expect(parametriFallbackPiano(undefined, negativi)).toEqual({});
  });

  test("il budget resta una preferenza indicativa, non un filtro", () => {
    const u = comprensioneOrchestratore("Cerco un regalo entro 50 euro");

    expect(u.maxPrice).toBe(50);
    expect(fondiVincoliPino(null, u).maxPrice).toBe(50);
    // Il valore viaggia nei parametri con il vincolo rigido: il budget richiesto
    // dall'utente viene applicato, non solo ordinato.
    expect(parametriFallbackPiano(undefined, u)).toEqual({ maxPrice: 50, prezzoRigido: true });
  });

  test("richiesta senza budget: nessun parametro di prezzo aggiunto", () => {
    const u = comprensioneOrchestratore("Cerco una borsa di pelle nera");
    expect(u.minPrice).toBeNull();
    expect(u.maxPrice).toBeNull();
    // Dal S4.3 gli attributi espliciti viaggiano nei parametri del fallback:
    // qui verificano l'assenza della componente prezzo, non l'assenza in sé.
    expect(parametriFallbackPiano(undefined, u)).toEqual({
      colori: ["nero"],
      materiali: ["pelle"],
    });
    expect(fondiVincoliPino(null, u).maxPrice).toBeNull();
  });
});
// ─── Budget esplicito: precedenza, normalizzazione, regali ─────────────────
const PIANO_BASE: PinoSemanticPlan = {
  surface: "products",
  intent: "product",
  query: "cuffie",
  terms: ["cuffie"],
  exclusions: [],
  minPrice: null,
  maxPrice: null,
  city: null,
  openNow: false,
  confidence: "alta",
};

const COMPRENSIONE_BASE: PinoUnderstanding = {
  lingua: "it",
  linguaPreferita: null,
  languagePreferenceOnly: false,
  intent: "product",
  soggetto: "cuffie",
  attributi: { colori: [], materiali: [], destinatario: null, eta: null, provenienza: [], taglie: [], genere: null, altri: [] },
  esclusioni: [],
  minPrice: 20,
  maxPrice: null,
};

test.describe("S4.1 — budget esplicito vincolante", () => {
  test("precedenza esclusiva: il piano vince, la comprensione non si combina", () => {
    expect(limitiVincolantiPino({ ...PIANO_BASE, maxPrice: 50 }, COMPRENSIONE_BASE)).toEqual({
      minPrice: null,
      maxPrice: 50,
    });
    expect(limitiVincolantiPino({ ...PIANO_BASE, minPrice: 30 }, { ...COMPRENSIONE_BASE, maxPrice: 999 })).toEqual({
      minPrice: 30,
      maxPrice: null,
    });
  });

  test("senza limiti nel piano la comprensione è usata integralmente", () => {
    expect(limitiVincolantiPino(PIANO_BASE, { ...COMPRENSIONE_BASE, maxPrice: 100 })).toEqual({
      minPrice: 20,
      maxPrice: 100,
    });
    expect(limitiVincolantiPino(PIANO_BASE, COMPRENSIONE_BASE)).toEqual({ minPrice: 20, maxPrice: null });
  });

  test("nessun limite valido: null, senza inventare valori", () => {
    const vuota = { ...COMPRENSIONE_BASE, minPrice: -3, maxPrice: null };
    expect(limitiVincolantiPino(PIANO_BASE, vuota)).toBeNull();
    expect(limitiVincolantiPino(undefined, undefined)).toBeNull();
    expect(limitiVincolantiPino(null, { ...COMPRENSIONE_BASE, minPrice: null, maxPrice: -3 })).toBeNull();
    // Un piano senza limiti lascia intervenire la comprensione valida.
    expect(limitiVincolantiPino({ ...PIANO_BASE, maxPrice: null }, { ...COMPRENSIONE_BASE, maxPrice: 40 })).toEqual({
      minPrice: 20,
      maxPrice: 40,
    });
  });

  test("il modello non può attivare, disattivare o alterare il vincolo", () => {
    const limiti = { minPrice: null, maxPrice: 50 };
    const out = applicaBudgetVincolantePino(
      [
        { tool: "searchProducts", params: { query: "cuffie", maxPrice: null, prezzoRigido: true } },
        { tool: "searchAll", params: { query: "cuffie", maxPrice: 9999 } },
        { tool: "searchGiftCategories", params: { termini: ["cuffie"], maxPrice: 9999 } },
        { tool: "searchStores", params: { query: "cuffie", prezzoRigido: true } },
      ],
      limiti
    );
    for (const invocazione of out.slice(0, 3)) {
      expect(invocazione.params).toMatchObject({ maxPrice: 50, prezzoRigido: true });
      expect((invocazione.params as ToolParams).minPrice).toBeUndefined();
    }
    expect((out[3].params as ToolParams).prezzoRigido).toBeUndefined();
  });

  test("senza limiti deterministici il flag del modello viene rimosso", () => {
    const out = applicaBudgetVincolantePino(
      [{ tool: "searchProducts", params: { query: "cuffie", prezzoRigido: true, maxPrice: 30 } }],
      null
    );
    expect(out[0].params).toEqual({ query: "cuffie", maxPrice: 30 });
  });

  test("fallback: i limiti espliciti diventano vincolanti, senza budget restano assenti", () => {
    const conBudget = comprensioneOrchestratore("Cerco un regalo entro 50 euro");
    expect(parametriFallbackPiano(undefined, conBudget)).toEqual({ maxPrice: 50, prezzoRigido: true });

    const conSoglia = comprensioneOrchestratore("Vorrei un regalo sopra 50 euro");
    expect(parametriFallbackPiano(undefined, conSoglia)).toEqual({ minPrice: 50, prezzoRigido: true });

    const senzaBudget = comprensioneOrchestratore("Cerco una borsa di pelle nera");
    expect(parametriFallbackPiano(undefined, senzaBudget)).toEqual({ colori: ["nero"], materiali: ["pelle"] });
  });

  test("regali: 3 gruppi, 12 categorie, stesso limite su tutte", () => {
    for (const limiti of [
      { minPrice: null, maxPrice: 50 },
      { minPrice: 50, maxPrice: null },
    ]) {
      const invocazioni = applicaBudgetVincolantePino(invocazioniRegaloPino(limiti.maxPrice, {}), limiti);
      expect(invocazioni).toHaveLength(3);
      const categorie = invocazioni.flatMap((i) => (i.params as ToolParams).termini ?? []);
      expect(new Set(categorie).size).toBe(12);
      for (const invocazione of invocazioni) {
        expect(invocazione.tool).toBe("searchGiftCategories");
        expect(invocazione.params).toMatchObject({
          prezzoRigido: true,
          ...(limiti.maxPrice != null ? { maxPrice: 50 } : {}),
          ...(limiti.minPrice != null ? { minPrice: 50 } : {}),
        });
      }
    }
  });
});

// ─── Recupero alternative: gli stessi limiti vincolanti della ricerca ──────
test.describe("S4.1 — budget vincolante nel recupero alternative", () => {
  test("piano senza prezzo + comprensione con tetto: il recupero usa max 50", () => {
    expect(parametriRecuperoPino(PIANO_BASE, { ...COMPRENSIONE_BASE, minPrice: null, maxPrice: 50 }))
      .toEqual({ maxPrice: 50, prezzoRigido: true });
  });

  test("piano senza prezzo + comprensione con soglia: il recupero usa min 50", () => {
    expect(parametriRecuperoPino(PIANO_BASE, { ...COMPRENSIONE_BASE, minPrice: 50, maxPrice: null }))
      .toEqual({ minPrice: 50, prezzoRigido: true });
  });

  test("piano con un limite valido: prevale solo il piano, la comprensione non si combina", () => {
    expect(
      parametriRecuperoPino(
        { ...PIANO_BASE, minPrice: 30 },
        { ...COMPRENSIONE_BASE, minPrice: 10, maxPrice: 999 }
      )
    ).toEqual({ minPrice: 30, prezzoRigido: true });
  });

  test("nessun limite in entrambe le fonti: nessun prezzoRigido, nessun budget inventato", () => {
    const params = parametriRecuperoPino(PIANO_BASE, { ...COMPRENSIONE_BASE, minPrice: null, maxPrice: null });
    expect(params).toEqual({});
    expect(params.prezzoRigido).toBeUndefined();
    expect(params.maxPrice).toBeUndefined();
    expect(params.minPrice).toBeUndefined();
  });

  test("città, esclusioni e apertura restano anche con il budget vincolante", () => {
    const params = parametriRecuperoPino(
      { ...PIANO_BASE, city: "Cosenza", exclusions: ["nero"], openNow: true },
      { ...COMPRENSIONE_BASE, minPrice: 20, maxPrice: 50 }
    );
    expect(params).toEqual({
      esclusioni: ["nero"],
      citta: "Cosenza",
      apertiOra: true,
      maxPrice: 50,
      minPrice: 20,
      prezzoRigido: true,
    });
  });

  test("nessun prodotto fuori fascia rientra dal recupero (confini inclusi)", () => {
    const prodotto = (id: string, prezzo: number | null) =>
      ({ id, nome: `Prodotto ${id}`, prezzo } as unknown as ProdottoRicerca);
    const prodotti = [
      prodotto("dieci", 10),
      prodotto("venti", 20),
      prodotto("cinquanta", 50),
      prodotto("sessanta", 60),
      prodotto("senza", null),
      prodotto("zero", 0),
    ];

    expect(
      filtraProdottiRecuperoPino(prodotti, { minPrice: 20, maxPrice: 50, prezzoRigido: true })
        .map((p) => p.id)
    ).toEqual(["venti", "cinquanta"]);
    // Solo soglia: i prodotti senza prezzo o a zero non passano mai.
    expect(
      filtraProdottiRecuperoPino(prodotti, { minPrice: 20, prezzoRigido: true }).map((p) => p.id)
    ).toEqual(["venti", "cinquanta", "sessanta"]);
    // Senza flag vincolante la lista resta intatta.
    expect(filtraProdottiRecuperoPino(prodotti, { maxPrice: 50 })).toHaveLength(prodotti.length);
  });
});
