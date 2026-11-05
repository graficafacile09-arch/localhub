import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  invocazioniConServizioPino,
  messaggioServizioNonTrovatoPino,
  rispostaServizioPino,
} from "../lib/assistente/index";
import { rilevaRichiestaServizioPino } from "../lib/assistente/tools";
import type { NegozioRicerca } from "../lib/ricerca-ai";

// ─── S4.5: richieste di servizio — riconoscimento, ricerca, risposta ──────
//
// `searchStores` supporta `servizio` da S4.4. Qui Pino riconosce la richiesta,
// sostituisce le invocazioni di prodotto con una sola ricerca attività, e
// compone una risposta deterministica con prezzo/durata solo se il tool li ha
// restituiti. Nessun prodotto casuale, nessun negozio fuori tema.

type NegozioConServizi = NegozioRicerca & {
  serviziTrovati?: Array<{ nome: string; prezzo: number | null; durataMin: number | null }>;
};

function negozio(
  nome: string,
  serviziTrovati: NegozioConServizi["serviziTrovati"] = []
): NegozioConServizi {
  return {
    id: nome,
    nome,
    descrizione: null,
    categoria: "Servizi",
    indirizzo: null,
    telefono: null,
    logo_url: null,
    serviziTrovati,
  };
}

test.describe("S4.5 — riconoscimento della richiesta di servizio", () => {
  test("italiano con attività e servizio: «Cerco un parrucchiere che faccia taglio capelli»", () => {
    expect(rilevaRichiestaServizioPino("Cerco un parrucchiere che faccia taglio capelli")).toEqual({
      servizio: "taglio",
      attivita: "parrucchiere",
    });
  });

  test("italiano con costruzione di richiesta: «Dove posso fare una piega?»", () => {
    expect(rilevaRichiestaServizioPino("Dove posso fare una piega?")).toEqual({
      servizio: "piega",
      attivita: null,
    });
  });

  test("più servizi richiesti insieme: «Cerco un barbiere per taglio e barba»", () => {
    expect(rilevaRichiestaServizioPino("Cerco un barbiere per taglio e barba")).toEqual({
      servizio: "taglio barba",
      attivita: "barbiere",
    });
  });

  test("attività composta: «Cerco un centro estetico che faccia manicure»", () => {
    expect(rilevaRichiestaServizioPino("Cerco un centro estetico che faccia manicure")).toEqual({
      servizio: "manicure",
      attivita: "centro estetico",
    });
  });

  test("inglese: «I need a haircut» e «Where can I get my hair cut?»", () => {
    expect(rilevaRichiestaServizioPino("I need a haircut")).toEqual({
      servizio: "taglio",
      attivita: null,
    });
    expect(rilevaRichiestaServizioPino("Where can I get my hair cut?")).toEqual({
      servizio: "taglio",
      attivita: null,
    });
  });
});

test.describe("S4.5 — nessuna confusione con negozi e prodotti", () => {
  test("ricerca generica di negozi: nessun servizio riconosciuto", () => {
    expect(rilevaRichiestaServizioPino("Cerco un negozio di abbigliamento")).toBeNull();
    expect(rilevaRichiestaServizioPino("Cerco un negozio")).toBeNull();
  });

  test("ricerca di prodotti: nessun servizio riconosciuto", () => {
    expect(rilevaRichiestaServizioPino("Cerco una borsa nera")).toBeNull();
    expect(rilevaRichiestaServizioPino("I need a black leather bag")).toBeNull();
    // «colore» è un attributo di prodotto, non un servizio.
    expect(rilevaRichiestaServizioPino("Cerco un maglione di colore rosso")).toBeNull();
  });

  test("senza richiesta di servizio le invocazioni restano identiche", () => {
    const invocazioni = [{ tool: "searchProducts", params: { query: "borsa" } }];
    expect(invocazioniConServizioPino(invocazioni, null)).toBe(invocazioni);
  });
});

test.describe("S4.5 — passaggio del parametro a searchStores", () => {
  test("servizio e soggetto attività arrivano nei parametri", () => {
    const richiesta = rilevaRichiestaServizioPino("Cerco un parrucchiere che faccia taglio capelli");
    const invocazioni = invocazioniConServizioPino(
      [
        { tool: "searchProducts", params: { query: "taglio" } },
        { tool: "searchAll", params: { query: "capelli" } },
      ],
      richiesta,
      { esclusioni: ["alimentare"], citta: "Cosenza" }
    );

    expect(invocazioni).toEqual([
      {
        tool: "searchStores",
        params: {
          servizio: "taglio",
          limit: 8,
          query: "parrucchiere",
          esclusioni: ["alimentare"],
          citta: "Cosenza",
        },
      },
    ]);
  });

  test("senza soggetto attività la query resta al chiamante, il servizio è valorizzato", () => {
    const richiesta = rilevaRichiestaServizioPino("Dove posso fare una piega?");
    const invocazioni = invocazioniConServizioPino([], richiesta);

    expect(invocazioni).toHaveLength(1);
    expect(invocazioni[0].tool).toBe("searchStores");
    expect(invocazioni[0].params?.servizio).toBe("piega");
    expect(invocazioni[0].params?.query).toBeUndefined();
  });

  test("il budget indicativo non diventa un filtro rigido nelle ricerche di servizio", () => {
    const richiesta = rilevaRichiestaServizioPino(
      "Cerco un barbiere per taglio e barba sotto 30 euro"
    );
    const invocazioni = invocazioniConServizioPino([], richiesta);

    expect(invocazioni[0].params?.servizio).toBe("taglio barba");
    expect("maxPrice" in (invocazioni[0].params ?? {})).toBe(false);
    expect("minPrice" in (invocazioni[0].params ?? {})).toBe(false);
  });
});

test.describe("S4.5 — prezzo e durata nella risposta", () => {
  test("servizio con prezzo e durata", () => {
    const risposta = rispostaServizioPino(
      [negozio("Barberia del centro", [{ nome: "Taglio capelli", prezzo: 18, durataMin: 30 }])],
      "taglio"
    );

    expect(risposta).toContain("Barberia del centro");
    expect(risposta).toContain("Taglio capelli");
    expect(risposta).toContain("18");
    expect(risposta).toContain("30 minuti");
  });

  test("prezzo mancante: dichiarato, non inventato", () => {
    const risposta = rispostaServizioPino(
      [negozio("Centro estetico", [{ nome: "Manicure", prezzo: null, durataMin: 40 }])],
      "manicure"
    );

    expect(risposta).toContain("Manicure");
    expect(risposta).toContain("prezzo non indicato");
    expect(risposta).toContain("40 minuti");
    expect(risposta).not.toMatch(/€\s?0\\b/);
  });

  test("durata mancante: dichiarata, non attribuita", () => {
    const risposta = rispostaServizioPino(
      [negozio("Barberia", [{ nome: "Taglio barba", prezzo: 8, durataMin: null }])],
      "taglio barba"
    );

    expect(risposta).toContain("Taglio barba");
    expect(risposta).toContain("8");
    expect(risposta).toContain("durata non indicata");
  });

  test("due servizi: nessun prezzo attribuito al servizio sbagliato", () => {
    const risposta = rispostaServizioPino(
      [
        negozio("Barberia", [
          { nome: "Taglio capelli", prezzo: 18, durataMin: 30 },
          { nome: "Barba", prezzo: 8, durataMin: null },
        ]),
      ],
      "taglio barba"
    );

    expect(risposta).toContain("Taglio capelli: €18 · circa 30 minuti");
    expect(risposta).toContain("Barba: €8 · durata non indicata");
  });

  test("servizio solo nei tag: nessun prezzo o durata inventati", () => {
    const risposta = rispostaServizioPino([negozio("Parrucchieri Rossi")], "taglio");

    expect(risposta).toContain("Parrucchieri Rossi");
    expect(risposta).toContain("offre taglio");
    expect(risposta).not.toContain("€");
    expect(risposta).not.toMatch(/minuti/);
  });

  test("risposta inglese: prezzo e durata assenti dichiarati in inglese", () => {
    const risposta = rispostaServizioPino(
      [negozio("Barber Shop", [{ nome: "Haircut", prezzo: null, durataMin: null }])],
      "taglio",
      "en"
    );

    expect(risposta).toContain("Barber Shop");
    expect(risposta).toContain("price not stated");
    expect(risposta).toContain("duration not stated");
  });
});

test.describe("S4.5 — servizio non trovato", () => {
  test("messaggio onesto e circoscritto al catalogo, in italiano", () => {
    const testo = messaggioServizioNonTrovatoPino("idraulico");

    expect(testo).toContain("catalogo InCittà");
    expect(testo).toContain("idraulico");
    expect(testo).not.toMatch(/castrovillari|non esiste/i);
  });

  test("stesso messaggio quando il tool non restituisce attività", () => {
    const risposta = rispostaServizioPino([], "idraulico");

    expect(risposta).toBe(messaggioServizioNonTrovatoPino("idraulico"));
  });

  test("messaggio inglese equivalente", () => {
    const testo = messaggioServizioNonTrovatoPino("plumber", "en");

    expect(testo).toContain("InCittà catalogue");
    expect(testo).toContain("plumber");
  });

  test("nessun prodotto casuale: dalle invocazioni spariscono i tool di prodotto", () => {
    const richiesta = rilevaRichiestaServizioPino("I need a haircut");
    const invocazioni = invocazioniConServizioPino(
      [
        { tool: "searchProducts", params: { query: "taglio" } },
        { tool: "searchOffers", params: {} },
      ],
      richiesta
    );

    expect(invocazioni.map((t) => t.tool)).toEqual(["searchStores"]);
  });

  test("il recupero semantico e il fallback generico non scattano per un servizio", () => {
    const sorgente = readFileSync(
      join(process.cwd(), "lib", "assistente", "index.ts"),
      "utf8"
    );

    // Il recupero che allarga la query e il searchAll di sicurezza sono
    // disattivati quando la richiesta è un servizio: nessun negozio fuori tema.
    expect(sorgente).toMatch(/!richiestaServizio\s*&&\s*negozi\.length === 0/);
    expect(sorgente).toContain("if (!selezioneOk && !richiestaServizio)");
    expect(sorgente).toContain("else if (!directReply && !toolsEseguiti && !richiestaServizio)");
    expect(sorgente).toMatch(/!richiestaServizio\s*&&\s*!isExplicitFoodProductRequest\(domanda\)/);
  });
});
