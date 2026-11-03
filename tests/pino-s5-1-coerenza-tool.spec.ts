import { expect, test } from "@playwright/test";

import {
  MASSIMO_INVOCAZIONI_PINO,
  STRUMENTI_PINO_VALIDI,
  applicaAttributiProdottiPino,
  budgetInvocazioniRecuperoPino,
  chatConAssistente,
  deduplicaInvocazioniPino,
  invocazioniRegaloPino,
  limitaInvocazioniPino,
  nomeStrumentoPinoValido,
  validaInvocazioniPino,
} from "../lib/assistente/index";
import { CATEGORIE_REGALO } from "../lib/assistente/gift-retrieval";
import { rilevaLinguaConversazionePino, rilevaLinguaPino } from "../lib/assistente/understanding";
import { analizzaComprensionePino } from "../lib/assistente/semantica";

// ─── S5.1: coerenza linguistica e limite globale di 3 invocazioni tool ──────
//
// Offline: lingua, costruzione delle invocazioni e invariante globale. Il
// retrieval reale (Supabase) non viene eseguito in questa suite.

const u = (content: string) => ({ role: "user" as const, content });
const rispondi = (content: string) => chatConAssistente([u(content)]);

test.describe("S5.1-A — lingua inglese su richieste brevi", () => {
  test("almeno 10 richieste inglesi brevi sono riconosciute", () => {
    for (const query of [
      "Egyptian Museum",
      "Historical monuments in Castrovillari",
      "Are there any churches?",
      "Can I visit a castle?",
      "What parks can I visit?",
      "Are there any archaeological sites?",
      "I need a leather wallet",
      "Find me a hairdresser",
      "I want a manicure",
      "Where can I get my beard trimmed?",
    ]) {
      expect(rilevaLinguaPino(query), query).toBe("en");
    }
  });

  test("le stesse parole non spostano le richieste italiane di controllo", () => {
    for (const query of [
      "Cerco un museo",
      "Vorrei visitare il castello",
      "Cerco una borsa nera",
      "Dove compro olio extravergine?",
      "Mi serve qualcuno per i capelli",
    ]) {
      expect(rilevaLinguaPino(query), query).toBe("it");
    }
  });

  test("la comprensione usa la lingua rilevata sui termini turistici inglesi", () => {
    expect(analizzaComprensionePino("Egyptian Museum", [u("Egyptian Museum")]).lingua).toBe("en");
    expect(
      analizzaComprensionePino("Historical monuments in Castrovillari", [
        u("Historical monuments in Castrovillari"),
      ]).lingua
    ).toBe("en");
  });

  test("la preferenza linguistica già impostata resta prioritaria", () => {
    const storico = [u("I speak English"), u("Hai dei musei?")];
    expect(rilevaLinguaConversazionePino(storico)).toBe("en");
    expect(analizzaComprensionePino("Hai dei musei?", storico).lingua).toBe("en");
  });

  test("richiesta turistica inglese breve: risposta in inglese", async () => {
    const r = await rispondi("Egyptian Museum");

    expect(r.negozi).toEqual([]);
    expect(r.prodotti).toEqual([]);
    expect(r.risposta).toMatch(/Attractions guide/i);
    expect(r.risposta).toMatch(/doesn't necessarily mean/i);
    expect(r.risposta).not.toMatch(/guida Attrazioni/i);
  });

  test("richiesta inglese con risultati: risposta in inglese", async () => {
    const r = await rispondi("What museums can I visit?");

    expect(r.negozi).toEqual([]);
    expect(r.prodotti).toEqual([]);
    expect(r.risposta).toMatch(/Attractions guide/i);
    expect(r.risposta).toMatch(/Museo Archeologico/);
  });

  test("richiesta italiana: risposta in italiano", async () => {
    const r = await rispondi("Cerco un museo");

    expect(r.risposta).toMatch(/guida Attrazioni/i);
    expect(r.risposta).not.toMatch(/Attractions guide/i);
  });
});

test.describe("S5.1-B — fan-out regalo in 3 invocazioni", () => {
  test("le 12 categorie restano coperte da 3 invocazioni tool", () => {
    const invocazioni = invocazioniRegaloPino(undefined, {});

    expect(invocazioni).toHaveLength(3);
    expect(invocazioni.length).toBeLessThanOrEqual(MASSIMO_INVOCAZIONI_PINO);
    expect(invocazioni.every((i) => i.tool === "searchGiftCategories")).toBe(true);

    const categorie = invocazioni.flatMap((i) => i.params?.termini ?? []);
    expect(categorie).toHaveLength(CATEGORIE_REGALO.length);
    expect(new Set(categorie)).toEqual(new Set(CATEGORIE_REGALO));
    for (const invocazione of invocazioni) {
      expect(invocazione.params?.termini?.length ?? 0).toBeGreaterThan(1);
    }
  });

  test("budget, esclusioni e città viaggiano in ogni gruppo", () => {
    const invocazioni = invocazioniRegaloPino(100, {
      esclusioni: ["tessuto"],
      citta: "Castrovillari",
    });

    expect(invocazioni).toHaveLength(3);
    for (const invocazione of invocazioni) {
      expect(invocazione.params?.maxPrice).toBe(100);
      expect(invocazione.params?.esclusioni).toEqual(["tessuto"]);
      expect(invocazione.params?.citta).toBe("Castrovillari");
    }
  });

  test("colore e materiale vengono applicati anche ai gruppi regalo", () => {
    const comprensione = {
      lingua: "it" as const,
      linguaPreferita: null,
      languagePreferenceOnly: false,
      intent: "gift" as const,
      soggetto: "borsa",
      attributi: {
        colori: ["nero"],
        materiali: ["pelle"],
        destinatario: null,
        eta: null,
        provenienza: [],
        taglie: [],
        genere: null,
        altri: [],
      },
      esclusioni: [],
      minPrice: null,
      maxPrice: 100,
    };
    const invocazioni = applicaAttributiProdottiPino(invocazioniRegaloPino(100), comprensione, "");

    expect(invocazioni).toHaveLength(3);
    for (const invocazione of invocazioni) {
      expect(invocazione.params?.colori).toEqual(["nero"]);
      expect(invocazione.params?.materiali).toEqual(["pelle"]);
    }
  });
});

test.describe("S5.1-C/D — limite globale di 3 invocazioni", () => {
  test("il limite è 3 e vale per ogni percorso costruito", () => {
    expect(MASSIMO_INVOCAZIONI_PINO).toBe(3);
    expect(invocazioniRegaloPino().length).toBe(3);
    expect(limitaInvocazioniPino([{ tool: "searchStores", params: {} }])).toHaveLength(1);
    expect(
      limitaInvocazioniPino([
        { tool: "searchOffers", params: {} },
        { tool: "searchEvents", params: {} },
        { tool: "getCategories", params: {} },
      ])
    ).toHaveLength(3);
    expect(limitaInvocazioniPino([{ tool: "searchAll", params: {} }])).toHaveLength(1);
  });

  test("un piano deterministico lungo non supera 3 e conserva le superfici", () => {
    const piano = [
      { tool: "searchStores", params: { query: "forno" } },
      { tool: "searchStores", params: { query: "panificio" } },
      { tool: "searchStores", params: { query: "pasticceria" } },
      { tool: "searchStores", params: { query: "ristorante" } },
      { tool: "searchProducts", params: { query: "pane" } },
    ];
    const limitate = limitaInvocazioniPino(piano);

    expect(limitate).toHaveLength(3);
    expect(limitate.some((i) => i.tool === "searchProducts")).toBe(true);
    expect(limitate.some((i) => i.tool === "searchStores")).toBe(true);
  });

  test("dodici invocazioni identiche diventano tre", () => {
    const dodici = CATEGORIE_REGALO.map((query) => ({
      tool: "searchProducts",
      params: { query },
    }));

    expect(limitaInvocazioniPino(dodici)).toHaveLength(3);
  });

  test("il recupero semantico usa solo le invocazioni residue", () => {
    expect(budgetInvocazioniRecuperoPino(0)).toBe(3);
    expect(budgetInvocazioniRecuperoPino(1)).toBe(2);
    expect(budgetInvocazioniRecuperoPino(2)).toBe(1);
    expect(budgetInvocazioniRecuperoPino(3)).toBe(0);
    expect(budgetInvocazioniRecuperoPino(4)).toBe(0);

    for (const usate of [0, 1, 2, 3]) {
      expect(usate + budgetInvocazioniRecuperoPino(usate)).toBeLessThanOrEqual(3);
    }
  });

  test("massimo 3 invocazioni anche combinando primarie e recupero", () => {
    for (const primarie of [
      [{ tool: "searchProducts", params: { query: "pane" } }],
      [
        { tool: "searchProducts", params: { query: "pane" } },
        { tool: "searchStores", params: { query: "panificio" } },
      ],
      invocazioniRegaloPino(),
    ]) {
      const limitate = limitaInvocazioniPino(primarie);
      const recupero = budgetInvocazioniRecuperoPino(limitate.length);
      expect(limitate.length).toBeLessThanOrEqual(3);
      expect(limitate.length + recupero).toBeLessThanOrEqual(3);
    }
  });
});

// ─── S1-A: contratto al confine ─────────────────────────────────────────────

test.describe("S1-A — contratto al confine", () => {
  test("l'allowlist contiene solo gli strumenti del dispatcher", () => {
    expect([...STRUMENTI_PINO_VALIDI].sort()).toEqual([
      "getCategories",
      "getWeather",
      "searchAll",
      "searchEvents",
      "searchGiftCategories",
      "searchOffers",
      "searchPharmacies",
      "searchProducts",
      "searchStores",
    ]);
    expect(nomeStrumentoPinoValido("searchServices")).toBe(false);
    expect(nomeStrumentoPinoValido("searchStores")).toBe(true);
    expect(nomeStrumentoPinoValido(" searchStores ")).toBe(true);
    expect(nomeStrumentoPinoValido("cerca")).toBe(false);
    expect(nomeStrumentoPinoValido(42)).toBe(false);
  });

  test("i nomi sconosciuti vengono rifiutati e segnalati", () => {
    const esito = validaInvocazioniPino([
      { tool: "searchServices", params: { query: "x" } },
      { tool: "searchStores", params: { query: "pane" } },
      { params: {} },
    ]);

    expect(esito.invocazioni).toEqual([{ tool: "searchStores", params: { query: "pane" } }]);
    expect(esito.scartate).toEqual(["searchServices", "(senza nome)"]);
  });

  test("i parametri non ammessi non arrivano al dispatcher", () => {
    const esito = validaInvocazioniPino([
      { tool: "searchProducts", params: { query: "pasta", stato: "aperte", limit: 999 } },
    ]);

    expect(esito.invocazioni).toEqual([
      { tool: "searchProducts", params: { query: "pasta", limit: 20 } },
    ]);
  });

  test("un'invocazione non valida non consuma il budget di tre", () => {
    const grezze = [
      { tool: "searchInspiegabile", params: {} },
      { tool: "searchStores", params: { query: "forno" } },
      { tool: "searchProducts", params: { query: "pane" } },
      { tool: "searchOffers", params: {} },
    ];
    const valide = validaInvocazioniPino(grezze).invocazioni;
    const limitate = limitaInvocazioniPino(valide);

    expect(valide).toHaveLength(3);
    expect(limitate).toHaveLength(3);
    expect(limitate.map((i) => i.tool)).toEqual([
      "searchStores",
      "searchProducts",
      "searchOffers",
    ]);
  });
});

// ─── S1-A: deduplica delle invocazioni ──────────────────────────────────────

test.describe("S1-A — deduplica delle invocazioni", () => {
  test("le invocazioni identiche diventano una sola", () => {
    const invocazioni = [
      { tool: "searchProducts", params: { query: "pane" } },
      { tool: "searchProducts", params: { query: "pane" } },
    ];
    const uniche = deduplicaInvocazioniPino(invocazioni);

    expect(uniche).toHaveLength(1);
    expect(uniche[0]).toBe(invocazioni[0]);
  });

  test("l'ordine canonico dei parametri non crea duplicati", () => {
    expect(
      deduplicaInvocazioniPino([
        { tool: "searchProducts", params: { query: "pane", limit: 8 } },
        { tool: "searchProducts", params: { limit: 8, query: "pane" } },
        { tool: "searchProducts", params: { query: "pane", limit: 8, colori: undefined } },
      ])
    ).toHaveLength(1);
  });

  test("parametri diversi restano invocazioni distinte, nell'ordine originale", () => {
    const invocazioni = [
      { tool: "searchStores", params: { query: "forno" } },
      { tool: "searchStores", params: { query: "panificio" } },
      { tool: "searchProducts", params: { query: "forno" } },
      { tool: "searchStores", params: { query: "forno", limit: 3 } },
    ];
    const uniche = deduplicaInvocazioniPino(invocazioni);

    expect(uniche).toHaveLength(4);
    expect(uniche.map((i) => `${i.tool}:${i.params?.query}:${i.params?.limit ?? ""}`)).toEqual([
      "searchStores:forno:",
      "searchStores:panificio:",
      "searchProducts:forno:",
      "searchStores:forno:3",
    ]);
    expect(uniche[0]).toBe(invocazioni[0]);
  });

  test("deduplica prima del limite: tre invocazioni utili anche con doppioni", () => {
    const doppie = [
      { tool: "searchProducts", params: { query: "pane" } },
      { tool: "searchProducts", params: { query: "pane" } },
      { tool: "searchStores", params: { query: "forno" } },
      { tool: "searchStores", params: { query: "forno" } },
      { tool: "searchOffers", params: {} },
    ];
    const uniche = deduplicaInvocazioniPino(doppie);

    expect(uniche).toHaveLength(3);
    expect(limitaInvocazioniPino(uniche).map((i) => i.tool)).toEqual([
      "searchProducts",
      "searchStores",
      "searchOffers",
    ]);
  });

  test("un ingresso vuoto o malformato non produce invocazioni", () => {
    expect(deduplicaInvocazioniPino([])).toEqual([]);
    expect(deduplicaInvocazioniPino(undefined as never)).toEqual([]);
  });
});
