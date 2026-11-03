import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  eseguiInvocazioniPino,
  riepilogoEsitiInvocazioniPino,
  type RisultatoToolPino,
  type ToolInvocation,
} from "../lib/assistente/index";
import {
  ErroreDatiNonDisponibiliPino,
  segnalaErroreDatiPino,
  segnalazioneDatiPino,
} from "../lib/assistente/tools";
import {
  cercaNegoziLegacy,
  getNegoziPubbliciIds,
  segnalaErroreDati,
} from "../lib/negozi";
import { search } from "../lib/search-service";

// ─── M6-C1: segnalazione errori dati ────────────────────────────────────────
//
// Le funzioni dati continuano a restituire liste vuote: la differenza è che ora
// possono SEGNALARE l'errore tecnico. Solo i tool di Pino trasformano la
// segnalazione in eccezione, così M6-A distingue "ricerca vuota" da "guasto".

type EsitoFinto = { data?: unknown; error?: unknown };

type DbFinto = Parameters<typeof cercaNegoziLegacy>[0];

/** Catena PostgREST finta: ogni metodo torna la catena, `await` risolve l'esito. */
function dbFinto(esito: EsitoFinto): DbFinto {
  const catena: Record<string, unknown> = {};
  for (const passo of ["from", "select", "eq", "in", "or", "is", "order", "limit", "range"]) {
    catena[passo] = () => catena;
  }
  catena.then = (risolvi: (valore: EsitoFinto) => unknown) => risolvi(esito);
  return catena as unknown as DbFinto;
}

const invocazione = (tool: string): ToolInvocation =>
  ({ tool, params: { query: "pane" } }) as unknown as ToolInvocation;

const risultatoVuoto: RisultatoToolPino = {
  negozi: [],
  prodotti: [],
  offerte: [],
  eventi: [],
  categorie: [],
  meteo: null,
  farmacie: [],
};

test.describe("M6-C1 — segnalazione additiva", () => {
  test("senza callback il comportamento resta invariato", () => {
    expect(() => segnalaErroreDati(undefined, new Error("boom"))).not.toThrow();
    expect(() => segnalaErroreDati({}, new Error("boom"))).not.toThrow();
  });

  test("la callback riceve l'errore originale", () => {
    const errori: unknown[] = [];
    const errore = { code: "PGRST500", message: "boom" };
    segnalaErroreDati({ onErrore: (e) => errori.push(e) }, errore);
    expect(errori).toEqual([errore]);
  });

  test("una callback che lancia interrompe il chiamante", () => {
    expect(() =>
      segnalaErroreDati(
        {
          onErrore: () => {
            throw new Error("stop");
          },
        },
        new Error("db")
      )
    ).toThrow("stop");
  });
});

test.describe("M6-C1 — eccezione tipizzata DATI_NON_DISPONIBILI", () => {
  test("codice stabile e nessun dettaglio del database nel messaggio", () => {
    const errore = new ErroreDatiNonDisponibiliPino("PGRST500");
    expect(errore.code).toBe("DATI_NON_DISPONIBILI");
    expect(errore.name).toBe("ErroreDatiNonDisponibiliPino");
    expect(errore.codice).toBe("PGRST500");
    expect(errore).toBeInstanceOf(Error);
    const testo = errore.message.toLowerCase();
    for (const vietato of ["supabase", "postgrest", "http", "password", "api key"]) {
      expect(testo).not.toContain(vietato);
    }
  });

  test("l'adapter conserva solo il codice tecnico", () => {
    let catturato: unknown = null;
    try {
      segnalaErroreDatiPino({ code: "08006", message: "connection failure to db" });
    } catch (errore) {
      catturato = errore;
    }
    expect(catturato).toBeInstanceOf(ErroreDatiNonDisponibiliPino);
    expect((catturato as ErroreDatiNonDisponibiliPino).codice).toBe("08006");
    expect((catturato as ErroreDatiNonDisponibiliPino).message).not.toContain("connection");
    expect(segnalazioneDatiPino.onErrore).toBe(segnalaErroreDatiPino);
  });

  test("un errore senza codice resta classificabile", () => {
    let catturato: unknown = null;
    try {
      segnalaErroreDatiPino("guasto");
    } catch (errore) {
      catturato = errore;
    }
    expect(catturato).toBeInstanceOf(ErroreDatiNonDisponibiliPino);
    expect((catturato as ErroreDatiNonDisponibiliPino).codice).toBeNull();
  });
});

test.describe("M6-C1 — funzioni dati", () => {
  test("errore PostgREST nel fallback legacy: segnalato, lista vuota come prima", async () => {
    const errori: unknown[] = [];
    const righe = await cercaNegoziLegacy(
      dbFinto({ data: null, error: { code: "PGRST500", message: "boom" } }),
      "pane",
      "pane",
      { onErrore: (errore) => errori.push(errore) }
    );
    expect(righe).toEqual([]);
    expect(errori).toHaveLength(1);
  });

  test("fallback legacy riuscito: nessun errore e risultati conservati", async () => {
    const errori: unknown[] = [];
    const righe = await cercaNegoziLegacy(
      dbFinto({ data: [{ id: "n1", nome: "Panificio" }], error: null }),
      "pane",
      "pane",
      { onErrore: (errore) => errori.push(errore) }
    );
    expect(errori).toEqual([]);
    // La riga può essere scartata dai filtri di pertinenza: qui conta che la
    // lettura sia riuscita e che non venga segnalato alcun errore.
    expect(Array.isArray(righe)).toBe(true);
  });

  test("catalogo realmente vuoto: nessun falso errore", async () => {
    const errori: unknown[] = [];
    const righe = await cercaNegoziLegacy(
      dbFinto({ data: [], error: null }),
      "pane",
      "pane",
      { onErrore: (errore) => errori.push(errore) }
    );
    expect(righe).toEqual([]);
    expect(errori).toEqual([]);
  });

  test("errore nella sotto-query dei negozi pubblici: segnalato", async () => {
    const errori: unknown[] = [];
    const ids = await getNegoziPubbliciIds(
      dbFinto({ data: null, error: { code: "PGRST000" } }),
      { onErrore: (errore) => errori.push(errore) }
    );
    expect(ids).toEqual([]);
    expect(errori).toHaveLength(1);
  });

  test("sotto-query senza errori: nessuna segnalazione", async () => {
    const errori: unknown[] = [];
    const ids = await getNegoziPubbliciIds(dbFinto({ data: [], error: null }), {
      onErrore: (errore) => errori.push(errore),
    });
    expect(ids).toEqual([]);
    expect(errori).toEqual([]);
  });

  test("con l'adapter Pino l'errore dati interrompe il tool", async () => {
    await expect(
      cercaNegoziLegacy(dbFinto({ error: { code: "08006" } }), "pane", "pane", segnalazioneDatiPino)
    ).rejects.toBeInstanceOf(ErroreDatiNonDisponibiliPino);
  });

  test("ricerca senza termine: nessuna chiamata al database e nessun errore", async () => {
    let chiamate = 0;
    const risultato = await search("", {
      onErrore: () => {
        chiamate += 1;
      },
    });
    expect(risultato.prodotti).toEqual([]);
    expect(risultato.negozi).toEqual([]);
    expect(risultato.total).toBe(0);
    expect(chiamate).toBe(0);
  });
});

test.describe("M6-C1 — classificazione in M6-A", () => {
  test("errore Supabase classificato `errore`, non `timeout` né `vuoto`", async () => {
    const esiti = await eseguiInvocazioniPino([invocazione("searchProducts")], async () => {
      throw new ErroreDatiNonDisponibiliPino("PGRST500");
    });
    expect(esiti[0].stato).toBe("errore");
    expect(riepilogoEsitiInvocazioniPino(esiti)).toMatchObject({
      tentate: 1,
      fallite: 1,
      timeout: 0,
      vuote: 0,
      tutteFallite: true,
      erroreParziale: false,
    });
  });

  test("ricerca realmente vuota classificata `vuoto`, nessun guasto", async () => {
    const esiti = await eseguiInvocazioniPino([invocazione("searchProducts")], async () => risultatoVuoto);
    expect(esiti[0].stato).toBe("vuoto");
    expect(riepilogoEsitiInvocazioniPino(esiti)).toMatchObject({
      riuscite: 1,
      vuote: 1,
      fallite: 0,
      timeout: 0,
      tutteFallite: false,
      erroreParziale: false,
    });
  });

  test("guasto su un tool e vuoto sull'altro: errore parziale, risultati conservati", async () => {
    const esiti = await eseguiInvocazioniPino(
      [invocazione("searchStores"), invocazione("searchProducts")],
      async (inv) => {
        if (inv.tool === "searchStores") throw new ErroreDatiNonDisponibiliPino("08006");
        return risultatoVuoto;
      }
    );
    expect(esiti.map((e) => e.stato)).toEqual(["errore", "vuoto"]);
    expect(riepilogoEsitiInvocazioniPino(esiti).erroreParziale).toBe(true);
    expect(riepilogoEsitiInvocazioniPino(esiti).tutteFallite).toBe(false);
  });
});

test.describe("M6-C1 — integrazione (invarianti di codice)", () => {
  const normalizza = (testo: string) => testo.replace(/\r\n/g, "\n");
  const tools = normalizza(readFileSync(join(process.cwd(), "lib/assistente/tools.ts"), "utf8"));
  const negozi = normalizza(readFileSync(join(process.cwd(), "lib/negozi.ts"), "utf8"));
  const servizio = normalizza(readFileSync(join(process.cwd(), "lib/search-service.ts"), "utf8"));

  test("la segnalazione è attiva solo in searchProducts e searchStores", () => {
    expect(tools).toContain("searchCatalogoPubblico(q, { onErrore: segnalaErroreDatiPino })");
    expect(tools).toContain("}, segnalazioneDatiPino);");
    // M6-C2 (categorie) e M6-C3 (offerte, eventi, farmacie) hanno esteso di
    // proposito la segnalazione: qui resta solo il fallback non protetto da
    // eseguiTool, che deve continuare a non attivare l'adapter.
    for (const funzione of ["searchAll"]) {
      const inizio = tools.indexOf(`export async function ${funzione}(`);
      expect(inizio, `${funzione} non trovata`).toBeGreaterThan(-1);
      const successivo = tools.indexOf("\nexport ", inizio + 10);
      const corpo = tools.slice(inizio, successivo === -1 ? tools.length : successivo);
      expect(corpo).not.toContain("segnalazioneDatiPino");
      expect(corpo).not.toContain("onErrore");
    }
  });

  test("il service propaga onErrore a prodotti e negozi", () => {
    expect(servizio).toContain("onErrore?: (errore: unknown) => void;");
    expect(servizio).toContain("cercaNegozi(termine, {}, segnalazione)");
    expect(servizio).toContain("cercaProdotti(termine, 20, segnalazione)");
    expect(servizio).toContain("perPagina: opts.perPagina,\n    }, segnalazione);");
  });

  test("errore RPC con fallback: la segnalazione avviene solo se il fallback fallisce", () => {
    const inizioCatch = negozi.indexOf('[cercaNegozi] RPC non disponibile');
    expect(inizioCatch).toBeGreaterThan(-1);
    const chiamataLegacy = negozi.indexOf("cercaNegoziLegacy(db, espansa, ricerca, segnalazione)", inizioCatch);
    expect(chiamataLegacy).toBeGreaterThan(inizioCatch);
    const tratto = negozi.slice(inizioCatch, chiamataLegacy);
    expect(tratto).not.toContain("segnalaErroreDati");
  });

  test("configurazione Supabase assente viene segnalata, non ignorata", () => {
    expect(negozi).toContain("Supabase non configurato");
    expect(negozi).toContain("if (!db) {\n    segnalaErroreDati(");
    expect(negozi).toContain("export function segnalaErroreDati(");
  });
});
