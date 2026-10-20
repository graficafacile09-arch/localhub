import { expect, test } from "@playwright/test";

import {
  rilevaDomandaAggregata,
  risolviSoggettoAggregato,
  prodottoCorrispondeQualificatore,
  componiRispostaAggregata,
} from "../lib/assistente/aggregata";
import type { ProdottoRicerca } from "../lib/ricerca-ai";
import { prodottoPertinente } from "../lib/assistente/tools";

const prodotto = (nome: string, prezzo = 2, descrizione: string | null = null): ProdottoRicerca => ({
  id: nome.toLowerCase().replace(/\s+/g, "-"),
  negozio_id: "negozio-1",
  nome,
  descrizione,
  categoria: "Pasta",
  prezzo,
  negozio_nome: "Mani in Pasta",
  immagine_principale: null,
});

// Prodotti reali del catalogo InCittà per la ricerca "pasta".
const CATALOGO_PASTA = [
  prodotto("Fileja di Tropea", 2),
  prodotto("Taralli calabresi", 3),
  prodotto("Maccheroni al ferretto", 3.5),
  prodotto("Biscotti tradizionali calabresi", 4),
];

// Prodotto recuperato dal filtro "all'uovo".
const TAGLIATELLE = prodotto("Tagliatelle all'uovo", 3.5);

test.describe("Pino — domande informative sul catalogo", () => {
  test("riconosce conteggio ed elenco, senza invadere altri intenti", () => {
    expect(rilevaDomandaAggregata("Quanti tipi di pasta ci sono?")?.tipo).toBe("conteggio");
    expect(rilevaDomandaAggregata("Quali tipi avete?")?.tipo).toBe("elenco");
    expect(rilevaDomandaAggregata("Quanti prodotti di questo tipo ci sono?")?.riferimentoContesto).toBe(true);

    // Non sono domande di catalogo: restano sui loro percorsi.
    expect(rilevaDomandaAggregata("Quante farmacie sono aperte?")).toBeNull();
    expect(rilevaDomandaAggregata("Voglio la pasta")).toBeNull();
    expect(rilevaDomandaAggregata("Quanti abitanti ha Castrovillari?")).toBeNull();
  });

  test("sequenza pasta → all'uovo → conteggio: conserva soggetto e filtro", () => {
    const soggetto = risolviSoggettoAggregato("Quanti tipi di pasta ci sono?", [
      "Voglio la pasta",
      "La voglio all'uovo",
    ]);

    expect(soggetto).not.toBeNull();
    expect(soggetto?.soggetto).toBe("pasta");
    expect(soggetto?.qualificatore).toBe("uovo");
  });

  test("«Quali tipi avete?» eredita il soggetto della ricerca precedente", () => {
    const soggetto = risolviSoggettoAggregato("Quali tipi avete?", ["Cerco pasta"]);

    expect(soggetto?.soggetto).toBe("pasta");
    expect(soggetto?.qualificatore).toBeNull();
    expect(soggetto?.daContesto).toBe(true);
  });

  test("«di questo tipo» mantiene il filtro già attivo", () => {
    const soggetto = risolviSoggettoAggregato("Quanti prodotti di questo tipo ci sono?", [
      "Pasta all'uovo",
    ]);

    expect(soggetto?.soggetto).toBe("pasta");
    expect(soggetto?.qualificatore).toBe("uovo");
    expect(soggetto?.daContesto).toBe(true);
  });

  test("una domanda indipendente non eredita il contesto precedente", () => {
    const soggetto = risolviSoggettoAggregato("Quanti tipi di scarpe ci sono?", [
      "Voglio la pasta",
      "La voglio all'uovo",
    ]);

    expect(soggetto?.soggetto).toBe("scarpe");
    expect(soggetto?.qualificatore).toBeNull();
  });

  test("senza soggetto né contesto non inventa una ricerca", () => {
    expect(risolviSoggettoAggregato("Quanti prodotti ci sono?", [])).toBeNull();
  });

  test("il filtro si applica su nome e descrizione reali", () => {
    expect(prodottoCorrispondeQualificatore(TAGLIATELLE, "all'uovo")).toBe(true);
    expect(prodottoCorrispondeQualificatore(CATALOGO_PASTA[0], "all'uovo")).toBe(false);
  });

  test("la ricerca iniziale «Cerco pasta all'uovo» trova il nome specifico in catalogo", () => {
    expect(prodottoPertinente(TAGLIATELLE, ["pasta", "uovo"], [])).toBe(true);
    expect(prodottoPertinente(prodotto("Biscotti all'uovo"), ["pasta", "uovo"], [])).toBe(false);
    expect(prodottoPertinente(prodotto("Tagliatelle secche"), ["pasta", "uovo"], [])).toBe(false);
  });
});

test.describe("Pino — risposta aggregata basata sui dati", () => {
  test("conteggio reale del soggetto + sottoinsieme del filtro attivo", () => {
    const risposta = componiRispostaAggregata({
      tipo: "conteggio",
      soggetto: "pasta",
      qualificatore: "uovo",
      prodottiSoggetto: CATALOGO_PASTA,
      prodottiQualificatore: [TAGLIATELLE],
      limite: 20,
    });

    expect(risposta).toContain("4 prodotti");
    expect(risposta).toContain("1 corrisponde al filtro «uovo»");
    expect(risposta).toContain("Tagliatelle all'uovo");
    expect(risposta).toContain("non è un elenco esaustivo");
  });

  test("«di questo tipo» risponde sul sottoinsieme e cita il totale", () => {
    const risposta = componiRispostaAggregata({
      tipo: "conteggio",
      soggetto: "pasta",
      qualificatore: "uovo",
      prodottiSoggetto: CATALOGO_PASTA,
      prodottiQualificatore: [TAGLIATELLE],
      limite: 20,
      riferimentoContesto: true,
    });

    expect(risposta).toContain("Con il filtro «uovo» risultano 1 prodotto");
    expect(risposta).toContain("senza filtro il catalogo ne ha 4");
    expect(risposta).toContain("Tagliatelle all'uovo");
  });

  test("catalogo senza dati: nessun conteggio inventato", () => {
    const risposta = componiRispostaAggregata({
      tipo: "conteggio",
      soggetto: "pasta",
      qualificatore: null,
      prodottiSoggetto: [],
      limite: 20,
    });

    expect(risposta).toContain("non posso dirti quanti ce ne sono");
    expect(risposta).toContain("non invento un conteggio");
    expect(risposta).not.toMatch(/\d+\s+prodott/i);
  });

  test("filtro senza risultati: lo dichiara e mostra i risultati disponibili", () => {
    const risposta = componiRispostaAggregata({
      tipo: "conteggio",
      soggetto: "pasta",
      qualificatore: "uovo",
      prodottiSoggetto: CATALOGO_PASTA,
      prodottiQualificatore: [],
      limite: 20,
    });

    expect(risposta).toContain("Con il filtro «uovo» non risulta alcun prodotto");
    expect(risposta).toContain("Senza quel filtro");
    expect(risposta).toContain("Fileja di Tropea");
  });

  test("oltre il limite della ricerca il numero è dichiarato come minimo", () => {
    const molti = Array.from({ length: 20 }, (_, i) => prodotto(`Pasta tipo ${i + 1}`));
    const risposta = componiRispostaAggregata({
      tipo: "conteggio",
      soggetto: "pasta",
      qualificatore: null,
      prodottiSoggetto: molti,
      limite: 20,
    });

    expect(risposta).toContain("almeno 20 prodotti");
    expect(risposta).toContain("può essere maggiore");
  });

  test("prodotti duplicati non gonfiano il conteggio", () => {
    const risposta = componiRispostaAggregata({
      tipo: "conteggio",
      soggetto: "pasta",
      qualificatore: null,
      prodottiSoggetto: [...CATALOGO_PASTA, CATALOGO_PASTA[0]],
      limite: 20,
    });

    expect(risposta).toContain("4 prodotti");
  });
});
