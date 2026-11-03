import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  eseguiInvocazioniPino,
  fontiInattendibiliSenzaRisultatiPino,
  mergeEsitiInvocazioniPino,
  messaggioFontiNonDisponibiliPino,
  meteoSostituisceRispostaPino,
  notaFontiParzialiPino,
  riepilogoEsitiInvocazioniPino,
  risultatoToolVuotoPino,
  rispostaMeteoDeterministica,
  type RisultatoToolPino,
  type ToolInvocation,
} from "../lib/assistente/index";

// ─── M6-D1: il meteo come fonte valida nella classificazione ────────────────
//
// Il ramo deterministico del meteo restituiva SOLO la risposta meteo: con le
// altre fonti fallite andava bene, ma cancellava i risultati validi di un altro
// tool e la nota sulle fonti parziali. Il meteo vale come fonte solo quando ha
// prodotto dati effettivi; un meteo vuoto non è un risultato.

const inv = (tool: string, params: Record<string, unknown> = {}): ToolInvocation =>
  ({ tool, params }) as unknown as ToolInvocation;

const risultato = (parti: Partial<RisultatoToolPino> = {}): RisultatoToolPino => ({
  negozi: [],
  prodotti: [],
  offerte: [],
  eventi: [],
  categorie: [],
  meteo: null,
  farmacie: [],
  ...parti,
});

const meteoValido = {
  temperatura: 18,
  temperaturaPercepita: 17,
  codice: 1,
  descrizione: "Sereno",
  ventoKmh: 9,
  precipitazioneMm: 0,
  oggi: { minima: 12, massima: 21, probabilitaPioggia: 10 },
  domani: {
    data: "2026-11-04",
    minima: 11,
    massima: 20,
    probabilitaPioggia: 25,
    descrizione: "Poco nuvoloso",
  },
  aggiornato: "07:00",
} as unknown as RisultatoToolPino["meteo"];

const offerta = (id: string) =>
  ({ id, titolo: "Sconto sul pane" }) as unknown as RisultatoToolPino["offerte"][number];
const negozio = (id: string) =>
  ({ id, nome: `Negozio ${id}` }) as unknown as RisultatoToolPino["negozi"][number];
const prodotto = (id: string) =>
  ({ id, nome: `Prodotto ${id}` }) as unknown as RisultatoToolPino["prodotti"][number];
const evento = (id: string) =>
  ({ id, titolo: `Evento ${id}` }) as unknown as RisultatoToolPino["eventi"][number];
const farmacia = (id: string) =>
  ({ id, nome: `Farmacia ${id}` }) as unknown as RisultatoToolPino["farmacie"][number];

const errore = (): RisultatoToolPino => {
  throw new Error("db non raggiungibile");
};

const esecutore =
  (mappa: Record<string, () => RisultatoToolPino>) =>
  async (invocazione: ToolInvocation): Promise<RisultatoToolPino> => {
    const funzione = mappa[String(invocazione.tool)];
    if (!funzione) throw new Error(`esecutore inatteso: ${String(invocazione.tool)}`);
    return funzione();
  };

test.describe("M6-D1 — meteo valido e altre fonti fallite", () => {
  test("1) meteo valido + tutte le altre fonti fallite: il meteo resta", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("getWeather"), inv("searchStores"), inv("searchProducts")],
      esecutore({
        getWeather: () => risultato({ meteo: meteoValido }),
        searchStores: errore,
        searchProducts: errore,
      })
    );

    expect(esiti.map((e) => e.stato)).toEqual(["ok", "errore", "errore"]);
    const riepilogo = riepilogoEsitiInvocazioniPino(esiti);
    expect(riepilogo.tutteFallite).toBe(false);
    expect(riepilogo.erroreParziale).toBe(true);

    const merge = mergeEsitiInvocazioniPino(esiti);
    expect(merge.meteo).not.toBeNull();
    expect(risultatoToolVuotoPino(merge)).toBe(false);

    // Il ramo deterministico resta attivo e conserva il dato meteo.
    expect(meteoSostituisceRispostaPino(merge)).toBe(true);
    expect(fontiInattendibiliSenzaRisultatiPino(riepilogo, merge)).toBe(false);

    const testo = rispostaMeteoDeterministica(merge.meteo, "it");
    expect(testo).toContain("Castrovillari");
    expect(testo).toContain("18°C");
  });

  test("2) meteo vuoto + tutte le altre fonti fallite: messaggio tecnico, nessuna previsione inventata", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("getWeather"), inv("searchOffers")],
      esecutore({ getWeather: () => risultato(), searchOffers: errore })
    );

    expect(esiti.map((e) => e.stato)).toEqual(["vuoto", "errore"]);
    const riepilogo = riepilogoEsitiInvocazioniPino(esiti);
    const merge = mergeEsitiInvocazioniPino(esiti);

    expect(merge.meteo).toBeNull();
    expect(meteoSostituisceRispostaPino(merge)).toBe(true);
    expect(fontiInattendibiliSenzaRisultatiPino(riepilogo, merge)).toBe(true);

    // La sola presenza del tool meteo non basta: senza dati la risposta dichiara
    // l'indisponibilità e non inventa una previsione numerica.
    const testo = rispostaMeteoDeterministica(null, "it");
    expect(testo).toContain("non riesco a verificare il meteo");
    expect(testo).not.toMatch(/\d+°C/);
    expect(messaggioFontiNonDisponibiliPino("it")).toContain("problema temporaneo");
  });
});

test.describe("M6-D1 — meteo fallito o parziale con altre fonti", () => {
  test("3) meteo fallito + offerte valide: le offerte e la nota parziale restano", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("getWeather"), inv("searchOffers", { query: "pane" })],
      esecutore({
        getWeather: errore,
        searchOffers: () => risultato({ offerte: [offerta("o1")] }),
      })
    );

    expect(esiti.map((e) => e.stato)).toEqual(["errore", "ok"]);
    const riepilogo = riepilogoEsitiInvocazioniPino(esiti);
    const merge = mergeEsitiInvocazioniPino(esiti);

    expect(merge.offerte).toHaveLength(1);
    expect(merge.meteo).toBeNull();

    // Il ramo deterministico NON sostituisce la risposta: le offerte restano e
    // la nota sulle fonti parziali accompagna i risultati validi.
    expect(meteoSostituisceRispostaPino(merge)).toBe(false);
    expect(riepilogo.erroreParziale).toBe(true);
    expect(notaFontiParzialiPino("it")).toContain("Alcune fonti");
    expect(fontiInattendibiliSenzaRisultatiPino(riepilogo, merge)).toBe(false);
  });

  test("4) tutte le fonti fallite: messaggio tecnico e nessun risultato", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("getWeather"), inv("searchStores"), inv("searchPharmacies")],
      esecutore({ getWeather: errore, searchStores: errore, searchPharmacies: errore })
    );

    expect(esiti.map((e) => e.stato)).toEqual(["errore", "errore", "errore"]);
    const riepilogo = riepilogoEsitiInvocazioniPino(esiti);
    const merge = mergeEsitiInvocazioniPino(esiti);

    expect(riepilogo.tutteFallite).toBe(true);
    expect(riepilogo.conRisultati).toBe(0);
    expect(risultatoToolVuotoPino(merge)).toBe(true);
    expect(fontiInattendibiliSenzaRisultatiPino(riepilogo, merge)).toBe(true);
    expect(messaggioFontiNonDisponibiliPino("it")).toContain("problema temporaneo");
  });

  test("5) meteo valido + una fonte fallita e una valida: dati e nota insieme", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("getWeather"), inv("searchOffers"), inv("searchStores")],
      esecutore({
        getWeather: () => risultato({ meteo: meteoValido }),
        searchOffers: () => risultato({ offerte: [offerta("o1")] }),
        searchStores: errore,
      })
    );

    expect(esiti.map((e) => e.stato)).toEqual(["ok", "ok", "errore"]);
    const riepilogo = riepilogoEsitiInvocazioniPino(esiti);
    const merge = mergeEsitiInvocazioniPino(esiti);

    expect(merge.meteo).not.toBeNull();
    expect(merge.offerte).toHaveLength(1);
    // Con dati validi di un'altra fonte il meteo non può sostituire la risposta.
    expect(meteoSostituisceRispostaPino(merge)).toBe(false);
    expect(riepilogo.erroreParziale).toBe(true);
    expect(notaFontiParzialiPino("it")).toContain("Alcune fonti");
    expect(fontiInattendibiliSenzaRisultatiPino(riepilogo, merge)).toBe(false);
  });
});

test.describe("M6-D1 — quali fonti impediscono al meteo di sostituire la risposta", () => {
  const base: Pick<
    RisultatoToolPino,
    "negozi" | "prodotti" | "offerte" | "eventi" | "categorie" | "farmacie"
  > = { negozi: [], prodotti: [], offerte: [], eventi: [], categorie: [], farmacie: [] };

  test("nessun dato: il ramo meteo resta attivo", () => {
    expect(meteoSostituisceRispostaPino(base)).toBe(true);
  });

  test("una sola invocazione meteo resta deterministica", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("getWeather")],
      esecutore({ getWeather: () => risultato({ meteo: meteoValido }) })
    );
    expect(meteoSostituisceRispostaPino(mergeEsitiInvocazioniPino(esiti))).toBe(true);
  });

  test("ogni contenitore conta: negozi, prodotti, offerte, eventi, categorie, farmacie", () => {
    expect(meteoSostituisceRispostaPino({ ...base, negozi: [negozio("n1")] })).toBe(false);
    expect(meteoSostituisceRispostaPino({ ...base, prodotti: [prodotto("p1")] })).toBe(false);
    expect(meteoSostituisceRispostaPino({ ...base, offerte: [offerta("o1")] })).toBe(false);
    expect(meteoSostituisceRispostaPino({ ...base, eventi: [evento("e1")] })).toBe(false);
    expect(meteoSostituisceRispostaPino({ ...base, categorie: [{ nome: "alimentari", count: 1 }] })).toBe(false);
    expect(meteoSostituisceRispostaPino({ ...base, farmacie: [farmacia("f1")] })).toBe(false);
  });
});

test.describe("M6-D1 — invarianti di codice", () => {
  const sorgente = readFileSync(join(process.cwd(), "lib/assistente/index.ts"), "utf8").replace(
    /\r\n/g,
    "\n"
  );

  test("il ramo deterministico è condizionato alle altre fonti", () => {
    expect(sorgente).toContain(
      "haMeteo &&\n    meteoSostituisceRispostaPino({ negozi, prodotti, offerte, eventi, categorie, farmacie })"
    );
  });

  test("il meteo continua a valere come fonte nella classificazione", () => {
    expect(sorgente).toContain("!risultati?.meteo");
  });

  test("«tutte le fonti fallite» è valutato prima del ramo meteo", () => {
    const tutte = sorgente.indexOf("const tutteLeFontiFallite");
    const ramoMeteo = sorgente.indexOf("haMeteo &&\n    meteoSostituisceRispostaPino");
    expect(tutte).toBeGreaterThan(-1);
    expect(ramoMeteo).toBeGreaterThan(tutte);
  });

  test("la risposta meteo deterministica resta quella usata dal ramo", () => {
    expect(sorgente).toContain(
      "risposta: rispostaMeteoDeterministica(meteo, linguaConversazione)"
    );
  });
});
