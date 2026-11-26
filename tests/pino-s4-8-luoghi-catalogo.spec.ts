import { expect, test } from "@playwright/test";

import {
  chatConAssistente,
  espandiCategorieGuidaPino,
  filtraLuoghiPertinentiGuidaPino,
  richiestaGuidaAttrazioniPino,
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

  test("un riferimento alla città non attiva la guida: «Cerco scarpe a Castrovillari» resta commerciale", () => {
    for (const query of [
      "Cerco scarpe a Castrovillari",
      "Dove posso comprare scarpe a Castrovillari?",
      "Scarpe in centro a Castrovillari",
    ]) {
      expect(richiestaGuidaAttrazioniPino(query), query).toBe(false);
    }

    // I nomi specifici del catalogo continuano a essere riconosciuti.
    expect(richiestaGuidaAttrazioniPino("Archivio di Stato – Sezione di Castrovillari")).toBe(true);
    expect(richiestaGuidaAttrazioniPino("Palazzo Varcasia")).toBe(true);
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

test.describe("S4.8 — luoghi raccontati dai contenuti del sito", () => {
  test("museo: nessun risultato commerciale e nessuna guida Attrazioni", async () => {
    const r = await rispondi("Cerco un museo");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).not.toMatch(/guida Attrazioni|Attractions guide/i);
    expect(r.risposta.length).toBeGreaterThan(0);
  });

  test("Castello Aragonese: la risposta viene dalla scheda Castrovillari", async () => {
    const r = await rispondi("Castello Aragonese");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).not.toMatch(/guida Attrazioni|Attractions guide/i);
    expect(r.risposta).toMatch(/Castello Aragonese/);
    expect(r.risposta).toMatch(/Castrovillari/);
  });

  test("richiesta inglese con città: usa la scheda del comune", async () => {
    const r = await rispondi("Historical monuments in Castrovillari");

    nessunRisultatoCommerciale(r);
    expect(r.risposta).not.toMatch(/guida Attrazioni|Attractions guide/i);
    expect(r.risposta).toMatch(/Castrovillari/);
  });

  test("luogo senza riscontro nei testi: nessuna invenzione", async () => {
    for (const query of [
      "Egyptian Museum",
      "Roman amphitheatre",
      "Can I visit the Roman amphitheatre?",
      "Are there any churches?",
      "Are there any archaeological sites?",
    ]) {
      const r = await rispondi(query);

      nessunRisultatoCommerciale(r);
      expect(r.risposta, query).not.toMatch(/guida Attrazioni|Attractions guide/i);
      expect(r.risposta, query).toMatch(
        /non ha più una guida ai luoghi|no longer has a guide to places/i
      );
      nessunaAffermazioneDiInesistenza(r.risposta);
    }
  });

  test("parchi: la risposta arriva dai dati Territorio", async () => {
    for (const query of [
      "Vorrei visitare un parco",
      "quali parchi posso visitare?",
      "What parks can I visit?",
    ]) {
      const r = await rispondi(query);

      nessunRisultatoCommerciale(r);
      expect(r.motivoUscita, query).toBe("conoscenza");
      expect(r.risposta, query).not.toMatch(/guida Attrazioni|Attractions guide/i);
      expect(r.risposta, query).toMatch(/Pollino|Sila|Aspromonte/);
    }
  });

  test("richiesta generica: parla di luoghi, non di attrazioni", async () => {
    for (const query of [
      "Cosa posso visitare?",
      "consigliami un posto da visitare",
      "cosa posso visitare a Castrovillari?",
    ]) {
      const r = await rispondi(query);

      nessunRisultatoCommerciale(r);
      expect(r.motivoUscita, query).toBe("conoscenza");
      expect(r.risposta, query).not.toMatch(/guida Attrazioni|Attractions guide/i);
    }
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
