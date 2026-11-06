import { expect, test } from "@playwright/test";

import {
  costruisciStatoConversazionale,
  estraiPrezzoEsplicitoPino,
  fallbackPlan,
  pianoLocaleIntelligente,
} from "../lib/assistente/semantica";
import { analizzaIntentoPino, pianoIntento } from "../lib/assistente/intent";
import {
  cittaMeteoNonCopertaPino,
  pianoIntentoLocale,
} from "../lib/assistente/local-intents";
import {
  fraseQualificazionePino,
  negozioAttivitaCompatibilePino,
  negozioProfessioneCompatibilePino,
  pulisciCorniceRicercaPino,
} from "../lib/assistente/tools";
import {
  richiestaConsiglioFarmacoPino,
  rispostaFarmacieDeterministica,
} from "../lib/assistente/index";
import { richiestaRistorazionePino } from "../lib/assistente/routing-policy";
import { estraiCitta } from "../lib/localita";
import {
  descriviOrariPino,
  estraiSoggettoInfoAttivitaPino,
  giornoRichiestoPino,
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

  test("la domanda di prezzo non perde il soggetto alimento", () => {
    for (const [frase, atteso] of [
      ["quanto costa la pasta?", "pasta"],
      ["quanto costa il pane?", "pane"],
    ] as const) {
      const pianoProdotto = pianoLocaleIntelligente(frase, analizzaIntentoPino(frase));
      expect(pianoProdotto?.surface, frase).toBe("products");
      expect(pianoProdotto?.query, frase).toBe(atteso);
    }
    const analisi = analizzaIntentoPino("quanto costa l'olio?");
    const invocazioni = pianoIntento(analisi, "quanto costa l'olio?");
    expect(invocazioni.some((t) => t.tool === "searchProducts" && t.query === "olio")).toBe(
      true
    );
    // Un'attività non deve tornare a essere cercata come prodotto.
    const pizzeria = pianoIntento(analizzaIntentoPino("pizzeria"), "pizzeria");
    expect(pizzeria.every((t) => t.tool === "searchStores")).toBe(true);
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

test.describe("Pino — ristorazione e professioni", () => {
  test("«dove mangiare» e «ho fame» restano richieste di ristorazione", () => {
    for (const frase of [
      "dove posso mangiare?",
      "consigliami un posto per mangiare",
      "vorrei mangiare qualcosa",
      "ho fame",
      "where can I eat?",
      "I'm hungry",
    ]) {
      expect(richiestaRistorazionePino(frase), frase).toBe(true);
    }
    for (const frase of ["pane", "pizzeria", "vorrei mangiare una pizza"]) {
      expect(richiestaRistorazionePino(frase), frase).toBe(false);
    }
  });

  test("un otorino non viene presentato come dentista", () => {
    const otorino = {
      nome: "Dott. Bianchi Otorino",
      categoria: "Salute e benessere",
      data: { tipo_attivita: "Otorinolaringoiatra" },
    };
    expect(negozioProfessioneCompatibilePino(otorino, "dentista")).toBe(false);
    expect(negozioProfessioneCompatibilePino(otorino, "medico")).toBe(true);
    expect(
      negozioProfessioneCompatibilePino(
        { nome: "Studio Dentistico Rossi", categoria: "Salute e benessere" },
        "dentista"
      )
    ).toBe(true);
    expect(
      negozioProfessioneCompatibilePino(
        { nome: "Parrucchieri Rossi", categoria: "Bellezza" },
        "parrucchiere"
      )
    ).toBe(true);
  });
});

// ─── Città e qualificazioni ──────────────────────────────────────────────────

test.describe("Pino — cornice di ricerca e sicurezza farmaci", () => {
  test("la cornice conversazionale non nasconde il soggetto", () => {
    expect(pulisciCorniceRicercaPino("Mi trovi il Panificio Zini")).toBe("panificio zini");
    expect(pulisciCorniceRicercaPino("Vorrei comprare olio")).toBe("olio");
    expect(pulisciCorniceRicercaPino("Mi serve un idraulico")).toBe("idraulico");
    // Il budget viene estratto separatamente da `normalizzaQueryCatalogo`: la
    // cornice «mi consigli» non deve restare nella query, il soggetto sì.
    expect(pulisciCorniceRicercaPino("Mi consigli un regalo sotto 20 euro")).toBe(
      "regalo"
    );
    expect(pulisciCorniceRicercaPino("panificio zini")).toBe("panificio zini");
  });

  test("un consiglio su un farmaco non diventa una prescrizione", () => {
    expect(richiestaConsiglioFarmacoPino("Ho mal di testa, che farmaco prendo?")).toBe(true);
    expect(richiestaConsiglioFarmacoPino("Qual è la farmacia di turno?")).toBe(false);

    const risposta = rispostaFarmacieDeterministica(
      [
        {
          id: "f1",
          nome: "Caterini-Filpo",
          indirizzo: "Corso Giuseppe Garibaldi, 205/207",
          stato: "turno",
          apertura: null,
          turno: "Tutto il giorno fino a domani",
          telefono: "098121293",
          urlScheda: null,
        },
      ],
      "turno",
      undefined,
      "it",
      { consiglioFarmaco: true }
    );

    expect(risposta).toContain("Non posso consigliarti un farmaco");
    expect(risposta).toContain("farmacista");
    expect(risposta).toContain("Caterini-Filpo");
  });
});

test.describe("Pino — città e qualificazioni", () => {
  test("la città è un vincolo di luogo, non una qualifica del prodotto", () => {
    expect(estraiCitta("pasta a Roma")).toBe("roma");
    expect(piano("pasta a Roma")?.city).toBe("roma");
    expect(fraseQualificazionePino("pasta a Roma", "pasta")).toBeNull();
    expect(fraseQualificazionePino("pasta under 5 euros", "pasta")).toBeNull();
  });

  test("una qualifica reale resta una qualifica", () => {
    expect(fraseQualificazionePino("pasta senza glutine", "pasta")).toBe("pasta senza glutine");
  });
});

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
    expect(rilevaRichiestaInfoAttivitaPino("panificio aperto ora")).toBe("stato");
    expect(rilevaRichiestaInfoAttivitaPino("il panificio Zini è aperto ora?")).toBe("stato");
    expect(rilevaRichiestaInfoAttivitaPino("il panificio Zini è aperto la domenica?")).toBe(
      "orari"
    );
    expect(rilevaRichiestaInfoAttivitaPino("cerco un panificio")).toBeNull();
  });

  test("estrae il soggetto dalle cornici informative", () => {
    expect(estraiSoggettoInfoAttivitaPino("a che ora chiude il panificio?")).toBe("panificio");
    expect(estraiSoggettoInfoAttivitaPino("orari del panificio Zini")).toBe("panificio zini");
    expect(estraiSoggettoInfoAttivitaPino("qual e il telefono del panificio Zini?")).toBe(
      "panificio zini"
    );
    expect(estraiSoggettoInfoAttivitaPino("where is Panificio Zini?")).toBe("panificio zini");
    expect(estraiSoggettoInfoAttivitaPino("il panificio Zini e aperto ora?")).toBe("panificio zini");
    expect(estraiSoggettoInfoAttivitaPino("il panificio Zini e aperto la domenica?")).toBe(
      "panificio zini"
    );
    expect(piano("qual e il telefono del panificio Zini?")?.query).toBe("panificio zini");
  });

  test("lo stato aperto/ora è verificato, non dedotto", () => {
    const risposta = rispostaInfoAttivitaPino(
      [{ id: "n1", nome: "Panificio Zini", categoria: "Panificio" }],
      "stato",
      new Map()
    );
    expect(risposta).toContain("Panificio Zini");
    expect(risposta).toContain("stato non verificabile");
    expect(risposta).not.toMatch(/\baperto ora\b/);
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
    expect(descriviOrariPino(orari, { giorno: "domenica", etichetta: "giorno" })).toBe(
      "domenica: chiuso"
    );
    expect(descriviOrariPino(orari, { completo: true })).toContain("domenica: chiuso");
    expect(descriviOrariPino(null)).toBeNull();
    expect(
      giornoRichiestoPino("il panificio è aperto domenica?", new Date("2026-11-06T12:00:00+01:00"))
    ).toBe("domenica");
    expect(
      giornoRichiestoPino("il panificio è aperto domani?", new Date("2026-11-06T12:00:00+01:00"))
    ).toBe("sabato");
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

    const rispostaGiorno = rispostaInfoAttivitaPino(
      [{ id: "n1", nome: "Panificio Zini", categoria: "Panificio" }],
      "orari",
      new Map([
        [
          "n1",
          {
            domenica: {
              chiuso: true,
              apertura1: "",
              chiusura1: "",
              apertura2: "",
              chiusura2: "",
            },
          } as Orari,
        ],
      ]),
      "it",
      { giorno: "domenica" }
    );
    expect(rispostaGiorno).toContain("domenica: chiuso");

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
