import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  fallbackSelezioneVuotaPino,
  messaggioIndisponibilitaGemini,
  selezioneUtilizzabilePino,
  validaInvocazioniPino,
} from "../lib/assistente/index";

// ─── M5-A: selezione vuota ─────────────────────────────────────────────────
//
// Una risposta Gemini formalmente valida ma senza tool e senza `directReply`
// non è una "nessuna ricerca voluta": è una selezione fallita. Deve valere il
// recupero già esistente (`searchAll`) e, se anche quello è vuoto, il messaggio
// S19 — mai un saluto generico al posto di una ricerca.
//
// `tools: []` CON `directReply` resta invece una risposta diretta valida e non
// deve avviare alcuna ricerca.

const vuoto = {
  negozi: [],
  prodotti: [],
  offerte: [],
  eventi: [],
  categorie: [],
} as const;

test.describe("M5-A — quando la selezione è utilizzabile", () => {
  test("tools: [] senza directReply non è utilizzabile", () => {
    expect(selezioneUtilizzabilePino([], null)).toBe(false);
    expect(selezioneUtilizzabilePino([], undefined)).toBe(false);
    expect(selezioneUtilizzabilePino([], "   ")).toBe(false);
  });

  test("tools: [] con directReply valido resta una risposta diretta", () => {
    expect(
      selezioneUtilizzabilePino([], "Va bene, sono qui! Dimmi pure cosa cerchi.")
    ).toBe(true);
    expect(
      selezioneUtilizzabilePino([], "I'm here! What are you looking for?")
    ).toBe(true);
  });

  test("piano deterministico con risposta diretta: nessuna ricerca", () => {
    // Forma reale dei piani deterministici di identità/piattaforma/chiacchiera.
    const piano = {
      directReply: "InCittà è la piattaforma locale della tua città.",
      tools: [] as Array<{ tool: string; params?: Record<string, unknown> }>,
    };

    expect(selezioneUtilizzabilePino(piano.tools, piano.directReply)).toBe(true);
  });

  test("piano deterministico con invocazioni valide: resta utilizzabile", () => {
    expect(
      selezioneUtilizzabilePino([{ tool: "searchOffers", params: {} }], null)
    ).toBe(true);
    expect(
      selezioneUtilizzabilePino(
        [
          { tool: "searchProducts", params: { query: "borsa" } },
          { tool: "searchStores", params: { query: "pelletteria" } },
          { tool: "getWeather", params: {} },
        ],
        null
      )
    ).toBe(true);
  });

  test("un tool valido e più tool validi: comportamento invariato", () => {
    expect(
      selezioneUtilizzabilePino(
        [{ tool: "searchProducts", params: { query: "pasta" } }],
        null
      )
    ).toBe(true);

    const tre = [
      { tool: "searchProducts", params: { query: "pasta" } },
      { tool: "searchStores", params: { query: "alimentari" } },
      { tool: "searchOffers", params: {} },
    ];
    expect(selezioneUtilizzabilePino(tre, null)).toBe(true);
  });

  test("una risposta diretta prevale anche su invocazioni presenti", () => {
    expect(
      selezioneUtilizzabilePino([{ tool: "searchOffers", params: {} }], "Ok!")
    ).toBe(true);
  });
});

test.describe("M5-A — invocazioni eliminate dal confine S1-A", () => {
  test("tutti i tool rifiutati dalla validazione: selezione non utilizzabile", () => {
    const confine = validaInvocazioniPino([
      { tool: "searchServices" },
      { tool: "searchGifts" },
      { tool: "" },
    ] as never);

    expect(confine.invocazioni).toEqual([]);
    expect(confine.scartate).toHaveLength(3);
    expect(selezioneUtilizzabilePino(confine.invocazioni, null)).toBe(false);
  });

  test("se resta almeno un tool valido la selezione è utilizzabile", () => {
    const confine = validaInvocazioniPino([
      { tool: "searchServices" },
      { tool: "searchProducts", params: { query: "orologio" } },
    ] as never);

    expect(confine.scartate).toEqual(["searchServices"]);
    expect(selezioneUtilizzabilePino(confine.invocazioni, null)).toBe(true);
  });
});

test.describe("M5-A — recupero S19 quando il fallback non trova nulla", () => {
  test("selezione fallita, ricerca alternativa vuota: scatta il messaggio S19", () => {
    // Percorso: selezione LLM vuota → declassata a non utilizzabile → searchAll
    // → nessun risultato → messaggio di indisponibilità.
    const selezioneOk = selezioneUtilizzabilePino([], null);
    expect(selezioneOk).toBe(false);

    expect(
      fallbackSelezioneVuotaPino({ selezioneOk, richiestaServizio: null, ...vuoto })
    ).toBe(true);
  });

  test("se il fallback trova qualcosa il messaggio S19 non compare", () => {
    expect(
      fallbackSelezioneVuotaPino({
        selezioneOk: false,
        richiestaServizio: null,
        ...vuoto,
        negozi: [{ id: "n1" }],
      })
    ).toBe(false);
  });

  test("un catalogo davvero vuoto non è un guasto della selezione", () => {
    expect(
      fallbackSelezioneVuotaPino({ selezioneOk: true, richiestaServizio: null, ...vuoto })
    ).toBe(false);
  });

  test("una richiesta di servizio non usa il fallback S19", () => {
    expect(
      fallbackSelezioneVuotaPino({
        selezioneOk: false,
        richiestaServizio: { servizio: "taglio", attivita: null },
        ...vuoto,
      })
    ).toBe(false);
  });
});

test.describe("M5-A — coerenza italiano/inglese", () => {
  test("il messaggio S19 esiste in entrambe le lingue e non dichiara un catalogo vuoto", () => {
    const it = messaggioIndisponibilitaGemini("it");
    const en = messaggioIndisponibilitaGemini("en");

    expect(it).not.toBe(en);
    expect(it).toMatch(/catalogo/i);
    expect(en).toMatch(/catalogue/i);
    expect(it).toMatch(/riprovare tra poco/i);
    expect(en).toMatch(/try again shortly/i);
    // Mai affermare che il prodotto non esista.
    expect(it).not.toMatch(/non esiste/i);
    expect(en).not.toMatch(/does not exist/i);
  });

  test("la decisione non dipende dalla lingua della risposta diretta", () => {
    expect(selezioneUtilizzabilePino([], "Certo, dimmi pure.")).toBe(true);
    expect(selezioneUtilizzabilePino([], "Sure, tell me what you need.")).toBe(true);
    expect(selezioneUtilizzabilePino([], "")).toBe(false);
  });
});

test.describe("M5-A — posizione del calcolo nel flusso", () => {
  test("il declassamento avviene dopo validazione e deduplica, prima del dispatch", () => {
    const sorgente = readFileSync(
      join(process.cwd(), "lib", "assistente", "index.ts"),
      "utf8"
    );

    const confine = sorgente.indexOf("invocazioni = deduplicaInvocazioniPino(confine.invocazioni);");
    const calcolo = sorgente.indexOf("selezioneUtilizzabilePino(invocazioni, directReply)");
    const dispatch = sorgente.indexOf("eseguiInvocazioniPino(invocazioni, (invocazione) =>");

    expect(confine).toBeGreaterThan(-1);
    expect(calcolo).toBeGreaterThan(confine);
    expect(dispatch).toBeGreaterThan(calcolo);
  });
});
