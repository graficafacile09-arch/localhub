import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  analizzaComprensionePino,
  costruisciStatoConversazionale,
  fondiVincoliPino,
  pianoLocaleIntelligente,
} from "../lib/assistente/semantica";
import { analizzaIntentoPino } from "../lib/assistente/intent";
import { rispostaPreferenzaLinguaPino } from "../lib/assistente/greetings";
import { parametriFallbackPiano } from "../lib/assistente/index";
import type { PinoUnderstanding } from "../lib/assistente/understanding";

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

  test("prezzi non validi vengono scartati, mai inventati", () => {
    const base: PinoUnderstanding = {
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
    expect(fondiVincoliPino(null, base)).toEqual({
      esclusioni: [],
      minPrice: null,
      maxPrice: null,
    });
    expect(parametriFallbackPiano(undefined, base)).toEqual({});
  });

  test("il budget resta una preferenza indicativa, non un filtro", () => {
    const u = comprensioneOrchestratore("Cerco un regalo entro 50 euro");

    expect(u.maxPrice).toBe(50);
    expect(fondiVincoliPino(null, u).maxPrice).toBe(50);
    // Il valore viaggia nei parametri come preferenza (maxPrice) e nient'altro:
    // nessun parametro di filtro rigido viene introdotto qui.
    expect(parametriFallbackPiano(undefined, u)).toEqual({ maxPrice: 50 });
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
