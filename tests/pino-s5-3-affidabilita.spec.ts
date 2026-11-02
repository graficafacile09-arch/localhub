import { expect, test } from "@playwright/test";

import { mappaProdottoRiga } from "../lib/negozi";
import {
  disponibilitaNettaPino,
  filtraProdottiPerAttributiPino,
  filtraProdottiPerDisponibilitaPino,
  notaDisponibilitaProdottiPino,
  ordinaProdottiPerBudget,
} from "../lib/assistente/tools";
import {
  MASSIMO_INVOCAZIONI_PINO,
  applicaQueryRiservaPino,
  chatConAssistente,
  formattaPrezzoProdottoPino,
  invocazioniRegaloPino,
  soggettoRiservaPino,
  type ToolInvocation,
} from "../lib/assistente/index";
import { analizzaComprensionePino } from "../lib/assistente/semantica";
import type { ProdottoRicerca } from "../lib/ricerca-ai";

// ─── S5.3: affidabilità catalogo ────────────────────────────────────────────
//
// Offline: mapping, filtri e formattazione. La verifica runtime del catalogo
// Supabase non viene eseguita qui.

const u = (content: string) => ({ role: "user" as const, content });

const prodotto = (over: Partial<ProdottoRicerca> = {}): ProdottoRicerca => ({
  id: "1",
  slug: "borsa",
  negozio_id: "negozio-1",
  nome: "Borsa",
  descrizione: null,
  categoria: "Borse",
  prezzo: 49.9,
  negozio_nome: "Negozio",
  immagine_principale: null,
  quantita_disponibile: 5,
  quantita_riservata: 2,
  ha_varianti: false,
  ...over,
});

function comprensione(query: string) {
  return analizzaComprensionePino(query, [u(query)]);
}

test.describe("S5.3 — colore e materiale strutturati", () => {
  test("il mapping espone colore e materiale", () => {
    const dto = mappaProdottoRiga(
      {
        id: 1,
        slug: "borsa",
        negozio_id: "negozio-1",
        nome: "Borsa",
        descrizione: null,
        categoria: "Borse",
        colore: "Nero",
        materiale: "Pelle",
        prezzo: 79.9,
        immagine_principale: null,
        quantita_disponibile: 4,
        quantita_riservata: 1,
        ha_varianti: false,
      },
      "Negozio"
    );

    expect(dto.colore).toBe("Nero");
    expect(dto.materiale).toBe("Pelle");
    expect(dto.negozio_nome).toBe("Negozio");
  });

  test("fallback tollerante: colore e materiale restano nel DTO e filtrano", () => {
    const dto = mappaProdottoRiga({
      id: 2,
      negozio_id: "negozio-1",
      nome: "Borsa",
      descrizione: null,
      categoria: "Borse",
      colore: "nero",
      materiale: "pelle",
      prezzo: 49.9,
    });
    const esito = filtraProdottiPerAttributiPino([dto], {
      colori: ["nero"],
      materiali: ["pelle"],
    });

    expect(dto.colore).toBe("nero");
    expect(dto.materiale).toBe("pelle");
    expect(esito.prodotti).toHaveLength(1);
  });

  test("colore strutturato nero senza colore nella descrizione: confermato", () => {
    const esito = filtraProdottiPerAttributiPino(
      [prodotto({ colore: "nero", descrizione: "Borsa elegante" })],
      { colori: ["nero"] }
    );

    expect(esito.prodotti).toHaveLength(1);
    expect(esito.coloriRiscontrati).toEqual(["nero"]);
    expect(esito.senzaColore).toBe(0);
  });

  test("colore strutturato rosso, richiesta nero: esclusione", () => {
    const esito = filtraProdottiPerAttributiPino(
      [prodotto({ colore: "rosso" })],
      { colori: ["nero"] }
    );

    expect(esito.prodotti).toEqual([]);
    expect(esito.esclusi).toBe(1);
  });

  test("materiale strutturato pelle senza materiale nella descrizione: confermato", () => {
    const esito = filtraProdottiPerAttributiPino(
      [prodotto({ materiale: "pelle", descrizione: "Borsa elegante" })],
      { materiali: ["pelle"] }
    );

    expect(esito.prodotti).toHaveLength(1);
    expect(esito.materialiRiscontrati).toEqual(["pelle"]);
    expect(esito.senzaMateriale).toBe(0);
  });

  test("materiale strutturato tessuto, richiesta pelle: esclusione", () => {
    const esito = filtraProdottiPerAttributiPino(
      [prodotto({ materiale: "tessuto" })],
      { materiali: ["pelle"] }
    );

    expect(esito.prodotti).toEqual([]);
    expect(esito.esclusi).toBe(1);
  });

  test("valori null: prodotto conservato ma non confermato", () => {
    const esito = filtraProdottiPerAttributiPino(
      [prodotto({ colore: null, materiale: null })],
      { colori: ["nero"], materiali: ["pelle"] }
    );

    expect(esito.prodotti).toHaveLength(1);
    expect(esito.senzaColore).toBe(1);
    expect(esito.senzaMateriale).toBe(1);
    expect(esito.coloriRiscontrati).toEqual([]);
    expect(esito.materialiRiscontrati).toEqual([]);
  });

  test("case-insensitive e sinonimi: BLACK/Cuoio equivalgono a nero/pelle", () => {
    const esito = filtraProdottiPerAttributiPino(
      [prodotto({ colore: "BLACK", materiale: "Cuoio" })],
      { colori: ["nero"], materiali: ["pelle"] }
    );

    expect(esito.prodotti).toHaveLength(1);
    expect(esito.coloriRiscontrati).toEqual(["nero"]);
    expect(esito.materialiRiscontrati).toEqual(["pelle"]);
  });
});

test.describe("S5.3 — disponibilità netta", () => {
  test("5 disponibili e 2 riservate: netta 3, acquistabile", () => {
    expect(disponibilitaNettaPino(prodotto({ quantita_disponibile: 5, quantita_riservata: 2 }))).toBe(3);
  });

  test("3 disponibili e 3 riservate: netta 0, non proporre", () => {
    const esito = filtraProdottiPerDisponibilitaPino([
      prodotto({ quantita_disponibile: 3, quantita_riservata: 3 }),
    ]);

    expect(esito.disponibili).toEqual([]);
    expect(esito.nonDisponibili).toHaveLength(1);
  });

  test("0 disponibili e 0 riservate: non proporre", () => {
    const esito = filtraProdottiPerDisponibilitaPino([
      prodotto({ quantita_disponibile: 0, quantita_riservata: 0 }),
    ]);

    expect(esito.disponibili).toEqual([]);
    expect(esito.nonDisponibili).toHaveLength(1);
  });

  test("dati mancanti: disponibilità non verificata, non esaurita", () => {
    const esito = filtraProdottiPerDisponibilitaPino([
      prodotto({ quantita_disponibile: null, quantita_riservata: null }),
    ]);

    expect(disponibilitaNettaPino(prodotto({ quantita_disponibile: null, quantita_riservata: null }))).toBeNull();
    expect(esito.disponibili).toHaveLength(1);
    expect(esito.nonDisponibili).toEqual([]);
    expect(esito.nonVerificati).toHaveLength(1);
  });

  test("tutti esauriti: messaggio che distingue dal catalogo vuoto", () => {
    const esito = filtraProdottiPerDisponibilitaPino([
      prodotto({ id: "1", quantita_disponibile: 0, quantita_riservata: 0 }),
      prodotto({ id: "2", quantita_disponibile: 3, quantita_riservata: 3 }),
    ]);
    const nota = notaDisponibilitaProdottiPino(esito);

    expect(nota).toContain("Ho trovato 2 prodotti pertinenti");
    expect(nota).toContain("nessuno ha disponibilità netta positiva");
    expect(nota).not.toContain("Non trovo risultati");
  });

  test("risultati misti: disponibili proposti, esauriti distinti", () => {
    const esito = filtraProdottiPerDisponibilitaPino([
      prodotto({ id: "1" }),
      prodotto({ id: "2", quantita_disponibile: 0, quantita_riservata: 0 }),
    ]);
    const nota = notaDisponibilitaProdottiPino(esito);

    expect(esito.disponibili.map((p) => p.id)).toEqual(["1"]);
    expect(nota).toContain("Un altro prodotto pertinente");
  });
});

test.describe("S5.3 — prezzi e varianti", () => {
  test("senza varianti: prezzo normale", () => {
    expect(formattaPrezzoProdottoPino(prodotto({ prezzo: 49.9 }))).toBe("€49.9");
  });

  test("con varianti: A partire da", () => {
    expect(formattaPrezzoProdottoPino(prodotto({ prezzo: 29.9, ha_varianti: true }))).toBe(
      "A partire da €29.9"
    );
  });

  test("prezzo null: Prezzo non disponibile, mai zero", () => {
    const senzaPrezzo = { ...prodotto(), prezzo: null } as unknown as ProdottoRicerca;

    expect(formattaPrezzoProdottoPino(senzaPrezzo)).toBe("Prezzo non disponibile");
  });

  test("budget indicativo: i prodotti sopra budget restano", () => {
    const ordinati = ordinaProdottiPerBudget(
      [prodotto({ id: "caro", prezzo: 120 }), prodotto({ id: "entro", prezzo: 80 })],
      { maxPrice: 100 }
    );

    expect(ordinati.map((p) => p.id)).toEqual(["entro", "caro"]);
    expect(ordinati).toHaveLength(2);
  });
});

test.describe("S5.3 — regressioni", () => {
  test("soggetto di riserva S5.2.1", () => {
    expect(soggettoRiservaPino("borsa")).toBe("borsa");
    expect(soggettoRiservaPino("prodotto")).toBeNull();
    const invocazioni: ToolInvocation[] = [{ tool: "searchProducts", params: { query: "" } }];
    expect(applicaQueryRiservaPino(invocazioni, comprensione("Cerco una borsa")).at(0)?.params?.query).toBe(
      "borsa"
    );
  });

  test("massimo tre invocazioni e regalo", () => {
    expect(invocazioniRegaloPino().length).toBeLessThanOrEqual(MASSIMO_INVOCAZIONI_PINO);
  });

  test("preferenza linguistica preservata", async () => {
    const r = await chatConAssistente([u("I speak English")]);

    expect(r.risposta).toMatch(/english/i);
    expect(r.prodotti).toEqual([]);
  });

  test("esclusioni preservate", () => {
    expect(comprensione("Cerco una borsa nera non in tessuto").esclusioni).toEqual(["tessuto"]);
  });
});
