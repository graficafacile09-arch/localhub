import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  eseguiInvocazioniPino,
  fontiInattendibiliSenzaRisultatiPino,
  limitaInvocazioniPino,
  MASSIMO_INVOCAZIONI_PINO,
  mergeEsitiInvocazioniPino,
  messaggioFontiNonDisponibiliPino,
  notaFontiParzialiPino,
  riepilogoEsitiInvocazioniPino,
  risultatoToolVuotoPino,
  selezioneUtilizzabilePino,
  validaInvocazioniPino,
  type EsitoInvocazionePino,
  type RisultatoToolPino,
  type ToolInvocation,
} from "../lib/assistente/index";

// ─── M6-A: isolamento degli errori dei tool ─────────────────────────────────
//
// Il dispatch multiplo non usa più `Promise.all` nudo: un tool che lancia non
// deve azzerare i risultati degli altri né propagare l'eccezione. Ogni esito
// trasporta la propria invocazione, così il merge non dipende dagli indici.

const inv = (tool: string, params: Record<string, unknown> = {}): ToolInvocation =>
  ({ tool, params }) as unknown as ToolInvocation;

const paramInvocazione = (invocazione: ToolInvocation, chiave: string): unknown =>
  (invocazione.params as unknown as Record<string, unknown> | undefined)?.[chiave];

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

const negozio = (id: string) =>
  ({ id, nome: `Negozio ${id}`, categoria: "alimentari" }) as unknown as RisultatoToolPino["negozi"][number];

const prodotto = (id: string, categoria?: string) =>
  ({
    id,
    nome: `Prodotto ${id}`,
    categoria,
    prezzo: "9.90",
  }) as unknown as RisultatoToolPino["prodotti"][number];

const esecutore = (mappa: Record<string, () => RisultatoToolPino | Promise<RisultatoToolPino>>) =>
  async (invocazione: ToolInvocation): Promise<RisultatoToolPino> => {
    const chiave = String(invocazione.params?.query ?? invocazione.tool);
    const funzione = mappa[chiave];
    if (!funzione) throw new Error(`esecutore inatteso: ${chiave}`);
    return funzione();
  };

const sempreErrore = async (): Promise<RisultatoToolPino> => {
  throw new Error("db non raggiungibile");
};

test.describe("M6-A — esiti e stato di ogni invocazione", () => {
  test("1) tre tool riusciti: tutti `ok`, nessun errore parziale", async () => {
    const invocazioni = [inv("searchStores", { query: "pane" }), inv("searchProducts", { query: "latte" }), inv("searchOffers", { query: "sconto" })];
    const esiti = await eseguiInvocazioniPino(
      invocazioni,
      esecutore({
        pane: () => risultato({ negozi: [negozio("n1")] }),
        latte: () => risultato({ prodotti: [prodotto("p1")] }),
        sconto: () => risultato({ offerte: [{ id: "o1" }] as RisultatoToolPino["offerte"] }),
      })
    );

    expect(esiti.map((e) => e.stato)).toEqual(["ok", "ok", "ok"]);
    expect(esiti.every((e) => e.messaggio === null)).toBe(true);
    expect(esiti.every((e) => e.durataMs >= 0)).toBe(true);
    const riepilogo = riepilogoEsitiInvocazioniPino(esiti);
    expect(riepilogo).toMatchObject({
      tentate: 3,
      riuscite: 3,
      vuote: 0,
      fallite: 0,
      timeout: 0,
      conRisultati: 3,
      tutteFallite: false,
      erroreParziale: false,
    });
  });

  test("2) un errore e due tool riusciti: nessuna eccezione, esiti distinti", async () => {
    const invocazioni = [inv("searchStores", { query: "pane" }), inv("searchProducts", { query: "latte" }), inv("searchOffers", { query: "sconto" })];
    const esiti = await eseguiInvocazioniPino(
      invocazioni,
      esecutore({
        pane: () => risultato({ negozi: [negozio("n1")] }),
        latte: () => risultato({ prodotti: [prodotto("p1")] }),
        sconto: sempreErrore,
      })
    );

    expect(esiti.map((e) => e.stato)).toEqual(["ok", "ok", "errore"]);
    expect(esiti[2].risultati).toBeNull();
    expect(esiti[2].messaggio).toContain("db non raggiungibile");
    expect(riepilogoEsitiInvocazioniPino(esiti).erroreParziale).toBe(true);
  });

  test("3) due errori e un tool riuscito: il risultato valido sopravvive", async () => {
    const invocazioni = [inv("searchStores", { query: "pane" }), inv("searchProducts", { query: "latte" })];
    const esiti = await eseguiInvocazioniPino(
      invocazioni,
      esecutore({ pane: sempreErrore, latte: () => risultato({ prodotti: [prodotto("p1")] }) })
    );

    const merge = mergeEsitiInvocazioniPino(esiti);
    expect(merge.prodotti.map((p) => p.id)).toEqual(["p1"]);
    expect(esiti.filter((e) => e.stato === "errore")).toHaveLength(1);
    expect(riepilogoEsitiInvocazioniPino(esiti)).toMatchObject({ riuscite: 1, fallite: 1, erroreParziale: true });
  });

  test("4) tutti i tool falliti: stato `errore` per ciascuno e `tutteFallite`", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("searchStores", { query: "a" }), inv("searchProducts", { query: "b" })],
      esecutore({ a: sempreErrore, b: sempreErrore })
    );

    expect(esiti.map((e) => e.stato)).toEqual(["errore", "errore"]);
    expect(esiti.every((e) => e.risultati === null)).toBe(true);
    const riepilogo = riepilogoEsitiInvocazioniPino(esiti);
    expect(riepilogo.tutteFallite).toBe(true);
    expect(riepilogo.erroreParziale).toBe(false);
    expect(mergeEsitiInvocazioniPino(esiti)).toMatchObject({ negozi: [], prodotti: [] });
  });

  test("5) tool riuscito con array vuoto: `vuoto`, non errore", async () => {
    const esiti = await eseguiInvocazioniPino([inv("searchOffers", {})], async () => risultato());

    expect(esiti[0].stato).toBe("vuoto");
    expect(esiti[0].risultati).not.toBeNull();
    expect(esiti[0].messaggio).toBeNull();
    const riepilogo = riepilogoEsitiInvocazioniPino(esiti);
    expect(riepilogo).toMatchObject({ riuscite: 1, vuote: 1, fallite: 0, conRisultati: 0, tutteFallite: false });
  });

  test("6) tool vuoto e tool fallito: i due stati restano distinti", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("searchOffers", { query: "vuoto" }), inv("searchProducts", { query: "rotto" })],
      esecutore({ vuoto: () => risultato(), rotto: sempreErrore })
    );

    expect(esiti.map((e) => e.stato)).toEqual(["vuoto", "errore"]);
    const riepilogo = riepilogoEsitiInvocazioniPino(esiti);
    expect(riepilogo).toMatchObject({ riuscite: 1, vuote: 1, fallite: 1, erroreParziale: true, conRisultati: 0 });
    // Nessun risultato valido + una fonte fallita: il catalogo vuoto non è certo.
    expect(
      fontiInattendibiliSenzaRisultatiPino(riepilogo, mergeEsitiInvocazioniPino(esiti))
    ).toBe(true);
  });

  test("risultato con solo meteo non è vuoto", () => {
    expect(risultatoToolVuotoPino(risultato())).toBe(true);
    expect(risultatoToolVuotoPino(null)).toBe(true);
    expect(
      risultatoToolVuotoPino(risultato({ meteo: { temperatura: 20 } as unknown as RisultatoToolPino["meteo"] }))
    ).toBe(false);
    expect(risultatoToolVuotoPino(risultato({ farmacie: [{ id: "f1", nome: "F" }] as unknown as RisultatoToolPino["farmacie"] }))).toBe(false);
  });

  test("11) predisposizione timeout: un errore marcato è classificato `timeout`", async () => {
    const esiti = await eseguiInvocazioniPino([inv("searchStores", { query: "lento" })], async () => {
      const errore = new Error("scaduto");
      (errore as unknown as { name: string }).name = "TimeoutError";
      throw errore;
    });

    expect(esiti[0].stato).toBe("timeout");
    expect(riepilogoEsitiInvocazioniPino(esiti).timeout).toBe(1);
  });
});

test.describe("M6-A — conservazione dei risultati validi", () => {
  test("7) i risultati validi si conservano nonostante gli errori", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("searchStores", { query: "a" }), inv("searchProducts", { query: "b" }), inv("searchEvents", { query: "c" })],
      esecutore({
        a: () => risultato({ negozi: [negozio("n1")] }),
        b: sempreErrore,
        c: () => risultato({ eventi: [{ id: "e1" }] as RisultatoToolPino["eventi"] }),
      })
    );

    const merge = mergeEsitiInvocazioniPino(esiti);
    expect(merge.negozi.map((n) => n.id)).toEqual(["n1"]);
    expect(merge.eventi.map((e) => e.id)).toEqual(["e1"]);
    expect(merge.prodotti).toEqual([]);
    expect(esiti).toHaveLength(3);
  });

  test("merge con deduplica per id e ordine di invocazione preservato", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("searchProducts", { query: "a" }), inv("searchProducts", { query: "b" })],
      esecutore({
        a: () => risultato({ prodotti: [prodotto("p1"), prodotto("p2")] }),
        b: () => risultato({ prodotti: [prodotto("p2"), prodotto("p3")] }),
      })
    );

    const merge = mergeEsitiInvocazioniPino(esiti);
    expect(merge.prodotti.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  test("8) associazione esatta invocazione↔risultato anche con completamento invertito", async () => {
    // Il primo esecutore è lento, il secondo immediato: l'ordine degli esiti
    // resta quello delle invocazioni e ogni risultato resta col proprio params.
    const esiti = await eseguiInvocazioniPino(
      [inv("searchProducts", { query: "lento" }), inv("searchProducts", { query: "veloce" })],
      async (invocazione) => {
        const chiave = String(invocazione.params?.query);
        if (chiave === "lento") {
          await new Promise((r) => setTimeout(r, 25));
          return risultato({ prodotti: [prodotto("dal-lento", "lento")] });
        }
        return risultato({ prodotti: [prodotto("dal-veloce", "veloce")] });
      }
    );

    expect(esiti.map((e) => e.invocazione.params?.query)).toEqual(["lento", "veloce"]);
    expect(
      esiti.map((e) => (e.stato === "ok" ? e.risultati.prodotti[0].categoria : null))
    ).toEqual(["lento", "veloce"]);
  });

  test("9) due searchGiftCategories con parametri diversi mantengono i propri parametri", async () => {
    const invocazioni = [
      inv("searchGiftCategories", { query: "regalo", termini: ["libri", "giochi"], group: "a" }),
      inv("searchGiftCategories", { query: "regalo", termini: ["sport"], group: "b" }),
    ];
    const esiti = await eseguiInvocazioniPino(invocazioni, async (invocazione) =>
      risultato({ prodotti: [prodotto(`p-${String(paramInvocazione(invocazione, "group"))}`, "libri")] })
    );

    expect(esiti.map((e) => paramInvocazione(e.invocazione, "group"))).toEqual(["a", "b"]);
    expect(esiti.map((e) => e.invocazione.params?.termini)).toEqual([["libri", "giochi"], ["sport"]]);
    const merge = mergeEsitiInvocazioniPino(esiti);
    expect(merge.prodotti.map((p) => p.id)).toEqual(["p-a", "p-b"]);
  });

  test("10) nessuna eccezione propagata dall'esecutore aggregato", async () => {
    await expect(
      eseguiInvocazioniPino([inv("searchStores", { query: "a" }), inv("searchOffers", { query: "b" })], async () => {
        throw new Error("guasto totale");
      })
    ).resolves.toHaveLength(2);

    await expect(eseguiInvocazioniPino([], async () => risultato())).resolves.toEqual([]);
  });
});

test.describe("M6-A — messaggi localizzati", () => {
  test("11) messaggio di errore totale IT/EN", () => {
    expect(messaggioFontiNonDisponibiliPino("it")).toBe(
      "In questo momento non riesco a completare la ricerca per un problema temporaneo. Riprova tra poco."
    );
    expect(messaggioFontiNonDisponibiliPino("en")).toBe(
      "I can't complete the search right now due to a temporary issue. Please try again shortly."
    );
    expect(messaggioFontiNonDisponibiliPino()).toBe(messaggioFontiNonDisponibiliPino("it"));
  });

  test("12) nota di errore parziale IT/EN", () => {
    expect(notaFontiParzialiPino("it")).toBe("Alcune fonti non sono temporaneamente disponibili.");
    expect(notaFontiParzialiPino("en")).toBe("Some sources are temporarily unavailable.");
    expect(notaFontiParzialiPino()).toBe(notaFontiParzialiPino("it"));
  });

  test("13) nessun messaggio di catalogo vuoto quando tutte le fonti falliscono", () => {
    for (const lingua of ["it", "en"] as const) {
      const messaggio = messaggioFontiNonDisponibiliPino(lingua).toLowerCase();
      expect(messaggio).not.toContain("non ho trovato");
      expect(messaggio).not.toContain("nessun prodotto");
      expect(messaggio).not.toContain("non ci sono");
      expect(messaggio).not.toContain("i didn't find");
      expect(messaggio).not.toContain("no results");
    }
    expect(messaggioFontiNonDisponibiliPino("it")).not.toBe(messaggioFontiNonDisponibiliPino("en"));
  });

  test("il messaggio totale non è il messaggio S19 della selezione AI", async () => {
    const { messaggioIndisponibilitaGemini } = await import("../lib/assistente/index");
    expect(messaggioFontiNonDisponibiliPino("it")).not.toBe(messaggioIndisponibilitaGemini("it"));
    expect(messaggioFontiNonDisponibiliPino("en")).not.toBe(messaggioIndisponibilitaGemini("en"));
  });
});

test.describe("M6-A — integrazione nell'orchestratore (invarianti di codice)", () => {
  const sorgente = readFileSync(join(process.cwd(), "lib/assistente/index.ts"), "utf8");

  test("14) nessun searchAll quando tutte le fonti falliscono", () => {
    const posErroreTotale = sorgente.indexOf("if (tutteLeFontiFallite && !directReply) {");
    // Il primo `searchAll(` del file è quello interno al caso omonimo di
    // `eseguiTool`: il fallback dell orchestratore è il successivo.
    const posSearchAll = sorgente.indexOf("eseguiFallbackConScadenzaPino(() =>", posErroreTotale);
    expect(posErroreTotale).toBeGreaterThan(-1);
    expect(posSearchAll).toBeGreaterThan(-1);
    expect(posErroreTotale).toBeLessThan(posSearchAll);
    expect(sorgente.slice(posErroreTotale, posSearchAll)).toContain(
      "messaggioFontiNonDisponibiliPino(linguaConversazione)"
    );
  });

  test("il dispatch usa eseguiInvocazioniPino e non Promise.all nudo", () => {
    expect(sorgente).toContain("eseguiInvocazioniPino(invocazioni, (invocazione) =>");
    expect(sorgente).not.toContain("const risultati = await Promise.all(");
    expect(sorgente).not.toContain("for (let i = 0; i < risultati.length; i++)");
  });

  test("il merge usa esito.invocazione e il riepilogo sostituisce toolsEseguiti", () => {
    expect(sorgente).toContain("mergeEsitiInvocazioniPino(esitiInvocazioni, { regaloGenerico })");
    expect(sorgente).toContain("const toolsEseguiti = invocazioniRiuscite > 0;");
  });

  test("la nota parziale entra nella risposta finale", () => {
    expect(sorgente).toContain("notaFontiParzialiPino(linguaRisposta)");
    expect(sorgente).toContain("notaFontiParziali,");
  });
});

test.describe("M6-A — regressioni M5-A, M5-B, S1-A, D1", () => {
  test("15) M5-A: selezione vuota senza risposta diretta non è utilizzabile", () => {
    expect(selezioneUtilizzabilePino([], null)).toBe(false);
    expect(selezioneUtilizzabilePino([], undefined)).toBe(false);
    expect(selezioneUtilizzabilePino([], "Sono qui, dimmi pure.")).toBe(true);
  });

  test("16) M5-B: parametri forniti e svuotati dalla validazione vengono scartati", () => {
    const esito = validaInvocazioniPino([
      { tool: "searchOffers", params: { chiaveInventata: "valore" } },
    ] as unknown as ToolInvocation[]);
    expect(esito.invocazioni).toEqual([]);
    expect(esito.parametriScartati).toEqual(["searchOffers"]);
    // I follow-up restano esenti dal filtro M5-B.
    const followUp = validaInvocazioniPino(
      [{ tool: "searchOffers", params: { chiaveInventata: "valore" } }] as unknown as ToolInvocation[],
      { followUp: true }
    );
    expect(followUp.invocazioni).toHaveLength(1);
  });

  test("17) S1-A/D1: allowlist al confine e limite di tre invocazioni", () => {
    const esito = validaInvocazioniPino([
      { tool: "deleteEverything", params: {} },
      { tool: "searchStores", params: { query: "pane", foo: 1 } },
    ] as unknown as ToolInvocation[]);
    expect(esito.scartate).toEqual(["deleteEverything"]);
    expect(esito.invocazioni).toHaveLength(1);
    expect(esito.invocazioni[0].params).toEqual({ query: "pane" });

    const quattro = limitaInvocazioniPino([
      inv("searchStores", { query: "a" }),
      inv("searchProducts", { query: "b" }),
      inv("searchOffers", { query: "c" }),
      inv("searchEvents", { query: "d" }),
    ]);
    expect(MASSIMO_INVOCAZIONI_PINO).toBe(3);
    expect(quattro).toHaveLength(3);
  });

  test("18) tutti i tool funzionanti: merge e ordine invariati", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("searchStores", { query: "a" }), inv("searchProducts", { query: "b" })],
      esecutore({
        a: () => risultato({ negozi: [negozio("n1"), negozio("n2")] }),
        b: () => risultato({ prodotti: [prodotto("p1")] }),
      })
    );

    expect(esiti.map((e) => e.stato)).toEqual(["ok", "ok"]);
    const merge = mergeEsitiInvocazioniPino(esiti);
    expect(merge.negozi.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(merge.prodotti.map((p) => p.id)).toEqual(["p1"]);
    expect(riepilogoEsitiInvocazioniPino(esiti).erroreParziale).toBe(false);
    expect(esiti[0].durataMs).toBeLessThanOrEqual(esiti[1].durataMs + 1000);
  });
});

test.describe("M6-A — tipi esportati", () => {
  test("gli esiti sono consumabili senza cast pericolosi", () => {
    const esito: EsitoInvocazionePino = {
      invocazione: inv("searchStores", { query: "x" }),
      stato: "errore",
      durataMs: 3,
      risultati: null,
      messaggio: "guasto",
    };
    expect(esito.risultati).toBeNull();
  });
});
