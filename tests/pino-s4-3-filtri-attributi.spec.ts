import { expect, test } from "@playwright/test";

import { analizzaComprensionePino } from "../lib/assistente/semantica";
import {
  applicaAttributiProdottiPino,
  attributiProdottiPino,
  notaAttributiProdottiPino,
  parametriFallbackPiano,
} from "../lib/assistente/index";
import {
  filtraProdottiPerAttributiPino,
  ordinaProdottiPerBudget,
  prodottoRispettaBudgetPino,
  validaToolParams,
} from "../lib/assistente/tools";
import type { ProdottoRicerca } from "../lib/ricerca-ai";

// ─── S4.3: colore e materiale diventano filtri effettivi ──────────────────
//
// Regola implementata: il soggetto resta il criterio principale; un prodotto
// con colore/materiale DICHIARATO e diverso viene scartato; un prodotto che non
// dichiara il dato resta (assenza ≠ contraddizione) ma Pino non afferma che lo
// possiede. Il budget resta indicativo (D-1).

function prodotto(
  nome: string,
  descrizione: string | null = null,
  categoria: string | null = null,
  prezzo = 20
): ProdottoRicerca {
  return {
    id: nome,
    negozio_id: "negozio-test",
    nome,
    descrizione,
    categoria,
    prezzo,
    negozio_nome: "Negozio test",
    immagine_principale: null,
  };
}

function comprensione(frase: string) {
  const u = analizzaComprensionePino(frase);
  return { colori: u.attributi.colori, materiali: u.attributi.materiali };
}

test.describe("S4.3 — colore", () => {
  test("'borsa nera': tiene nero e dati assenti, scarta il colore incompatibile", () => {
    const esito = filtraProdottiPerAttributiPino(
      [
        prodotto("Borsa in pelle nera", "Borsa artigianale in pelle nera"),
        prodotto("Borsa in pelle rossa", "Borsa artigianale in pelle rossa"),
        prodotto("Borsa artigianale", "Nessun colore indicato"),
      ],
      comprensione("Cerco una borsa nera")
    );

    expect(esito.prodotti.map((p) => p.nome)).toEqual([
      "Borsa in pelle nera",
      "Borsa artigianale",
    ]);
    expect(esito.esclusi).toBe(1);
    expect(esito.senzaColore).toBe(1);
    expect(esito.coloriRiscontrati).toEqual(["nero"]);
  });

  test("colore scritto in inglese: 'black' vale 'nero'", () => {
    const esito = filtraProdottiPerAttributiPino(
      [prodotto("Borsa nera"), prodotto("Borsa blu")],
      { colori: ["black"] }
    );

    expect(esito.prodotti.map((p) => p.nome)).toEqual(["Borsa nera"]);
    expect(esito.esclusi).toBe(1);
  });

  test("colore nel nome, nella descrizione o nella categoria vengono letti", () => {
    const esito = filtraProdottiPerAttributiPino(
      [
        prodotto("Borsa", "Disponibile in nero", null),
        prodotto("Borsa", null, "Pelle nera"),
        prodotto("Borsa", "Disponibile in verde", "Pelle verde"),
      ],
      { colori: ["nero"] }
    );

    expect(esito.prodotti).toHaveLength(2);
    expect(esito.esclusi).toBe(1);
  });
});

test.describe("S4.3 — materiale", () => {
  test("'borsa di pelle': tiene pelle/cuoio e dati assenti, scarta il tessuto", () => {
    const esito = filtraProdottiPerAttributiPino(
      [
        prodotto("Borsa in pelle", "Lavorazione artigianale"),
        prodotto("Borsa in cuoio", "Lavorazione artigianale"),
        prodotto("Borsa in tessuto", "Lavorazione artigianale"),
        prodotto("Borsa artigianale", "Materiale non specificato"),
      ],
      comprensione("Cerco una borsa di pelle")
    );

    expect(esito.prodotti.map((p) => p.nome)).toEqual([
      "Borsa in pelle",
      "Borsa in cuoio",
      "Borsa artigianale",
    ]);
    expect(esito.esclusi).toBe(1);
    expect(esito.senzaMateriale).toBe(1);
    expect(esito.materialiRiscontrati).toEqual(["pelle"]);
  });

  test("materiale assente: nessuna dichiarazione inventata", () => {
    const esito = filtraProdottiPerAttributiPino(
      [prodotto("Borsa artigianale", "Nessun materiale indicato")],
      { materiali: ["pelle"] }
    );

    expect(esito.prodotti).toHaveLength(1);
    expect(esito.materialiRiscontrati).toEqual([]);
    expect(esito.senzaMateriale).toBe(1);
  });
});

test.describe("S4.3 — colore e materiale insieme", () => {
  test("'borsa di pelle nera': entrambi i vincoli, nessuna via di fuga", () => {
    const esito = filtraProdottiPerAttributiPino(
      [
        prodotto("Borsa in pelle nera"),
        prodotto("Borsa in pelle rossa"),
        prodotto("Borsa in tessuto nera"),
        prodotto("Borsa artigianale"),
      ],
      comprensione("Cerco una borsa di pelle nera")
    );

    expect(esito.prodotti.map((p) => p.nome)).toEqual([
      "Borsa in pelle nera",
      "Borsa artigianale",
    ]);
    expect(esito.esclusi).toBe(2);
    expect(esito.senzaColore).toBe(1);
    expect(esito.senzaMateriale).toBe(1);
  });

  test("richiesta inglese equivalente: 'I need a black leather bag'", () => {
    const esito = filtraProdottiPerAttributiPino(
      [
        prodotto("Borsa in pelle nera"),
        prodotto("Borsa in pelle rossa"),
        prodotto("Borsa in tessuto nera"),
      ],
      comprensione("I need a black leather bag")
    );

    expect(esito.prodotti.map((p) => p.nome)).toEqual(["Borsa in pelle nera"]);
    expect(esito.esclusi).toBe(2);
  });
});

test.describe("S4.3 — nessun risultato compatibile, risposta onesta", () => {
  test("il filtro azzera i risultati e la nota parla di catalogo, non di città", () => {
    const u = comprensioneCompleta("Cerco una borsa nera");
    const esito = filtraProdottiPerAttributiPino(
      [prodotto("Borsa rossa"), prodotto("Borsa verde")],
      { colori: u.attributi.colori, materiali: u.attributi.materiali }
    );

    expect(esito.prodotti).toEqual([]);
    expect(esito.esclusi).toBe(2);

    const nota = notaAttributiProdottiPino(esito, u, "it");
    expect(nota).not.toBeNull();
    expect(nota).toContain("catalogo InCittà");
    expect(nota).not.toMatch(/non esiste in città|non esiste a /i);
  });

  test("la nota segnala gli attributi non verificabili", () => {
    const u = comprensioneCompleta("Cerco una borsa di pelle nera");
    const esito = filtraProdottiPerAttributiPino(
      [prodotto("Borsa artigianale", "Nessun dettaglio")],
      { colori: ["nero"], materiali: ["pelle"] }
    );
    const nota = notaAttributiProdottiPino(esito, u, "it");

    expect(nota).toContain("non posso confermarlo");
    expect(nota).toContain("il colore");
    expect(nota).toContain("il materiale");
  });

  test("nota in inglese quando la conversazione è in inglese", () => {
    const u = comprensioneCompleta("I need a black leather bag");
    const esito = filtraProdottiPerAttributiPino([prodotto("Borsa rossa")], {
      colori: ["nero"],
      materiali: ["pelle"],
    });
    const nota = notaAttributiProdottiPino(esito, u, "en");

    expect(nota).toContain("InCittà catalogue");
    expect(nota).toContain("no products");
  });
});

function comprensioneCompleta(frase: string) {
  return analizzaComprensionePino(frase);
}

test.describe("S4.3 — vincoli verso i tool e il fallback", () => {
  test("gli attributi arrivano solo agli strumenti che leggono il catalogo", () => {
    const u = comprensioneCompleta("Cerco una borsa di pelle nera");
    const invocazioni = applicaAttributiProdottiPino(
      [
        { tool: "searchProducts", params: { query: "borsa", limit: 8 } },
        { tool: "searchAll", params: { query: "borsa" } },
        { tool: "searchStores", params: { query: "borsa" } },
      ],
      u
    );

    expect(invocazioni[0].params).toEqual({
      query: "borsa",
      limit: 8,
      colori: ["nero"],
      materiali: ["pelle"],
    });
    expect(invocazioni[1].params).toEqual({
      query: "borsa",
      colori: ["nero"],
      materiali: ["pelle"],
    });
    expect(invocazioni[2].params).toEqual({ query: "borsa" });
  });

  test("richiesta senza attributi: nessun parametro aggiunto", () => {
    const u = comprensioneCompleta("Cerco una borsa");
    expect(attributiProdottiPino(u)).toBeNull();

    const invocazioni = [{ tool: "searchProducts", params: { query: "borsa" } }];
    expect(applicaAttributiProdottiPino(invocazioni, u)).toBe(invocazioni);

    const prodotti = [prodotto("Borsa in pelle rossa")];
    const esito = filtraProdottiPerAttributiPino(prodotti, {});
    expect(esito.prodotti).toBe(prodotti);
    expect(esito.esclusi).toBe(0);
  });

  test("fallback: gli attributi restano nei parametri e sono validi per il tool", () => {
    const u = comprensioneCompleta("Cerco una borsa di pelle nera");
    const params = parametriFallbackPiano(undefined, u);

    expect(params).toEqual({ colori: ["nero"], materiali: ["pelle"] });
    const validati = validaToolParams("searchAll", params);
    expect(validati.problemi).toEqual([]);
    expect(validati.params.colori).toEqual(["nero"]);
    expect(validati.params.materiali).toEqual(["pelle"]);
  });

  test("esclusioni e budget preesistenti convivono con colore e materiale", () => {
    const frase = "Cerco una borsa di pelle nera, non in tessuto, entro 50 euro";
    const u = analizzaComprensionePino(frase);
    const params = parametriFallbackPiano(undefined, u, frase);

    expect(params.colori).toEqual(["nero"]);
    // "non in tessuto" è un'esclusione, non un secondo materiale richiesto.
    expect(params.materiali).toEqual(["pelle"]);
    expect(params.maxPrice).toBe(50);

    const validati = validaToolParams("searchProducts", params);
    expect(validati.problemi).toEqual([]);
    expect(validati.params).toEqual(params);
  });

  test("le esclusioni già riconosciute restano nel fallback insieme agli attributi", () => {
    const u = analizzaComprensionePino("Cerco una borsa di pelle nera");
    const params = parametriFallbackPiano(
      undefined,
      { ...u, esclusioni: ["alimentare"] },
      "Cerco una borsa di pelle nera"
    );

    expect(params.esclusioni).toEqual(["alimentare"]);
    expect(params.colori).toEqual(["nero"]);
    expect(params.materiali).toEqual(["pelle"]);
    const validati = validaToolParams("searchProducts", params);
    expect(validati.params).toEqual({
      esclusioni: ["alimentare"],
      colori: ["nero"],
      materiali: ["pelle"],
    });
  });

  test("valori non validi scartati, nessun attributo inventato", () => {
    const validati = validaToolParams("searchProducts", {
      colori: ["", "  ", 42, "nero", "Nero"],
      materiali: "pelle",
    });

    expect(validati.params.colori).toEqual(["nero"]);
    expect(validati.params.materiali).toBeUndefined();
    expect(validati.problemi).toContain("lista_non_valida:materiali");
  });

  test("il budget resta indicativo: i prodotti fuori budget non vengono scartati", () => {
    const attributi = comprensione("Cerco una borsa di pelle nera");
    const pertinenti = [
      prodotto("Borsa in pelle nera", null, null, 70),
      prodotto("Borsa in pelle nera piccola", null, null, 20),
    ];

    const filtrati = filtraProdottiPerAttributiPino(pertinenti, attributi);
    expect(filtrati.prodotti).toHaveLength(2);

    const ordinati = ordinaProdottiPerBudget(filtrati.prodotti, { maxPrice: 50 });
    expect(ordinati.map((p) => p.prezzo)).toEqual([20, 70]);
  });
});
// ─── S4.3 — budget vincolante: conformità dei prodotti ────────────────────
test.describe("S4.3 — conformità al budget esplicito", () => {
  test("prezzi mancanti, zero o negativi non sono mai conformi", () => {
    for (const prezzo of [null, 0, -5]) {
      const candidato = { ...prodotto("Prova"), prezzo } as ProdottoRicerca;
      expect(prodottoRispettaBudgetPino(candidato)).toBe(false);
    }
  });

  test("fascia minima e massima applicate insieme, confini inclusi", () => {
    expect(prodottoRispettaBudgetPino(prodotto("Sotto", null, null, 49.99), { minPrice: 50 })).toBe(false);
    expect(prodottoRispettaBudgetPino(prodotto("Soglia", null, null, 50), { minPrice: 50 })).toBe(true);
    expect(prodottoRispettaBudgetPino(prodotto("Intervallo", null, null, 120), { minPrice: 50, maxPrice: 120 })).toBe(true);
    expect(prodottoRispettaBudgetPino(prodotto("Sopra", null, null, 120.01), { minPrice: 50, maxPrice: 120 })).toBe(false);
  });
});
