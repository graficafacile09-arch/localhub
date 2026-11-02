import { expect, test } from "@playwright/test";

import {
  chatConAssistente,
  espandiCategorieGuidaPino,
  filtraLuoghiPertinentiGuidaPino,
  richiestaGuidaAttrazioniPino,
  rispostaGuidaAttrazioniAssentePino,
} from "../lib/assistente/index";
import { searchAttractions } from "../lib/assistente/attrazioni";

// ─── S4.8: luoghi non presenti nella guida Attrazioni ───────────────────────
//
// Una richiesta di un luogo (museo, monumento, castello, teatro...) non è una
// ricerca commerciale. Quando la guida non ha un risultato pertinente Pino
// deve dichiarare l'assenza NELLA GUIDA, senza affermare che il luogo non
// esista in città e senza ripiegare su prodotti o negozi casuali.

const u = (content: string) => ({ role: "user" as const, content });
const rispondi = (content: string) => chatConAssistente([u(content)]);

const GUADAGNI_IT = /guida Attrazioni/i;
const GUADAGNI_EN = /Attractions guide/i;

function nessunRisultatoCommerciale(r: Awaited<ReturnType<typeof chatConAssistente>>) {
  expect(r.negozi).toEqual([]);
  expect(r.prodotti).toEqual([]);
  expect(r.risposta).not.toMatch(/Prodotti trovati|Negozi pertinenti|Products found/);
}

/** La risposta non deve affermare l'inesistenza del luogo in città. */
function nessunaAffermazioneDiInesistenza(testo: string) {
  expect(testo).not.toMatch(/non esiste a Castrovillari|Castrovillari non ha/i);
  expect(testo).not.toMatch(/Castrovillari (?:has no|doesn't have|does not have)/i);
}

test.describe("S4.8 — riconoscimento delle richieste di luoghi", () => {
  test("italiano: museo, monumento, castello, teatro, sito archeologico", () => {
    for (const query of [
      "Vorrei visitare un museo",
      "Dove si trova il castello?",
      "Ci sono monumenti da visitare?",
      "Cerco un teatro",
      "Vorrei visitare un sito archeologico",
    ]) {
      expect(richiestaGuidaAttrazioniPino(query), query).toBe(true);
    }
  });

  test("inglese: musei e monumenti", () => {
    for (const query of [
      "What museums can I visit?",
      "Are there any historical monuments?",
      "Can I visit the Roman amphitheatre?",
    ]) {
      expect(richiestaGuidaAttrazioniPino(query), query).toBe(true);
    }
  });

  test("il cinema resta gestito dal suo ramo dedicato", () => {
    expect(richiestaGuidaAttrazioniPino("Voglio andare al cinema")).toBe(false);
    expect(richiestaGuidaAttrazioniPino("I want to go to the cinema")).toBe(false);
  });

  test("gli acquisti non diventano richieste di luoghi", () => {
    for (const query of [
      "Cerco un negozio di articoli per il teatro",
      "Vorrei comprare un biglietto per il teatro",
      "Cerco un centro commerciale",
      "Voglio una borsa nera",
      "Cerco prodotti per capelli",
      "Voglio comprare uno shampoo",
      "Where can I buy a theatre ticket?",
      "I need a shop for museum souvenirs",
    ]) {
      expect(richiestaGuidaAttrazioniPino(query), query).toBe(false);
    }
  });

  test("le richieste di servizi restano commerciali", () => {
    for (const query of [
      "Cerco un parrucchiere che faccia taglio capelli",
      "Mi serve una piega",
      "I need a haircut",
    ]) {
      expect(richiestaGuidaAttrazioniPino(query), query).toBe(false);
    }
  });
});

test.describe("S4.8 — pertinenza dei risultati della guida", () => {
  test("una richiesta ampia conserva i luoghi della guida", () => {
    for (const query of [
      "Cosa posso visitare a Castrovillari?",
      "Ci sono monumenti da visitare?",
      "What can I visit in Castrovillari?",
      "Are there any historical monuments?",
      "What museums can I visit?",
    ]) {
      const luoghi = searchAttractions(espandiCategorieGuidaPino(query), 6);
      expect(luoghi.length, query).toBeGreaterThan(0);
      expect(filtraLuoghiPertinentiGuidaPino(query, luoghi).length, query).toBe(luoghi.length);
    }
  });

  test("le categorie inglesi vengono ricondotte ai termini del catalogo", () => {
    expect(espandiCategorieGuidaPino("museums")).toBe("museo");
    expect(espandiCategorieGuidaPino("Are there any historical monuments?")).toMatch(/monumenti/);
    expect(espandiCategorieGuidaPino("Are there any archaeological sites?")).toMatch(/archeologico/);
    expect(espandiCategorieGuidaPino("What parks can I visit?")).toMatch(/parco/);
    expect(espandiCategorieGuidaPino("theatres and churches")).toBe("teatro and chiesa");
    // I nomi propri non vengono riscritti.
    expect(espandiCategorieGuidaPino("Teatro Sybaris")).toBe("Teatro Sybaris");
  });

  test("i risultati deboli non passano come luoghi pertinenti", () => {
    const query = "Vorrei visitare un planetario";
    const luoghi = searchAttractions(query, 6);

    // La ricerca della guida restituisce candidati generici (bonus "visitare"),
    // ma nessuno contiene il termine specifico richiesto.
    expect(luoghi.length).toBeGreaterThan(0);
    expect(filtraLuoghiPertinentiGuidaPino(query, luoghi)).toEqual([]);
  });

  test("un nome del catalogo resta pertinente", () => {
    const query = "Vorrei visitare il Teatro Sybaris";
    const luoghi = filtraLuoghiPertinentiGuidaPino(query, searchAttractions(query, 6));

    expect(luoghi.some((luogo) => luogo.nome === "Teatro Sybaris")).toBe(true);
  });
});

test.describe("S4.8 — percorso Attrazioni con risultati", () => {
  test("museo presente: usa la guida e non cerca prodotti", async () => {
    const r = await rispondi("Cerco un museo");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_IT);
    expect(r.risposta).toMatch(/Museo Archeologico/);
  });

  test("attrazione presente: risultati pertinenti conservati", async () => {
    const r = await rispondi("Vorrei visitare il Teatro Sybaris");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_IT);
    expect(r.risposta).toMatch(/Teatro Sybaris/);
  });

  test("richiesta turistica in inglese con risultati", async () => {
    const r = await rispondi("What museums can I visit?");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_EN);
    expect(r.risposta).toMatch(/Museo Archeologico/);
    expect(r.risposta).toMatch(/Open in Google Maps/);
  });

  test("monumenti inglesi: recupera i monumenti presenti", async () => {
    const r = await rispondi("Are there any historical monuments?");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_EN);
    expect(r.risposta).toMatch(/Castello Aragonese/);
    expect(r.risposta).not.toMatch(/doesn't necessarily mean/i);
  });

  test("monumenti inglesi senza punto interrogativo", async () => {
    const r = await rispondi("Historical monuments in Castrovillari");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(/guida Attrazioni|Attractions guide/i);
    expect(r.risposta).toMatch(/Castello Aragonese/);
  });

  test("chiese inglesi: recupera le chiese presenti", async () => {
    const r = await rispondi("Are there any churches?");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_EN);
    expect(r.risposta).toMatch(/Chiesa di San Giuseppe|Santa Maria delle Grazie/);
  });

  test("castelli inglesi: recupera i castelli presenti", async () => {
    const r = await rispondi("Can I visit a castle?");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_EN);
    expect(r.risposta).toMatch(/Castello Aragonese/);
  });

  test("siti archeologici inglesi: recupera i risultati pertinenti", async () => {
    const r = await rispondi("Are there any archaeological sites?");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_EN);
    expect(r.risposta).toMatch(/Museo Archeologico/);
  });

  test("parchi inglesi: recupera i risultati pertinenti", async () => {
    const r = await rispondi("What parks can I visit?");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_EN);
    expect(r.risposta).toMatch(/Parco Nazionale del Pollino/);
  });
});

test.describe("S4.8 — guida senza risultati pertinenti", () => {
  test("museo non presente: risposta circoscritta alla guida", async () => {
    const r = await rispondi("Vorrei visitare il Museo Egizio");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_IT);
    expect(r.risposta).toMatch(/non significa necessariamente/i);
    // Nessuna attrazione della guida viene mostrata come se fosse il museo.
    expect(r.risposta).not.toMatch(/Museo Archeologico|Castello Aragonese/);
    nessunaAffermazioneDiInesistenza(r.risposta);
  });

  test("luogo non presente: nessun prodotto casuale", async () => {
    const r = await rispondi("Vorrei visitare un planetario");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_IT);
    expect(r.risposta).not.toMatch(/Castello Aragonese|Museo Archeologico/);
    nessunaAffermazioneDiInesistenza(r.risposta);
  });

  test("castello non presente: nessun ripiego commerciale", async () => {
    const r = await rispondi("Dove si trova il Castello Svevo?");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_IT);
    expect(r.risposta).not.toMatch(/Castello Aragonese/);
    nessunaAffermazioneDiInesistenza(r.risposta);
  });

  test("teatro non presente: nessun negozio pertinente per caso", async () => {
    const r = await rispondi("Vorrei visitare un teatro dell'opera");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_IT);
    expect(r.risposta).not.toMatch(/Teatro Sybaris/);
    nessunaAffermazioneDiInesistenza(r.risposta);
  });

  test("sito archeologico specifico non presente", async () => {
    const r = await rispondi("Vorrei visitare un sito archeologico preistorico");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_IT);
    expect(r.risposta).not.toMatch(/Museo Archeologico/);
    nessunaAffermazioneDiInesistenza(r.risposta);
  });

  test("museo qualificato in inglese: nessuna invenzione", async () => {
    const r = await rispondi("Egyptian Museum");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(/guida Attrazioni|Attractions guide/i);
    expect(r.risposta).toMatch(/doesn't necessarily mean|non significa necessariamente/i);
    expect(r.risposta).not.toMatch(/Museo Archeologico|Castello Aragonese/);
  });

  test("anfiteatro romano: continua a mancare nella guida", async () => {
    const r = await rispondi("Roman amphitheatre");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(/guida Attrazioni|Attractions guide/i);
    expect(r.risposta).toMatch(/doesn't necessarily mean|non significa necessariamente/i);
    expect(r.risposta).not.toMatch(/Castello Aragonese|Teatro Sybaris/);
  });

  test("richiesta turistica in inglese senza risultati", async () => {
    const r = await rispondi("Can I visit the Roman amphitheatre?");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(GUADAGNI_EN);
    expect(r.risposta).toMatch(/doesn't necessarily mean/i);
    nessunaAffermazioneDiInesistenza(r.risposta);
  });

  test("la risposta localizzata distingue guida e città", () => {
    const it = rispostaGuidaAttrazioniAssentePino("it");
    const en = rispostaGuidaAttrazioniAssentePino("en");

    expect(it).toMatch(GUADAGNI_IT);
    expect(it).toMatch(/non significa necessariamente/i);
    nessunaAffermazioneDiInesistenza(it);

    expect(en).toMatch(GUADAGNI_EN);
    expect(en).toMatch(/doesn't necessarily mean/i);
    nessunaAffermazioneDiInesistenza(en);
  });
});

test.describe("S4.8 — regressioni", () => {
  test("il ramo cinema preesistente resta invariato", async () => {
    const r = await rispondi("Voglio andare al cinema");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).toMatch(/cinema/i);
    expect(r.risposta).toMatch(GUADAGNI_IT);
    expect(r.risposta).not.toMatch(/a Castrovillari non esist/i);
  });

  test("richieste commerciali non vengono dirottate sulla guida", () => {
    for (const query of [
      "Voglio una borsa nera",
      "Cerco prodotti per capelli",
      "Cerco un negozio di abbigliamento",
      "Mi serve una piega",
    ]) {
      expect(richiestaGuidaAttrazioniPino(query), query).toBe(false);
    }
  });
});
