import { expect, test } from "@playwright/test";

import { invocazioniConServizioPino } from "../lib/assistente/index";
import { rilevaRichiestaServizioPino, validaToolParams } from "../lib/assistente/tools";

// ─── S4.7: richieste indirette di servizio ────────────────────────────────
//
// Il riconoscimento S4.5 richiedeva il nome esplicito del servizio. Qui Pino
// comprende anche la prestazione descritta in modo indiretto («sistemarmi i
// capelli», «someone to do my hair») senza inventare un taglio quando il testo
// non lo dice. Le parole generiche e i prodotti restano fuori: «prodotti per
// capelli», «shampoo», «spazzola» non attivano `servizio`.

test.describe("S4.7 — formulazioni indirette italiane", () => {
  test("«Mi serve qualcuno per i capelli»: servizio capelli, nessuna attività inventata", () => {
    expect(rilevaRichiestaServizioPino("Mi serve qualcuno per i capelli")).toEqual({
      servizio: "capelli",
      attivita: null,
    });
  });

  test("«Ho bisogno di sistemarmi i capelli»: capelli", () => {
    expect(rilevaRichiestaServizioPino("Ho bisogno di sistemarmi i capelli")).toEqual({
      servizio: "capelli",
      attivita: null,
    });
  });

  test("«Dove posso sistemare la barba?»: barba", () => {
    expect(rilevaRichiestaServizioPino("Dove posso sistemare la barba?")).toEqual({
      servizio: "barba",
      attivita: null,
    });
  });

  test("«Vorrei farmi fare una manicure»: manicure", () => {
    expect(rilevaRichiestaServizioPino("Vorrei farmi fare una manicure")).toEqual({
      servizio: "manicure",
      attivita: null,
    });
  });

  test("«Mi serve una piega»: piega", () => {
    expect(rilevaRichiestaServizioPino("Mi serve una piega")).toEqual({
      servizio: "piega",
      attivita: null,
    });
  });

  test("«Cerco qualcuno che mi faccia la tinta»: tinta", () => {
    expect(rilevaRichiestaServizioPino("Cerco qualcuno che mi faccia la tinta")).toEqual({
      servizio: "tinta",
      attivita: null,
    });
  });

  test("«Vorrei sistemarmi i capelli»: capelli, non taglio inventato", () => {
    expect(rilevaRichiestaServizioPino("Vorrei sistemarmi i capelli")).toEqual({
      servizio: "capelli",
      attivita: null,
    });
  });

  test("«Cerco un parrucchiere che mi sistemi i capelli»: attività conservata", () => {
    expect(rilevaRichiestaServizioPino("Cerco un parrucchiere che mi sistemi i capelli")).toEqual({
      servizio: "capelli",
      attivita: "parrucchiere",
    });
  });
});

test.describe("S4.7 — formulazioni indirette inglesi", () => {
  test("«I need someone to do my hair»: capelli", () => {
    expect(rilevaRichiestaServizioPino("I need someone to do my hair")).toEqual({
      servizio: "capelli",
      attivita: null,
    });
  });

  test("«Where can I get my beard trimmed?»: barba", () => {
    expect(rilevaRichiestaServizioPino("Where can I get my beard trimmed?")).toEqual({
      servizio: "barba",
      attivita: null,
    });
  });

  test("«I need a manicure»: manicure", () => {
    expect(rilevaRichiestaServizioPino("I need a manicure")).toEqual({
      servizio: "manicure",
      attivita: null,
    });
  });

  test("«I want to get my hair dyed»: tinta", () => {
    expect(rilevaRichiestaServizioPino("I want to get my hair dyed")).toEqual({
      servizio: "tinta",
      attivita: null,
    });
  });

  test("«I need someone to do my hair» non diventa un prodotto", () => {
    const invocazioni = invocazioniConServizioPino(
      [{ tool: "searchProducts", params: { query: "hair" } }],
      rilevaRichiestaServizioPino("I need someone to do my hair")
    );
    expect(invocazioni.map((t) => t.tool)).toEqual(["searchStores"]);
    expect(invocazioni[0].params?.servizio).toBe("capelli");
  });
});

test.describe("S4.7 — prodotti che NON sono servizi", () => {
  test("«Cerco prodotti per capelli»", () => {
    expect(rilevaRichiestaServizioPino("Cerco prodotti per capelli")).toBeNull();
  });

  test("«Voglio comprare uno shampoo»", () => {
    expect(rilevaRichiestaServizioPino("Voglio comprare uno shampoo")).toBeNull();
  });

  test("«Cerco una spazzola per capelli»", () => {
    expect(rilevaRichiestaServizioPino("Cerco una spazzola per capelli")).toBeNull();
  });

  test("«Cerco un prodotto per la barba»: la parola barba non basta", () => {
    expect(rilevaRichiestaServizioPino("Cerco un prodotto per la barba")).toBeNull();
  });

  test("«Cerco un negozio di abbigliamento»", () => {
    expect(rilevaRichiestaServizioPino("Cerco un negozio di abbigliamento")).toBeNull();
  });

  test("«Voglio una borsa nera»", () => {
    expect(rilevaRichiestaServizioPino("Voglio una borsa nera")).toBeNull();
  });

  test("prestazione ambigua: nessun servizio inventato", () => {
    expect(rilevaRichiestaServizioPino("Vorrei qualcosa per i capelli")).toBeNull();
    expect(rilevaRichiestaServizioPino("Mi serve qualcuno")).toBeNull();
    expect(rilevaRichiestaServizioPino("Cerco capelli")).toBeNull();
  });
});

test.describe("S4.7 — compatibilità con S4.5", () => {
  test("richieste esplicite invariate", () => {
    expect(rilevaRichiestaServizioPino("Cerco un parrucchiere che faccia taglio capelli")).toEqual({
      servizio: "taglio",
      attivita: "parrucchiere",
    });
    expect(rilevaRichiestaServizioPino("Dove posso fare una piega?")).toEqual({
      servizio: "piega",
      attivita: null,
    });
    expect(rilevaRichiestaServizioPino("Cerco un barbiere per taglio e barba")).toEqual({
      servizio: "taglio barba",
      attivita: "barbiere",
    });
    expect(rilevaRichiestaServizioPino("I need a haircut")).toEqual({
      servizio: "taglio",
      attivita: null,
    });
  });

  test("le richieste generiche non ricevono il parametro servizio", () => {
    const invocazioni = [{ tool: "searchStores", params: { query: "pizzeria" } }];
    expect(invocazioniConServizioPino(invocazioni, null)).toBe(invocazioni);

    const validati = validaToolParams("searchStores", { query: "pizzeria" });
    expect(validati.params).toEqual({ query: "pizzeria" });
    expect("servizio" in validati.params).toBe(false);
  });

  test("servizio indiretto: nessun doppione e nessuna attività inventata", () => {
    const risultato = rilevaRichiestaServizioPino("Mi serve qualcuno per i capelli");
    expect(risultato?.servizio).toBe("capelli");
    expect(risultato?.attivita).toBeNull();
    expect(risultato?.servizio.split(" ")).toHaveLength(1);
  });
});
