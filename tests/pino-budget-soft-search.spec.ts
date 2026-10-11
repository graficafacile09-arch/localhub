import { expect, test } from "@playwright/test";

import { ordinaProdottiPerBudget, prezzoNumerico, prodottoHaPrezzoReale } from "../lib/assistente/tools";
import type { ProdottoRicerca } from "../lib/ricerca-ai";
import { interpretaRichiestaPino } from "../lib/assistente/semantica";
import { analizzaIntentoPino } from "../lib/assistente/intent";
import type { PinoMemoriaVoce } from "../lib/assistente/memoria";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const prodotto = (
  id: string,
  nome: string,
  prezzo: unknown,
  categoria = "Accessori"
): ProdottoRicerca => ({
  id,
  negozio_id: "negozio-1",
  nome,
  descrizione: null,
  categoria,
  prezzo: prezzo as number,
  negozio_nome: "Negozio di prova",
  immagine_principale: null,
});

const ids = (prodotti: ProdottoRicerca[]) => prodotti.map((p) => p.id);
const prezzi = (prodotti: ProdottoRicerca[]) =>
  prodotti.map((p) => prezzoNumerico(p.prezzo));

// ─── Il budget è una PREFERENZA, non un filtro ───────────────────────────────

test.describe("Pino — budget come preferenza nell'ordinamento prodotti", () => {
  test("non elimina i prodotti fuori budget: restano come alternative", () => {
    const risultati = ordinaProdottiPerBudget(
      [prodotto("lussuoso", "Orologio di lusso", 199), prodotto("economico", "Orologio base", 49)],
      { maxPrice: 30 }
    );
    // Nessun prodotto viene scartato; entrambi sono fuori budget e restano in
    // ordine di prezzo crescente.
    expect(risultati).toHaveLength(2);
    expect(ids(risultati)).toEqual(["economico", "lussuoso"]);
  });

  test("prima quelli entro budget, poi le alternative, sempre dal più economico", () => {
    const risultati = ordinaProdottiPerBudget(
      [
        prodotto("a", "A", 120),
        prodotto("b", "B", 20),
        prodotto("c", "C", 15),
        prodotto("d", "D", 35),
      ],
      { maxPrice: 30 }
    );
    // Entro budget: 15, 20 · fuori budget: 35, 120.
    expect(ids(risultati)).toEqual(["c", "b", "d", "a"]);
  });

  test("tutti sopra budget: nulla viene scartato e l'ordine è crescente", () => {
    const risultati = ordinaProdottiPerBudget(
      [prodotto("x", "A", 90), prodotto("y", "B", 40), prodotto("z", "C", 60)],
      { maxPrice: 25 }
    );
    expect(risultati).toHaveLength(3);
    expect(prezzi(risultati)).toEqual([40, 60, 90]);
  });

  test("prodotti senza prezzo valido finiscono in coda, senza essere scartati", () => {
    const risultati = ordinaProdottiPerBudget(
      [
        prodotto("senza", "Senza prezzo", null),
        prodotto("zero", "Prezzo zero (dato demo)", 0),
        prodotto("valido", "Con prezzo", 10),
      ],
      { maxPrice: 30 }
    );
    expect(ids(risultati)).toEqual(["valido", "senza", "zero"]);
  });

  test("minPrice e maxPrice definiscono la fascia preferita", () => {
    const risultati = ordinaProdottiPerBudget(
      [prodotto("basso", "A", 5), prodotto("dentro", "B", 50), prodotto("alto", "C", 80)],
      { minPrice: 40, maxPrice: 100 }
    );
    expect(ids(risultati)).toEqual(["dentro", "alto", "basso"]);
  });

  test("senza budget l'ordine è comunque per prezzo crescente", () => {
    const risultati = ordinaProdottiPerBudget([
      prodotto("alto", "A", 80),
      prodotto("basso", "B", 5),
      prodotto("medio", "C", 40),
    ]);
    expect(ids(risultati)).toEqual(["basso", "medio", "alto"]);
  });
});

// ─── Prezzi in formati diversi ───────────────────────────────────────────────

test.describe("Pino — normalizzazione dei prezzi", () => {
  test("accetta numero, stringa con virgola e stringa con valuta", () => {
    expect(prezzoNumerico(29.9)).toBeCloseTo(29.9);
    expect(prezzoNumerico("29,90")).toBeCloseTo(29.9);
    expect(prezzoNumerico("€ 12,50")).toBeCloseTo(12.5);
    expect(prezzoNumerico("15")).toBeCloseTo(15);
  });

  test("il filtro di ricerca Pino non scarta prezzi decimali italiani come 99,00", () => {
    expect(prodottoHaPrezzoReale(99)).toBe(true);
    expect(prodottoHaPrezzoReale("99,00")).toBe(true);
    expect(prodottoHaPrezzoReale("€ 99,00")).toBe(true);
    expect(prodottoHaPrezzoReale("0")).toBe(false);
    expect(prodottoHaPrezzoReale("non disponibile")).toBe(false);
  });

  test("un prezzo non numerico non diventa un numero inventato", () => {
    expect(prezzoNumerico("abc")).toBeNull();
    expect(prezzoNumerico("")).toBeNull();
    expect(prezzoNumerico(null)).toBeNull();
    expect(prezzoNumerico(undefined)).toBeNull();
    expect(prezzoNumerico(NaN)).toBeNull();
  });

  test("l'ordinamento funziona anche con formati misti", () => {
    const risultati = ordinaProdottiPerBudget(
      [
        prodotto("virgola", "A", "19,90"),
        prodotto("numero", "B", 25),
        prodotto("valuta", "C", "€ 9,90"),
      ],
      { maxPrice: 20 }
    );
    // Entro budget (≤20): 9,90 e 19,90 · fuori budget: 25.
    expect(ids(risultati)).toEqual(["valuta", "virgola", "numero"]);
  });
});

// ─── Cataloghi con più categorie ─────────────────────────────────────────────

test.describe("Pino — più categorie nello stesso catalogo", () => {
  test("la fascia di prezzo è indipendente dalla categoria", () => {
    const risultati = ordinaProdottiPerBudget(
      [
        prodotto("libro-1", "Libro", 18, "Libri"),
        prodotto("orologio-1", "Orologio", 99, "Accessori"),
        prodotto("libro-2", "Libro caro", 40, "Libri"),
        prodotto("anello-1", "Anello", 25, "Gioiello"),
      ],
      { maxPrice: 30 }
    );
    expect(ids(risultati)).toEqual(["libro-1", "anello-1", "libro-2", "orologio-1"]);
  });
});

// ─── La valuta/budget non entra nella query di retrieval ─────────────────────

const NESSUNA_MEMORIA: PinoMemoriaVoce[] = [];

async function piano(query: string) {
  return interpretaRichiestaPino(
    query,
    [{ role: "user", content: query }],
    analizzaIntentoPino(query),
    NESSUNA_MEMORIA
  );
}

test.describe("Pino — budget separato dalla query di ricerca", () => {
  test("'cerco un orologio sotto 30 euro' → query 'orologio', maxPrice 30", async () => {
    const p = await piano("cerco un orologio sotto 30 euro");
    expect(p.maxPrice).toBe(30);
    expect(p.query).toContain("orologio");
    // Regressione: la valuta non deve finire nella query (il gate di pertinenza
    // dei prodotti richiede TUTTE le parole e azzererebbe i risultati).
    expect(p.query).not.toMatch(/euro|eur|budget|\b30\b/);
  });

  test("'regalo per mia moglie, budget 30 euro' → nessun token di valuta/budget", async () => {
    const p = await piano("vorrei un regalo per mia moglie, budget 30 euro");
    expect(p.maxPrice).toBe(30);
    expect(p.query).not.toMatch(/euro|eur|budget|\b30\b/);
  });

  test("'voglio un orologio, ho 100 euro' interpreta l'importo come budget e cerca solo il soggetto", async () => {
    const p = await piano("voglio un orologio, ho 100 euro");
    expect(p.maxPrice).toBe(100);
    expect(p.query).toMatch(/orologio/i);
    expect(p.query).not.toMatch(/euro|eur|budget|\b100\b|\bho\b/i);
  });

  test("'ho 100 euro per un orologio' mantiene il soggetto e separa il budget", async () => {
    const p = await piano("ho 100 euro per un orologio");
    expect(p.maxPrice).toBe(100);
    expect(p.query).toMatch(/orologio/i);
    expect(p.query).not.toMatch(/euro|eur|budget|\b100\b|\bho\b/i);
  });

  test("il range di prezzo non lascia numeri o valuta nella query", async () => {
    const p = await piano("scarpe tra 50 e 120 euro");
    expect(p.minPrice).toBe(50);
    expect(p.maxPrice).toBe(120);
    expect(p.query).toContain("scarpe");
    expect(p.query).not.toMatch(/euro|eur|\b50\b|\b120\b/);
  });

  test("'cerco un orologio con budget di 99 euro' → query 'orologio' e nessun residuo di budget", async () => {
    const p = await piano("cerco un orologio con budget di 99 euro");
    expect(p.maxPrice).toBe(99);
    // Regressione: 'con' (preposizione del vincolo di budget) non deve restare
    // nella query, altrimenti il gate di pertinenza azzera i prodotti.
    expect(p.query).toBe("orologio");
    expect(p.query).not.toMatch(/budget|euro|eur|con|\b99\b/i);
  });

  test("'ho un budget di 100 euro' → importo riconosciuto e nessuna frase di budget nella query", async () => {
    const p = await piano("ho un budget di 100 euro");
    expect(p.maxPrice).toBe(100);
    expect(p.query).not.toMatch(/budget|euro|eur|\b100\b|\bho\b/i);
  });

  test("'ho 99 euro' → importo riconosciuto; la query non contiene la frase di budget", async () => {
    const p = await piano("ho 99 euro");
    expect(p.maxPrice).toBe(99);
    expect(p.query).not.toMatch(/budget|euro|eur|\b99\b|\bho\b/i);
  });

  test("'un orologio da 99 euro' → la preposizione 'da' e il prezzo non restano nella query", async () => {
    const p = await piano("un orologio da 99 euro");
    expect(p.maxPrice).toBe(99);
    expect(p.query).toBe("orologio");
    expect(p.query).not.toMatch(/budget|euro|eur|\bda\b|\b99\b/i);
  });
});
