import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  deduplicaPerId,
  filtraProdottiPerSoggettoUnico,
  ordinaProdottiPerBudget,
  prezzoNumerico,
  rilevaBudgetIndicativoPino,
} from "../lib/assistente/tools";
import { fallbackTestuale } from "../lib/assistente/index";
import type { RisultatiRecuperati } from "../lib/assistente/prompt";
import type { ProdottoRicerca } from "../lib/ricerca-ai";

// ─── S2: budget indicativo (D-1, opzione B) ─────────────────────────────────
//
// Il budget esplicito dell'utente è una PREFERENZA, non un filtro:
//  - privilegia i prodotti entro la cifra, senza eliminare le alternative;
//  - la pertinenza resta il criterio fondamentale (un prodotto fuori tema non
//    diventa accettabile perché costa poco);
//  - quando un prodotto supera il budget lo si dice, senza dichiarare conforme
//    ciò che non lo è e senza inventare prezzi.

const prodotto = (nome: string, prezzo: number | null): ProdottoRicerca =>
  ({
    id: nome.toLowerCase().replace(/\s+/g, "-"),
    negozio_id: "negozio-1",
    nome,
    descrizione: null,
    categoria: null,
    prezzo,
    negozio_nome: "Bottega locale",
    immagine_principale: null,
  }) as ProdottoRicerca;

const risultati = (
  prodotti: ProdottoRicerca[]
): RisultatiRecuperati => ({
  negozi: [],
  prodotti: prodotti.map((p) => ({
    nome: p.nome,
    prezzo: p.prezzo as number,
    negozio_nome: p.negozio_nome,
    categoria: p.categoria,
    descrizione: p.descrizione,
  })),
  offerte: [],
  eventi: [],
  categorie: [],
  meteo: null,
  farmacie: [],
});

const nomi = (prodotti: ProdottoRicerca[]): string[] => prodotti.map((p) => p.nome);

// ─── Riconoscimento della cifra ─────────────────────────────────────────────

test.describe("S2 — riconoscimento del budget indicativo", () => {
  test("italiano: formule di tetto e importo in euro", () => {
    expect(rilevaBudgetIndicativoPino("Cerco un regalo entro 50 euro")).toBe(50);
    expect(rilevaBudgetIndicativoPino("Vorrei qualcosa sotto i 30 €")).toBe(30);
    expect(rilevaBudgetIndicativoPino("budget di 25 euro")).toBe(25);
    expect(rilevaBudgetIndicativoPino("al massimo 40 euro")).toBe(40);
    expect(rilevaBudgetIndicativoPino("non oltre 60 €")).toBe(60);
    expect(rilevaBudgetIndicativoPino("spendere 35 euro")).toBe(35);
    expect(rilevaBudgetIndicativoPino("€ 18,50")).toBe(18.5);
  });

  test("inglese: stesso significato dell'italiano", () => {
    expect(rilevaBudgetIndicativoPino("I want a gift under 50 euros")).toBe(50);
    expect(rilevaBudgetIndicativoPino("something up to €40")).toBe(40);
    expect(rilevaBudgetIndicativoPino("budget of 25 please")).toBe(25);
    expect(rilevaBudgetIndicativoPino("less than 30 euro")).toBe(30);
    expect(rilevaBudgetIndicativoPino("at most 60 eur")).toBe(60);
  });

  test("un minimo non diventa un tetto", () => {
    expect(rilevaBudgetIndicativoPino("Voglio qualcosa sopra 50 euro")).toBeNull();
    expect(rilevaBudgetIndicativoPino("I want something over 50 euros")).toBeNull();
    expect(rilevaBudgetIndicativoPino("almeno 30 €")).toBeNull();
    expect(rilevaBudgetIndicativoPino("minimo 20 euro")).toBeNull();
    expect(rilevaBudgetIndicativoPino("more than 40 euros")).toBeNull();
  });

  test("durate temporali: un numero di giorni o ore non è un budget", () => {
    expect(rilevaBudgetIndicativoPino("entro 2 giorni")).toBeNull();
    expect(rilevaBudgetIndicativoPino("sotto i 3 giorni")).toBeNull();
    expect(rilevaBudgetIndicativoPino("fino a 5 ore")).toBeNull();
    expect(rilevaBudgetIndicativoPino("entro una settimana")).toBeNull();
    expect(rilevaBudgetIndicativoPino("in 3 hours")).toBeNull();
    expect(rilevaBudgetIndicativoPino("within 2 days")).toBeNull();
    expect(rilevaBudgetIndicativoPino("consegna in 10 minuti")).toBeNull();
  });

  test("una durata non nasconde una cifra monetaria nella stessa frase", () => {
    expect(rilevaBudgetIndicativoPino("entro 2 giorni, sotto 50 euro")).toBe(50);
    expect(rilevaBudgetIndicativoPino("consegna in 3 ore, budget massimo 100 euro")).toBe(100);
    expect(rilevaBudgetIndicativoPino("entro 5 giorni, under 40 euros")).toBe(40);
  });

  test("formulazioni monetarie esplicite restano riconosciute", () => {
    expect(rilevaBudgetIndicativoPino("budget massimo 100 euro")).toBe(100);
    expect(rilevaBudgetIndicativoPino("entro 50 euro")).toBe(50);
    expect(rilevaBudgetIndicativoPino("sotto i 30 €")).toBe(30);
    expect(rilevaBudgetIndicativoPino("under 50 euros")).toBe(50);
  });

  test("nessuna cifra: nessun budget inventato", () => {
    for (const testo of ["", "   ", null, undefined, "Cerco un regalo", "non ho budget"]) {
      expect(rilevaBudgetIndicativoPino(testo as string)).toBeNull();
    }
    expect(rilevaBudgetIndicativoPino("entro 0 euro")).toBeNull();
  });
});

// ─── Ordinamento: privilegiare, non escludere ───────────────────────────────

test.describe("S2 — il budget ordina, non elimina", () => {
  test("entro 50 € con prodotti da 20, 45 e 70: entro budget prima, il 70 resta", () => {
    const prodotti = [
      prodotto("Regalo da 70", 70),
      prodotto("Regalo da 20", 20),
      prodotto("Regalo da 45", 45),
    ];

    const ordinati = ordinaProdottiPerBudget(prodotti, { maxPrice: 50 });

    expect(nomi(ordinati)).toEqual(["Regalo da 20", "Regalo da 45", "Regalo da 70"]);
    expect(ordinati).toHaveLength(3);
    // Nessun prodotto pertinente viene scartato dal budget.
    expect(nomi(ordinati)).toEqual(expect.arrayContaining(nomi(prodotti)));
  });

  test("solo prodotti da 60 e 80: restano entrambi e diventano le alternative", () => {
    const ordinati = ordinaProdottiPerBudget(
      [prodotto("Regalo da 60", 60), prodotto("Regalo da 80", 80)],
      { maxPrice: 50 }
    );

    expect(nomi(ordinati)).toEqual(["Regalo da 60", "Regalo da 80"]);
  });

  test("prezzo economico ma fuori tema: il gate lo esclude comunque", () => {
    const cuffie = prodotto("Cuffie Bluetooth", 45);
    const paneEconomico = prodotto("Pane casereccio", 2);

    const pertinenti = filtraProdottiPerSoggettoUnico([paneEconomico, cuffie], "cuffie");
    const ordinati = ordinaProdottiPerBudget(pertinenti, { maxPrice: 50 });

    expect(nomi(ordinati)).toEqual(["Cuffie Bluetooth"]);
    expect(nomi(ordinati)).not.toContain("Pane casereccio");
  });

  test("fascia di prezzo: il significato della fascia resta quello, senza esclusioni", () => {
    const ordinati = ordinaProdottiPerBudget(
      [
        prodotto("Sopra la fascia", 70),
        prodotto("Sotto la fascia", 15),
        prodotto("In fascia", 35),
        prodotto("Limite massimo", 50),
        prodotto("Limite minimo", 20),
      ],
      { minPrice: 20, maxPrice: 50 }
    );

    expect(nomi(ordinati)).toEqual([
      "Limite minimo",
      "In fascia",
      "Limite massimo",
      "Sotto la fascia",
      "Sopra la fascia",
    ]);
    expect(ordinati).toHaveLength(5);
  });

  test("senza budget il comportamento è invariato (ordine di pertinenza intatto)", () => {
    const prodotti = [
      prodotto("Primo pertinente", 70),
      prodotto("Secondo pertinente", 20),
      prodotto("Terzo pertinente", 45),
    ];
    const perNome: Record<string, number> = {
      "Primo pertinente": 1,
      "Secondo pertinente": 2,
      "Terzo pertinente": 3,
    };

    const ordinati = ordinaProdottiPerBudget(prodotti, {}, (a, b) => {
      return (perNome[a.nome] ?? 0) - (perNome[b.nome] ?? 0);
    });

    expect(nomi(ordinati)).toEqual([
      "Primo pertinente",
      "Secondo pertinente",
      "Terzo pertinente",
    ]);
  });

  test("prezzi mancanti o non validi restano reali e finiscono in coda", () => {
    const senzaPrezzo = prodotto("Prezzo non pubblicato", null);
    const prezzoNonValido = { ...prodotto("Prezzo non valido", null), prezzo: "abc" } as unknown as ProdottoRicerca;

    expect(prezzoNumerico(senzaPrezzo.prezzo)).toBeNull();
    expect(prezzoNumerico(prezzoNonValido.prezzo)).toBeNull();

    const ordinati = ordinaProdottiPerBudget(
      [senzaPrezzo, prodotto("Con prezzo", 45), prezzoNonValido],
      { maxPrice: 50 }
    );
    expect(nomi(ordinati)).toEqual([
      "Con prezzo",
      "Prezzo non pubblicato",
      "Prezzo non valido",
    ]);
  });

  test("duplicati: nessuna regressione rispetto alla deduplica di S1", () => {
    const doppioneA = prodotto("Regalo da 20", 20);
    const doppioneB = { ...doppioneA, prezzo: 20 };
    const senzaDuplicati = deduplicaPerId(
      ordinaProdottiPerBudget([doppioneA, doppioneB, prodotto("Regalo da 70", 70)], {
        maxPrice: 50,
      })
    );

    expect(nomi(senzaDuplicati)).toEqual(["Regalo da 20", "Regalo da 70"]);
  });
});

// ─── Comunicazione trasparente ──────────────────────────────────────────────

test.describe("S2 — comunicazione del budget nelle risposte", () => {
  test("prodotti entro e oltre budget: lo dice e segnala i fuori budget", () => {
    const risposta = fallbackTestuale(
      risultati([prodotto("Regalo da 20", 20), prodotto("Regalo da 45", 45), prodotto("Regalo da 70", 70)]),
      "",
      undefined,
      undefined,
      50
    );

    expect(risposta).toContain("Ho trovato 3 prodotti");
    expect(risposta).toContain("entro il budget di €50");
    expect(risposta).toContain("poi le alternative più care");
    // Solo il prodotto oltre soglia viene segnalato.
    expect(risposta).toContain("**Regalo da 70** — €70");
    expect(risposta).toMatch(/Regalo da 70[^\n]*oltre il budget/);
    expect(risposta).not.toMatch(/Regalo da 20[^\n]*oltre il budget/);
    expect(risposta).not.toMatch(/Regalo da 45[^\n]*oltre il budget/);
  });

  test("solo prodotti oltre budget: nessuna dichiarazione di conformità", () => {
    const risposta = fallbackTestuale(
      risultati([prodotto("Regalo da 60", 60), prodotto("Regalo da 80", 80)]),
      "",
      undefined,
      undefined,
      50
    );

    expect(risposta).toContain("Nessun prodotto rientra nel budget di €50");
    expect(risposta).toContain("alternative");
    expect(risposta).not.toContain("entro il budget di €50.");
    expect(risposta).not.toContain("prodotti entro il budget");
    expect(risposta).toMatch(/Regalo da 60[^\n]*oltre il budget/);
    expect(risposta).toMatch(/Regalo da 80[^\n]*oltre il budget/);
  });

  test("tutti entro budget: può dichiararlo senza ambiguità", () => {
    const risposta = fallbackTestuale(
      risultati([prodotto("Regalo da 20", 20), prodotto("Regalo da 45", 45)]),
      "",
      undefined,
      undefined,
      50
    );

    expect(risposta).toContain("Ho trovato 2 prodotti entro il budget di €50");
    expect(risposta).not.toContain("oltre il budget");
  });

  test("prezzo mancante: nessun prezzo inventato e nessuna conformità dichiarata", () => {
    const risposta = fallbackTestuale(
      risultati([prodotto("Prezzo non pubblicato", null), prodotto("Regalo da 70", 70)]),
      "",
      undefined,
      undefined,
      50
    );

    expect(risposta).not.toContain("€null");
    expect(risposta).toContain("prezzo non disponibile");
    expect(risposta).toContain("prezzo pubblicato");
    expect(risposta).not.toContain("Ho trovato 2 prodotti entro il budget");
    expect(risposta).toMatch(/Regalo da 70[^\n]*oltre il budget/);
  });

  test("senza budget nessuna menzione economica aggiunta", () => {
    const risposta = fallbackTestuale(
      risultati([prodotto("Regalo da 70", 70)]),
      "",
      undefined,
      undefined,
      null
    );

    expect(risposta).toContain("Ho trovato 1 prodotto che corrisponde alla tua ricerca");
    expect(risposta).not.toContain("budget");
    expect(risposta).not.toContain("oltre il budget");
  });

  test("la risposta non espone direttive interne sul prezzo", () => {
    const risposta = fallbackTestuale(
      risultati([prodotto("Regalo da 20", 20), prodotto("Regalo da 70", 70)]),
      "",
      undefined,
      undefined,
      50
    );

    expect(risposta).not.toContain("Preferenza di prezzo");
    expect(risposta).not.toContain("mostra prima");
    expect(risposta).not.toContain("budget indicativo");
    expect(risposta).not.toContain("fascia indicata");
    expect(risposta).not.toMatch(/_Preferenza/);
  });

  test("l'orchestratore non passa la nota interna alla risposta finale", () => {
    // Guardia di cablaggio: la notaVincolo resta nel contesto tecnico e non
    // deve tornare a essere il secondo argomento della risposta utente.
    const sorgente = readFileSync(
      join(process.cwd(), "lib", "assistente", "index.ts"),
      "utf8"
    );
    expect(sorgente).toMatch(/fallbackTestuale\(/);
    expect(sorgente).not.toMatch(/fallbackTestuale\(\s*risultati,\s*notaVincolo/);
  });

  test("inglese: stessa trasparenza del percorso italiano", () => {
    const risposta = fallbackTestuale(
      risultati([prodotto("Gift 40", 40), prodotto("Gift 70", 70)]),
      "",
      undefined,
      undefined,
      50,
      "en"
    );

    expect(risposta).toContain("within the €50 budget");
    expect(risposta).toContain("more expensive alternatives");
    expect(risposta).toMatch(/Gift 70[^\n]*over budget/);
    expect(risposta).not.toMatch(/Gift 40[^\n]*over budget/);
  });
});
