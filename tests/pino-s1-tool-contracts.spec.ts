import { expect, test } from "@playwright/test";

import {
  CONTRATTI_STRUMENTO,
  classeCorrispondenza,
  classificaNegozioPino,
  classificaProdottoPino,
  deduplicaPerId,
  normalizzaQueryOfferteEventiPino,
  searchAll,
  searchProducts,
  searchStores,
  validaToolParams,
  type ToolParams,
} from "../lib/assistente/tools";
import type { NegozioRicerca, ProdottoRicerca } from "../lib/ricerca-ai";

// ─── S1: contratti degli strumenti ──────────────────────────────────────────
//
// Questa suite blocca il contratto introdotto in S1:
//  - i ToolParams vengono validati e normalizzati, senza inventare valori;
//  - i risultati vengono deduplicati conservando l'ordine di ranking;
//  - ogni risultato ha una classe di corrispondenza calcolata INTERNAMENTE.
//
// Le classi non sono ancora mostrate all'utente: i test qui sotto verificano
// anche che il calcolo non alteri i risultati restituiti.

// `parole_chiave` è una colonna del catalogo letta dal gate di pertinenza, non
// parte del tipo pubblico di ricerca: le fixture la ammettono esplicitamente.
type ProdottoFixture = ProdottoRicerca & { parole_chiave?: string[] };

const prodotto = (
  nome: string,
  categoria: string | null,
  extra: Partial<ProdottoRicerca> & { parole_chiave?: string[] } = {}
): ProdottoFixture => ({
  id: nome.toLowerCase().replace(/\s+/g, "-"),
  negozio_id: "negozio-1",
  nome,
  descrizione: null,
  categoria,
  prezzo: 3,
  negozio_nome: "Mani in Pasta",
  immagine_principale: null,
  ...extra,
});

const negozio = (
  nome: string,
  extra: Partial<NegozioRicerca> = {}
): NegozioRicerca => ({
  id: nome.toLowerCase().replace(/\s+/g, "-"),
  nome,
  descrizione: null,
  categoria: null,
  ...extra,
});

// ─── Validazione dei parametri ──────────────────────────────────────────────

test.describe("S1 — validazione dei ToolParams", () => {
  test("parametri validi dei prodotti: trim, clamp del limite, liste senza duplicati", () => {
    const esito = validaToolParams("searchProducts", {
      query: "  pasta  ",
      categoria: " Alimentari ",
      citta: "Castrovillari",
      esclusioni: ["glutine", "GLUTINE"],
      escludiNomi: ["Taralli calabresi"],
      minPrice: "1.5",
      maxPrice: 12,
      limit: 999,
      apertiOra: true,
    });

    expect(esito.problemi).toEqual([]);
    expect(esito.params).toEqual({
      query: "pasta",
      categoria: "Alimentari",
      citta: "Castrovillari",
      esclusioni: ["glutine"],
      escludiNomi: ["Taralli calabresi"],
      minPrice: 1.5,
      maxPrice: 12,
      limit: 20,
      apertiOra: true,
    });
  });

  test("parametri validi delle attività: termini, servizio, tipo", () => {
    const esito = validaToolParams("searchStores", {
      termini: ["pasta", "Pasta", "", "  ", "tagliatelle"],
      tipo: "negozio",
      servizio: " hair cut ",
    });

    expect(esito.problemi).toEqual([]);
    expect(esito.params).toEqual({
      termini: ["pasta", "tagliatelle"],
      tipo: "negozio",
      servizio: "hair cut",
    });
  });

  test("il clamp del limite coincide con il comportamento esistente", () => {
    expect(validaToolParams("searchProducts", { limit: 0 }).params.limit).toBe(1);
    expect(validaToolParams("searchProducts", { limit: 3.7 }).params.limit).toBe(3);
    expect(validaToolParams("searchProducts", { limit: -20 }).params.limit).toBe(1);
    expect(validaToolParams("searchProducts", { limit: 50 }).params.limit).toBe(20);
    // Limite assente: nessun valore inventato, il chiamante usa il suo default.
    expect(validaToolParams("searchProducts", {}).params.limit).toBeUndefined();
  });

  test("parametri non validi vengono scartati e segnalati, mai lanciati", () => {
    const testo = validaToolParams("searchStores", {
      query: "   ",
      categoria: null,
      termini: "pasta",
      esclusioni: 42,
    });

    expect(testo.params).toEqual({});
    expect(testo.problemi).toEqual(
      expect.arrayContaining([
        "query_non_valida",
        "categoria_non_valida",
        "lista_non_valida:termini",
        "lista_non_valida:esclusioni",
      ])
    );

    const vincoli = validaToolParams("searchProducts", {
      minPrice: 0,
      maxPrice: -4,
      limit: "molti",
      apertiOra: "sì",
    });

    expect(vincoli.params).toEqual({});
    expect(vincoli.problemi).toEqual(
      expect.arrayContaining([
        "minPrice_non_valido",
        "maxPrice_non_valido",
        "limit_non_valido",
        "apertiOra_non_valido",
      ])
    );
  });

  test("l'enum `stato` vale solo per lo strumento che lo usa", () => {
    expect(validaToolParams("searchPharmacies", { stato: "aperto" }).problemi).toEqual([
      "stato_non_valido",
    ]);
    expect(validaToolParams("searchPharmacies", { stato: "aperte" }).params).toEqual({
      stato: "aperte",
    });
    expect(validaToolParams("searchProducts", { stato: "aperte" }).params).toEqual({});
    expect(validaToolParams("searchProducts", { stato: "aperte" }).problemi).toEqual([
      "chiave_non_ammessa:stato",
    ]);
  });

  test("fascia di prezzo incoerente: scartata per intero e segnalata", () => {
    const esito = validaToolParams("searchProducts", { minPrice: 30, maxPrice: 5 });
    expect(esito.params.minPrice).toBeUndefined();
    expect(esito.params.maxPrice).toBeUndefined();
    expect(esito.problemi).toContain("fascia_prezzo_incoerente");
  });

  test("input che non è un oggetto produce parametri vuoti", () => {
    for (const raw of [undefined, null, "pasta", 42, [], true]) {
      const esito = validaToolParams("searchProducts", raw);
      expect(esito.params).toEqual({});
    }
    expect(validaToolParams("searchProducts", []).problemi).toContain("parametri_non_oggetto");
  });

  test("normalizzazione: caratteri di controllo rimossi e lunghezza limitata", () => {
    const conControlli = validaToolParams("searchProducts", { query: "pa\u0000sta\n" });
    expect(conControlli.params.query).toBe("pa sta");

    const lunga = "pasta ".repeat(60);
    const esito = validaToolParams("searchProducts", { query: lunga });
    expect(esito.params.query?.length).toBe(120);
    expect(esito.params.query?.startsWith("pasta pasta")).toBe(true);
  });

  test("chiavi sconosciute ignorate e input non mutato", () => {
    const grezzo = { query: "pasta", inesistente: "x", limit: 5 } as unknown as ToolParams;
    const esito = validaToolParams("searchProducts", grezzo);
    expect(Object.keys(esito.params).sort()).toEqual(["limit", "query"]);
    expect(grezzo).toEqual({ query: "pasta", inesistente: "x", limit: 5 });
  });

  test("validare due volte non cambia il risultato", () => {
    const una = validaToolParams("searchStores", { query: " pane ", limit: 4 }).params;
    const due = validaToolParams("searchStores", una).params;
    expect(due).toEqual(una);
    expect(validaToolParams("searchStores", una).problemi).toEqual([]);
  });

  test("gli strumenti senza query restituiscono risultati vuoti, come prima", async () => {
    expect(await searchProducts("")).toEqual([]);
    expect(await searchProducts("   ")).toEqual([]);
    expect(await searchStores("")).toEqual([]);
    expect(await searchAll("")).toEqual({
      negozi: [],
      prodotti: [],
      offerte: [],
      eventi: [],
      categorie: [],
      meteo: null,
      farmacie: [],
    });
  });
});

// ─── Deduplicazione ─────────────────────────────────────────────────────────

test.describe("S1 — deduplicazione dei risultati", () => {
  test("conserva il primo elemento e l'ordine di ranking", () => {
    const primo = prodotto("Pasta di grano duro", "Alimentari");
    const secondo = prodotto("Tagliatelle all'uovo", "Alimentari");
    const doppione = { ...primo, prezzo: 99 };

    const unici = deduplicaPerId([primo, secondo, doppione, { ...secondo }]);
    expect(unici).toEqual([primo, secondo]);
    expect(unici[0]).toBe(primo);
  });

  test("gli elementi senza id restano tutti e nessun oggetto viene alterato", () => {
    const senzaId: { id?: string; nome: string } = { nome: "Senza id" };
    const conId = prodotto("Pasta di grano duro", "Alimentari");
    const ingresso = [senzaId, senzaId, conId];
    const unici = deduplicaPerId(ingresso);

    expect(unici).toHaveLength(3);
    expect(unici[2]).toBe(conId);
    expect(unici[0]).toBe(senzaId);
    expect(ingresso).toHaveLength(3);
  });
});

// ─── Classi di corrispondenza (interne) ─────────────────────────────────────

test.describe("S1 — classi di corrispondenza dei prodotti", () => {
  test("exact: il soggetto è nel nome", () => {
    expect(
      classificaProdottoPino(prodotto("Cuffie Bluetooth", "Elettronica"), "cuffie")
    ).toBe("exact");
  });

  test("synonym: equivalenza reale tramite categoria o dizionario condiviso", () => {
    expect(
      classificaProdottoPino(prodotto("Sneakers running", "Calzature"), "scarpe")
    ).toBe("synonym");
  });

  test("semantic: identificato da parola chiave corroborata dalla descrizione", () => {
    expect(
      classificaProdottoPino(
        prodotto("Maccheroni al ferretto", "Alimentari", {
          parole_chiave: ["pasta"],
          descrizione: "Pasta tradizionale calabrese.",
        }),
        "pasta"
      )
    ).toBe("semantic");
  });

  test("weak: recupero refuso sulla testa del nome", () => {
    expect(
      classificaProdottoPino(prodotto("Orologio da polso", "Accessori"), "orologgio")
    ).toBe("weak");
  });

  test("null: nessuna relazione reale con il soggetto", () => {
    expect(classificaProdottoPino(prodotto("Pane casereccio", "Alimentari"), "orologgio")).toBeNull();
    expect(classificaProdottoPino(prodotto("Pane casereccio", "Alimentari"), "pasta")).toBeNull();
  });

  test("soggetto generico o assente: nessuna classe attribuita", () => {
    const p = prodotto("Confetti misti", "Dolciumi");
    expect(classificaProdottoPino(p, "qualcosa")).toBeNull();
    expect(classificaProdottoPino(p, "dolce")).toBeNull();
    expect(classificaProdottoPino(p, "")).toBeNull();
    expect(classificaProdottoPino(p, "   ")).toBeNull();
  });

  test("la descrizione da sola non identifica il prodotto", () => {
    expect(
      classificaProdottoPino(
        prodotto("Filetti di cipolla", "Conserve", {
          descrizione: "Conservati sott'olio.",
        }),
        "olio"
      )
    ).toBeNull();
  });
});

test.describe("S1 — classi di corrispondenza dei negozi", () => {
  test("nome, categoria, descrizione e solo-recall", () => {
    expect(classificaNegozioPino(negozio("Panificio Rossi"), "panificio")).toBe("exact");
    expect(
      classificaNegozioPino(negozio("Rossi Srl", { categoria: "Panificio" }), "panificio")
    ).toBe("synonym");
    expect(
      classificaNegozioPino(
        negozio("Rossi Srl", { categoria: "Alimentari", descrizione: "Forno storico: pane e dolci." }),
        "pane"
      )
    ).toBe("semantic");
    expect(classificaNegozioPino(negozio("Rossi Srl"), "idraulico")).toBe("weak");
  });

  test("soggetto generico o assente: nessuna classe attribuita", () => {
    const n = negozio("Rossi Srl", { descrizione: "Bottega storica." });
    expect(classificaNegozioPino(n, "qualcosa")).toBeNull();
    expect(classificaNegozioPino(n, "")).toBeNull();
  });
});

// ─── Le classi non cambiano ciò che Pino mostra ─────────────────────────────

test.describe("S1 — risultati e comportamento conservati", () => {
  test("la classe è recuperabile solo dentro l'esecuzione, non finisce nei dati", () => {
    const p = prodotto("Cuffie Bluetooth", "Elettronica");
    const chiaviPrima = Object.keys(p).sort();

    // Un oggetto mai classificato non espone nessuna classe.
    expect(classeCorrispondenza(p)).toBeNull();
    expect(Object.keys(p).sort()).toEqual(chiaviPrima);
    expect("classe" in p).toBe(false);
    expect("matchClass" in p).toBe(false);

    // La classificazione pura restituisce la classe ma non tocca l'oggetto.
    expect(classificaProdottoPino(p, "cuffie")).toBe("exact");
    expect(Object.keys(p).sort()).toEqual(chiaviPrima);
    expect(classeCorrispondenza(p)).toBeNull();
  });

  test("deduplica restituisce gli stessi oggetti, senza copie né campi aggiunti", () => {
    const p = prodotto("Pasta di grano duro", "Alimentari");
    const [unico] = deduplicaPerId([p]);
    expect(unico).toBe(p);
    expect(Object.keys(unico).sort()).toEqual(Object.keys(p).sort());
  });

  test("la validazione mantiene i vincoli espliciti che il chiamante usa", () => {
    const esito = validaToolParams("searchAll", {
      esclusioni: ["alcolica"],
      maxPrice: 5,
      escludiNomi: ["Birra Moretti"],
      citta: "Castrovillari",
      apertiOra: true,
    });
    expect(esito.params).toEqual({
      esclusioni: ["alcolica"],
      maxPrice: 5,
      escludiNomi: ["Birra Moretti"],
      citta: "Castrovillari",
      apertiOra: true,
    });
    expect(esito.params.minPrice).toBeUndefined();
  });
});

// ─── S1-A: contratti per strumento ──────────────────────────────────────────

const chiaviContratto = (strumento: keyof typeof CONTRATTI_STRUMENTO) =>
  CONTRATTI_STRUMENTO[strumento] as readonly string[];

test.describe("S1-A — contratti per strumento", () => {
  test("il contratto copre tutti e solo gli strumenti reali", () => {
    expect(Object.keys(CONTRATTI_STRUMENTO).sort()).toEqual([
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
    // `searchServices` non esiste nel dispatcher: era un letterale morto.
    expect(Object.keys(CONTRATTI_STRUMENTO)).not.toContain("searchServices");
    expect(chiaviContratto("searchGiftCategories")).toEqual(
      expect.arrayContaining(["termini", "limit"])
    );
    expect(chiaviContratto("getWeather")).toEqual([]);
  });

  test("nessuna chiave realmente letta da un tool viene esclusa", () => {
    const attese: Record<string, string[]> = {
      searchStores: [
        "query", "limit", "categoria", "tipo", "servizio", "citta", "termini",
        "esclusioni", "escludiNomi", "apertiOra",
      ],
      searchProducts: [
        "query", "limit", "categoria", "citta", "esclusioni",
        "colori", "materiali", "escludiNomi", "minPrice", "maxPrice", "apertiOra",
      ],
      searchOffers: ["query", "limit"],
      searchEvents: ["query", "limit"],
      searchAll: [
        "query", "limit", "categoria", "tipo", "servizio", "citta",
        "termini", "esclusioni", "colori", "materiali", "escludiNomi", "minPrice",
        "maxPrice", "apertiOra",
      ],
      getCategories: [],
      getWeather: [],
      searchPharmacies: ["stato", "limit"],
      searchGiftCategories: [
        "query", "limit", "termini", "categoria", "citta", "esclusioni", "colori",
        "materiali", "escludiNomi", "minPrice", "maxPrice", "apertiOra",
      ],
    };

    for (const [strumento, chiavi] of Object.entries(attese)) {
      expect(
        chiaviContratto(strumento as keyof typeof CONTRATTI_STRUMENTO).slice().sort(),
        strumento
      ).toEqual(chiavi.slice().sort());
    }
  });

  test("searchAll conserva i parametri inoltrati ai sotto-tool", () => {
    const esito = validaToolParams("searchAll", {
      query: "regalo",
      termini: ["orologio"],
      categoria: "Accessori",
      tipo: "negozio",
      servizio: "riparazione",
      citta: "Castrovillari",
      esclusioni: ["pelle"],
      colori: ["nero"],
      materiali: ["pelle"],
      escludiNomi: ["Cintura"],
      minPrice: 10,
      maxPrice: 100,
      apertiOra: true,
      limit: 4,
    });

    expect(esito.problemi).toEqual([]);
    expect(esito.params).toEqual({
      query: "regalo",
      termini: ["orologio"],
      categoria: "Accessori",
      tipo: "negozio",
      servizio: "riparazione",
      citta: "Castrovillari",
      esclusioni: ["pelle"],
      colori: ["nero"],
      materiali: ["pelle"],
      escludiNomi: ["Cintura"],
      minPrice: 10,
      maxPrice: 100,
      apertiOra: true,
      limit: 4,
    });
  });

  test("searchGiftCategories conserva termini, limit e attributi, scarta il resto", () => {
    const esito = validaToolParams("searchGiftCategories", {
      termini: ["orologio", "borsa"],
      limit: 3,
      colori: ["nero"],
      tipo: "negozio",
    });

    expect(esito.params).toEqual({
      termini: ["orologio", "borsa"],
      limit: 3,
      colori: ["nero"],
    });
    expect(esito.problemi).toEqual(["chiave_non_ammessa:tipo"]);
  });

  test("le chiavi non ammesse vengono scartate e segnalate, senza eccezioni", () => {
    const casi: Array<[keyof typeof CONTRATTI_STRUMENTO, string]> = [
      ["searchProducts", "termini"],
      ["searchProducts", "servizio"],
      ["searchProducts", "sottocategoria"],
      ["searchAll", "sottocategoria"],
      ["searchStores", "colori"],
      ["searchStores", "maxPrice"],
      ["searchOffers", "stato"],
      ["searchEvents", "materiali"],
      ["getWeather", "limit"],
      ["getCategories", "query"],
      ["searchPharmacies", "categoria"],
    ];

    for (const [strumento, chiave] of casi) {
      const esito = validaToolParams(strumento, { [chiave]: "x" } as unknown as ToolParams);
      expect(esito.params, `${strumento}.${chiave}`).toEqual({});
      expect(esito.problemi, `${strumento}.${chiave}`).toEqual([
        `chiave_non_ammessa:${chiave}`,
      ]);
    }
  });

  test("una chiave inventata è segnalata come non ammessa", () => {
    const esito = validaToolParams("searchProducts", {
      query: "pasta",
      prezzoMassimo: 10,
    } as unknown as ToolParams);

    expect(esito.params).toEqual({ query: "pasta" });
    expect(esito.problemi).toEqual(["chiave_non_ammessa:prezzoMassimo"]);
  });
});

// ─── S1-A: query di offerte ed eventi ───────────────────────────────────────

test.describe("S1-A — query di offerte ed eventi", () => {
  test("query normalizzata come gli altri parametri testuali", () => {
    expect(normalizzaQueryOfferteEventiPino("  Sconti  ")).toBe("sconti");
    expect(normalizzaQueryOfferteEventiPino("Scon\u0000ti")).toBe("scon ti");
    expect(normalizzaQueryOfferteEventiPino("a".repeat(500))).toHaveLength(120);
    expect(normalizzaQueryOfferteEventiPino(undefined)).toBe("");
    expect(normalizzaQueryOfferteEventiPino(null)).toBe("");
    expect(normalizzaQueryOfferteEventiPino(42)).toBe("");
  });

  test("le query valide restano identiche a prima (solo il caso)", () => {
    expect(normalizzaQueryOfferteEventiPino("Natale")).toBe("natale");
    expect(normalizzaQueryOfferteEventiPino("concerto live")).toBe("concerto live");
  });
});
