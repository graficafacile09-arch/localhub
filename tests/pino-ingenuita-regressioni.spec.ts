import { expect, test } from "@playwright/test";

import {
  costruisciStatoConversazionale,
  estraiPrezzoEsplicitoPino,
  fallbackPlan,
  pianoLocaleIntelligente,
} from "../lib/assistente/semantica";
import { analizzaIntentoPino } from "../lib/assistente/intent";
import {
  cittaMeteoNonCopertaPino,
  pianoIntentoLocale,
} from "../lib/assistente/local-intents";
import { negozioAttivitaCompatibilePino } from "../lib/assistente/tools";
import {
  descriviOrariPino,
  rilevaRichiestaInfoAttivitaPino,
  rispostaInfoAttivitaPino,
} from "../lib/assistente/info-attivita";
import {
  dataCivileRomaPino,
  eventoNelPeriodoPino,
  rilevaPeriodoEventiPino,
} from "../lib/assistente/eventi-periodo";
import { rilevaRiferimentoRisultatoPino } from "../lib/assistente/conversazione";
import { ordinaCategorieRegaloPino } from "../lib/assistente/gift-retrieval";
import type { Orari } from "../types/negozio";

function piano(query: string) {
  return pianoLocaleIntelligente(query, analizzaIntentoPino(query));
}

// ─── Budget con articolo ─────────────────────────────────────────────────────
// "sotto i 10" è la forma italiana più comune; prima l'articolo faceva perdere
// il vincolo e la query restava "olio sotto 10".

test.describe("Pino — importi con articolo", () => {
  const CASI: Array<[string, number | null, number | null]> = [
    ["olio sotto i 10", null, 10],
    ["olio sopra i 20", 20, null],
    ["olio tra i 10 e i 20", 10, 20],
    ["olio entro l'8", null, 8],
    ["olio sopra le 20", 20, null],
    ["olio sotto €10", null, 10],
  ];

  for (const [frase, minPrice, maxPrice] of CASI) {
    test(`${frase} → ${minPrice}/${maxPrice}`, () => {
      expect(estraiPrezzoEsplicitoPino(frase)).toEqual({ minPrice, maxPrice });
      const p = piano(frase);
      expect(p?.minPrice ?? null).toBe(minPrice);
      expect(p?.maxPrice ?? null).toBe(maxPrice);
      expect(p?.query).toBe("olio");
      expect(p?.query).not.toMatch(/\b(?:sotto|sopra|tra|entro|i|le|l)\b|\d/);
    });
  }

  test("un nuovo budget con articolo sostituisce quello precedente", () => {
    const stato = costruisciStatoConversazionale([
      { role: "user", content: "cerco una TV sotto 500 euro" },
      { role: "assistant", content: "Ecco alcune TV." },
      { role: "user", content: "e sotto i 300?" },
    ]);

    expect(stato.maxPrice).toBe(300);
    expect(stato.minPrice).toBeNull();
    expect(stato.query).toContain("tv");
  });
});

// ─── Nomi di attività: vetrine, non prodotti ────────────────────────────────

test.describe("Pino — nomi di attività", () => {
  const ATTIVITA: Array<[string, RegExp]> = [
    ["pizzeria", /^pizzeria$/],
    ["pizzerie a Castrovillari", /^pizzerie?$/],
    ["pizzeria aperta ora", /^pizzeria$/],
    ["ristorante", /^ristorante$/],
    ["panificio", /^panificio$/],
    ["bar", /^bar$/],
    ["negozio di abbigliamento", /^negozio(?: di)? abbigliamento$/],
  ];

  for (const [frase, queryAttesa] of ATTIVITA) {
    test(`${frase} → searchStores`, () => {
      const p = piano(frase);
      expect(p, frase).not.toBeNull();
      expect(p?.surface, frase).toBe("stores");
      expect(p?.query, frase).toMatch(queryAttesa);
    });
  }

  test("il prodotto resta un prodotto", () => {
    expect(piano("pizza")?.surface).toBe("products");
    expect(piano("pizze")?.surface).toBe("products");
    expect(piano("pasta")?.surface).toBe("products");
  });

  test("il fallback conosce le attività", () => {
    expect(fallbackPlan("pizzeria", analizzaIntentoPino("pizzeria")).surface).toBe(
      "stores"
    );
    expect(fallbackPlan("panificio", analizzaIntentoPino("panificio")).surface).toBe(
      "stores"
    );
  });

  test("apertura ora resta un filtro, non parte della query", () => {
    const p = piano("pizzeria aperta ora");
    expect(p?.openNow).toBe(true);
    expect(p?.query).toBe("pizzeria");
  });

  test("la cornice informativa non inquina la query della vetrina", () => {
    expect(piano("a che ora chiude il panificio?")?.query).toBe("panificio");
    expect(piano("dove si trova la pizzeria Da Mario?")?.query).toBe(
      "pizzeria da mario"
    );
  });

  test("un panificio non è una pizzeria solo perché vende pizza", () => {
    const panificio = {
      nome: "Panificio Zini",
      categoria: "Panificio",
      descrizione: "Pane, pizza e prodotti da forno artigianali",
    };
    expect(negozioAttivitaCompatibilePino(panificio, "pizzeria")).toBe(false);
    expect(negozioAttivitaCompatibilePino(panificio, "panificio")).toBe(true);
    expect(
      negozioAttivitaCompatibilePino(
        { nome: "Pizzeria Da Mario", categoria: "Pizzeria" },
        "pizzeria"
      )
    ).toBe(true);
    expect(
      negozioAttivitaCompatibilePino(
        { nome: "Bar Centrale", categoria: "Bar" },
        "bar"
      )
    ).toBe(true);
    // Una query senza nome di attività non subisce il gate.
    expect(negozioAttivitaCompatibilePino(panificio, "olio")).toBe(true);
  });
});

// ─── Articoli elisi nel soggetto ────────────────────────────────────────────

test.describe("Pino — articoli elisi", () => {
  test("l'olio e quanto costa l'olio non perdono il soggetto", () => {
    for (const frase of ["l'olio", "dell'olio", "quanto costa l'olio?"]) {
      const p = piano(frase);
      expect(p, frase).not.toBeNull();
      expect(p?.surface, frase).toBe("products");
      expect(p?.query, frase).toBe("olio");
    }
  });
});

// ─── Meteo: mai dati di Castrovillari per un'altra città ───────────────────

test.describe("Pino — copertura del meteo", () => {
  test("riconosce una città non coperta", () => {
    expect(cittaMeteoNonCopertaPino("che tempo fa a Roma?")).toBe("roma");
    expect(cittaMeteoNonCopertaPino("piove a milano?")).toBe("milano");
    expect(cittaMeteoNonCopertaPino("previsioni per Cosenza")).toBe("cosenza");
  });

  test("Castrovillari e le domande senza città restano coperte", () => {
    expect(cittaMeteoNonCopertaPino("che tempo fa a Castrovillari?")).toBeNull();
    expect(cittaMeteoNonCopertaPino("che tempo fa domani?")).toBeNull();
    expect(cittaMeteoNonCopertaPino("com'è il tempo a casa?")).toBeNull();
  });

  test("la richiesta resta un intento meteo, gestito con onestà", () => {
    expect(pianoIntentoLocale("che tempo fa a Roma?")).toEqual({
      tool: "getWeather",
    });
  });
});

// ─── Informazioni pubblicate su un'attività ────────────────────────────────

test.describe("Pino — orari, indirizzo e telefono", () => {
  test("riconosce la domanda informativa, non una ricerca", () => {
    expect(rilevaRichiestaInfoAttivitaPino("a che ora chiude il panificio?")).toBe("orari");
    expect(rilevaRichiestaInfoAttivitaPino("quando apre il bar?")).toBe("orari");
    expect(rilevaRichiestaInfoAttivitaPino("orari del panificio")).toBe("orari-settimanali");
    expect(rilevaRichiestaInfoAttivitaPino("dove si trova la pizzeria Da Mario?")).toBe(
      "indirizzo"
    );
    expect(rilevaRichiestaInfoAttivitaPino("qual è il telefono del bar?")) .toBe("telefono");
    expect(rilevaRichiestaInfoAttivitaPino("panificio aperto ora")).toBeNull();
    expect(rilevaRichiestaInfoAttivitaPino("cerco un panificio")).toBeNull();
  });

  test("formatta solo gli orari realmente registrati", () => {
    const orari: Orari = {
      giovedì: {
        chiuso: false,
        apertura1: "09:00",
        chiusura1: "13:00",
        apertura2: "15:00",
        chiusura2: "19:00",
      },
      domenica: {
        chiuso: true,
        apertura1: "",
        chiusura1: "",
        apertura2: "",
        chiusura2: "",
      },
    };

    expect(descriviOrariPino(orari, { giorno: "giovedì" })).toBe(
      "oggi (giovedì): 09:00–13:00, 15:00–19:00"
    );
    expect(descriviOrariPino(orari, { completo: true })).toContain("domenica: chiuso");
    expect(descriviOrariPino(null)).toBeNull();
  });

  test("la risposta usa indirizzo e telefono del negozio e dichiara i buchi", () => {
    const negozio = {
      id: "n1",
      nome: "Panificio Zini",
      categoria: "Panificio",
      indirizzo: "Via Roma 1",
      telefono: "0981 123456",
    };
    const orari = new Map([
      [
        "n1",
        {
          lunedì: {
            chiuso: false,
            apertura1: "08:00",
            chiusura1: "13:00",
            apertura2: "",
            chiusura2: "",
          },
        } as Orari,
      ],
    ]);

    const risposta = rispostaInfoAttivitaPino([negozio], "completa", orari);
    expect(risposta).toContain("Panificio Zini");
    expect(risposta).toContain("indirizzo: Via Roma 1");
    expect(risposta).toContain("telefono: 0981 123456");
    expect(risposta).toContain("non lo invento");

    const senzaDati = rispostaInfoAttivitaPino(
      [{ id: "n2", nome: "Bottega", indirizzo: null, telefono: null }],
      "completa",
      new Map()
    );
    expect(senzaDati).toContain("orari non pubblicati");
    expect(senzaDati).toContain("indirizzo non pubblicato");
    expect(senzaDati).toContain("telefono non pubblicato");
  });
});

// ─── Eventi: periodo reale, non keyword ─────────────────────────────────────

test.describe("Pino — periodo degli eventi", () => {
  // Venerdì 6 novembre 2026, mezzogiorno a Roma.
  const venerdi = new Date("2026-11-06T12:00:00+01:00");

  test("traduce oggi, domani e weekend in date civili", () => {
    expect(rilevaPeriodoEventiPino("cosa c'è oggi?", venerdi)).toMatchObject({
      da: "2026-11-06",
      a: "2026-11-06",
    });
    expect(rilevaPeriodoEventiPino("e domani?", venerdi)).toMatchObject({
      da: "2026-11-07",
      a: "2026-11-07",
    });
    expect(rilevaPeriodoEventiPino("cosa c'è questo weekend?", venerdi)).toMatchObject({
      da: "2026-11-07",
      a: "2026-11-08",
    });
    expect(rilevaPeriodoEventiPino("eventi questa settimana", venerdi)).toMatchObject({
      da: "2026-11-06",
      a: "2026-11-08",
    });
    expect(rilevaPeriodoEventiPino("eventi", venerdi)).toBeNull();
  });

  test("filtra per sovrapposizione e non inventa date", () => {
    const weekend = rilevaPeriodoEventiPino("questo weekend", venerdi)!;
    expect(
      eventoNelPeriodoPino({ data_inizio: "2026-11-07T20:00:00+01:00" }, weekend)
    ).toBe(true);
    expect(
      eventoNelPeriodoPino(
        { data_inizio: "2026-11-01T10:00:00+01:00", data_fine: "2026-11-08T22:00:00+01:00" },
        weekend
      )
    ).toBe(true);
    expect(
      eventoNelPeriodoPino({ data_inizio: "2026-11-10T10:00:00+01:00" }, weekend)
    ).toBe(false);
    expect(eventoNelPeriodoPino({ data_inizio: null }, weekend)).toBe(false);
  });

  test("la data civile usa il fuso di Roma, non UTC", () => {
    expect(dataCivileRomaPino("2026-11-06T23:30:00Z")).toBe("2026-11-07");
    expect(dataCivileRomaPino("non-una-data")).toBeNull();
  });
});

// ─── Riferimenti alla lista precedente ──────────────────────────────────────

test.describe("Pino — il secondo, quello lì", () => {
  test("riconosce ordinali e dimostrativi secchi", () => {
    expect(rilevaRiferimentoRisultatoPino("il secondo")).toEqual({
      tipo: "ordinale",
      indice: 1,
      segnale: "il secondo",
    });
    expect(rilevaRiferimentoRisultatoPino("l'ultima")?.tipo).toBe("ordinale");
    expect(rilevaRiferimentoRisultatoPino("quello lì")?.tipo).toBe("dimostrativo");
    expect(rilevaRiferimentoRisultatoPino("secondo me è meglio")).toBeNull();
    expect(rilevaRiferimentoRisultatoPino("il secondo piano del centro commerciale")).toBeNull();
  });
});

// ─── Regali: il destinatario orienta l'ordine ──────────────────────────────

test.describe("Pino — regali per destinatario", () => {
  test("le categorie adatte al destinatario vengono prima, senza escludere le altre", () => {
    const perNonna = ordinaCategorieRegaloPino("nonna");
    expect(perNonna[0]).toBe("profumo");
    expect(perNonna).toHaveLength(12);
    expect(new Set(perNonna).size).toBe(12);

    const perBambino = ordinaCategorieRegaloPino("bambino");
    expect(perBambino.slice(0, 2)).toEqual(["libro", "accessorio"]);

    expect(ordinaCategorieRegaloPino(null)[0]).toBe("orologio");
  });
});
