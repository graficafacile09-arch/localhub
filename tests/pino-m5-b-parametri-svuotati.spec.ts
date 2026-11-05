import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  fallbackSelezioneVuotaPino,
  parametriInvocazioneSvuotatiPino,
  selezioneUtilizzabilePino,
  validaInvocazioniPino,
  type ToolInvocation,
} from "../lib/assistente/index";
import { validaToolParams } from "../lib/assistente/tools";

// ─── M5-B: parametri presenti ma svuotati dalla validazione ────────────────
//
// Un'invocazione con parametri esplicitamente forniti che la validazione ha
// eliminato per intero non deve diventare una ricerca generica: per
// `searchOffers`/`searchEvents` il vuoto significa "tutti", per
// `searchProducts`/`searchStores` scatta la query di fallback della
// conversazione. Il filtro sta dentro `validaInvocazioniPino`, prima di
// deduplica e limite, e lascia fuori i follow-up.

const inv = (tool: string, params?: unknown): ToolInvocation[] =>
  [{ tool, ...(params === undefined ? {} : { params }) }] as unknown as ToolInvocation[];

const confineDi = (
  tool: string,
  params?: unknown,
  opzioni?: { followUp?: boolean }
) => validaInvocazioniPino(inv(tool, params), opzioni);

test.describe("M5-B — parametri assenti o generici restano validi", () => {
  test("getWeather senza parametri: valido", () => {
    const esito = confineDi("getWeather");
    expect(esito.invocazioni).toHaveLength(1);
    expect(esito.invocazioni[0].params).toEqual({});
    expect(esito.parametriScartati).toEqual([]);
  });

  test("getCategories senza parametri: valido", () => {
    const esito = confineDi("getCategories");
    expect(esito.invocazioni).toHaveLength(1);
    expect(esito.parametriScartati).toEqual([]);
  });

  test("getWeather con {foo: 1}: valido (strumento senza parametri)", () => {
    const esito = confineDi("getWeather", { foo: 1 });
    expect(esito.invocazioni).toHaveLength(1);
    expect(esito.parametriScartati).toEqual([]);
    expect(validaToolParams("getWeather", { foo: 1 }).problemi).toEqual(["chiave_non_ammessa:foo"]);
  });

  test("searchOffers senza parametri: valido", () => {
    expect(confineDi("searchOffers").invocazioni).toHaveLength(1);
  });

  test("searchOffers con {}: valido", () => {
    const esito = confineDi("searchOffers", {});
    expect(esito.invocazioni).toHaveLength(1);
    expect(esito.invocazioni[0].params).toEqual({});
    expect(esito.parametriScartati).toEqual([]);
  });

  test("searchOffers con query null: valido (tutte le offerte)", () => {
    expect(confineDi("searchOffers", { query: null }).invocazioni).toHaveLength(1);
  });

  test("searchOffers con query vuota: valido (tutte le offerte)", () => {
    expect(confineDi("searchOffers", { query: "" }).invocazioni).toHaveLength(1);
    expect(confineDi("searchOffers", { query: "   " }).invocazioni).toHaveLength(1);
  });

  test("searchEvents con query vuota: valido (tutti gli eventi)", () => {
    expect(confineDi("searchEvents", { query: "" }).invocazioni).toHaveLength(1);
  });
});

test.describe("M5-B — parametri tutti rifiutati: invocazione scartata", () => {
  test("searchOffers con {sconto: 20, colore: \"nero\"}: scartato", () => {
    const esito = confineDi("searchOffers", { sconto: 20, colore: "nero" });
    expect(esito.invocazioni).toEqual([]);
    expect(esito.parametriScartati).toEqual(["searchOffers"]);
  });

  test("searchEvents con {categoria: \"musica\"}: scartato", () => {
    const esito = confineDi("searchEvents", { categoria: "musica" });
    expect(esito.invocazioni).toEqual([]);
    expect(esito.parametriScartati).toEqual(["searchEvents"]);
  });

  test("searchProducts con {tipo: \"elettronica\"}: scartato", () => {
    const esito = confineDi("searchProducts", { tipo: "elettronica" });
    expect(esito.invocazioni).toEqual([]);
    expect(esito.parametriScartati).toEqual(["searchProducts"]);
  });

  test("searchProducts con limit non numerico: scartato", () => {
    const esito = confineDi("searchProducts", { limit: "molte" });
    expect(esito.invocazioni).toEqual([]);
  });

  test("searchGiftCategories con parametri tutti rifiutati: scartato (niente fan-out generico)", () => {
    const esito = confineDi("searchGiftCategories", { sconto: 10, colore: "rosso" });
    expect(esito.invocazioni).toEqual([]);
    expect(esito.parametriScartati).toEqual(["searchGiftCategories"]);
  });
});

test.describe("M5-B — esenzioni", () => {
  test("searchPharmacies con {limit: \"molte\"}: non scartato da M5-B", () => {
    const esito = confineDi("searchPharmacies", { limit: "molte" });
    expect(esito.invocazioni).toHaveLength(1);
    expect(esito.invocazioni[0].params).toEqual({});
    expect(esito.parametriScartati).toEqual([]);
  });

  test("follow-up con parametri tutti rifiutati: filtro non applicato", () => {
    const esito = confineDi("searchOffers", { sconto: 20 }, { followUp: true });
    expect(esito.invocazioni).toHaveLength(1);
    expect(esito.parametriScartati).toEqual([]);
  });

  test("la funzione pura conferma le esenzioni", () => {
    for (const strumento of ["getWeather", "getCategories", "searchPharmacies"] as const) {
      const grezzi = { sconto: 20 };
      expect(
        parametriInvocazioneSvuotatiPino(strumento, grezzi, validaToolParams(strumento, grezzi))
      ).toBe(false);
    }
    expect(
      parametriInvocazioneSvuotatiPino(
        "searchOffers",
        { sconto: 20 },
        validaToolParams("searchOffers", { sconto: 20 })
      )
    ).toBe(true);
  });
});

test.describe("M5-B — parametri misti: si conservano quelli validi", () => {
  test("searchProducts {query, tipo}: conserva query", () => {
    const esito = confineDi("searchProducts", { query: "borsa", tipo: "x" });
    expect(esito.invocazioni).toHaveLength(1);
    expect(esito.invocazioni[0].params).toEqual({ query: "borsa" });
    expect(esito.parametriScartati).toEqual([]);
  });

  test("searchStores {servizio, budget}: conserva servizio", () => {
    const esito = confineDi("searchStores", { servizio: "taglio", budget: 30 });
    expect(esito.invocazioni).toHaveLength(1);
    expect(esito.invocazioni[0].params).toEqual({ servizio: "taglio" });
  });

  test("searchStores {servizio, categoria vuota, citta}: conserva i valori validi", () => {
    const esito = confineDi("searchStores", {
      servizio: "taglio",
      categoria: "",
      citta: "Castrovillari",
    });
    expect(esito.invocazioni[0].params).toEqual({
      servizio: "taglio",
      citta: "Castrovillari",
    });
    expect(esito.parametriScartati).toEqual([]);
  });

  test("searchProducts {esclusioni: []}: resta valido (problemi non bastano)", () => {
    const esito = confineDi("searchProducts", { esclusioni: [] });
    expect(esito.invocazioni).toHaveLength(1);
    expect(validaToolParams("searchProducts", { esclusioni: [] }).problemi).toEqual([
      "lista_non_valida:esclusioni",
    ]);
  });
});

test.describe("M5-B — composizione con M5-A e dispatcher", () => {
  test("tutte le invocazioni scartate: selezione non utilizzabile, fallback S19", () => {
    const esito = confineDi("searchProducts", { tipo: "elettronica" });
    expect(selezioneUtilizzabilePino(esito.invocazioni, null)).toBe(false);
    expect(
      fallbackSelezioneVuotaPino({
        selezioneOk: selezioneUtilizzabilePino(esito.invocazioni, null),
        richiestaServizio: null,
        negozi: [],
        prodotti: [],
        offerte: [],
        eventi: [],
        categorie: [],
      })
    ).toBe(true);
  });

  test("un'invocazione valida superstite tiene in piedi la selezione", () => {
    const esito = validaInvocazioniPino([
      ...inv("searchProducts", { tipo: "elettronica" }),
      ...inv("searchOffers", {}),
    ]);
    expect(esito.invocazioni.map((t) => t.tool)).toEqual(["searchOffers"]);
    expect(selezioneUtilizzabilePino(esito.invocazioni, null)).toBe(true);
  });

  test("nessuna invocazione scartata arriva al dispatcher", () => {
    const casi: Array<[string, unknown]> = [
      ["searchOffers", { sconto: 20 }],
      ["searchEvents", { categoria: "musica" }],
      ["searchProducts", { tipo: "elettronica" }],
      ["searchGiftCategories", { sconto: 10 }],
    ];
    for (const [tool, params] of casi) {
      const esito = confineDi(tool, params);
      expect(esito.parametriScartati).toContain(tool);
      expect(esito.invocazioni.some((t) => t.tool === tool)).toBe(false);
    }
  });

  test("il filtro è dentro validaInvocazioniPino, prima di deduplica e limite", () => {
    const sorgente = readFileSync(
      join(process.cwd(), "lib", "assistente", "index.ts"),
      "utf8"
    );
    const filtro = sorgente.indexOf(
      "parametriInvocazioneSvuotatiPino(nome, invocazione.params, esito)"
    );
    const push = sorgente.indexOf("valide.push({ tool: nome, params: esito.params })");
    const deduplica = sorgente.indexOf("invocazioni = deduplicaInvocazioniPino(confine.invocazioni);");
    const limite = sorgente.indexOf("invocazioni = limitaInvocazioniPino(invocazioni);");
    const dispatch = sorgente.indexOf("eseguiInvocazioniPino(invocazioni, (invocazione) =>");

    expect(filtro).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(filtro);
    expect(deduplica).toBeGreaterThan(push);
    expect(limite).toBeGreaterThan(deduplica);
    expect(dispatch).toBeGreaterThan(limite);
  });

  test("il confine riceve l'opzione followUp dal flusso", () => {
    const sorgente = readFileSync(
      join(process.cwd(), "lib", "assistente", "index.ts"),
      "utf8"
    );
    expect(sorgente).toContain(
      "validaInvocazioniPino(invocazioni, { followUp: Boolean(followUp) })"
    );
  });
});
