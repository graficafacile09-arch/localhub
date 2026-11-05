import { expect, test } from "@playwright/test";

import { filtraProdottiPerCitta, mappaProdottoRicerca } from "../lib/negozi";
import type { ProdottoRicerca } from "../lib/ricerca-ai";
import {
  ErroreDatiNonDisponibiliPino,
  segnalazioneDatiPino,
} from "../lib/assistente/tools";

// ─── M6-C1.1: errori della pipeline prodotti ────────────────────────────────
//
// Due percorsi potevano trasformare un guasto del database in un catalogo
// vuoto: l'arricchimento con il nome negozio (mappaProdottoRicerca) e il
// vincolo di città (filtraProdottiPerCitta). Entrambi ora accettano la
// segnalazione opzionale di M6-C1. I test girano su un client PostgREST finto:
// nessun database reale, nessuna simulazione di test superato.

type EsitoFinto = { data?: unknown; error?: unknown };

type DbFinto = Parameters<typeof filtraProdottiPerCitta>[0];

function dbFinto(esito: EsitoFinto): DbFinto {
  const catena: Record<string, unknown> = {};
  for (const passo of ["from", "select", "eq", "in", "is", "order", "limit", "range"]) {
    catena[passo] = () => catena;
  }
  catena.then = (risolvi: (valore: EsitoFinto) => unknown) => risolvi(esito);
  return catena as unknown as DbFinto;
}

const rigaProdotto = (id: string, negozioId: string) => ({
  id,
  slug: `p-${id}`,
  negozio_id: negozioId,
  nome: `Prodotto ${id}`,
  descrizione: null,
  categoria: "alimentari",
  colore: null,
  materiale: null,
  prezzo: 7.5,
  immagine_principale: null,
  quantita_disponibile: 2,
  quantita_riservata: 0,
  ha_varianti: false,
});

const righe = () => [rigaProdotto("p1", "n1"), rigaProdotto("p2", "n2")];

const raccoglitore = () => {
  const errori: unknown[] = [];
  return { errori, segnalazione: { onErrore: (errore: unknown) => errori.push(errore) } };
};

test.describe("M6-C1.1 — mappaProdottoRicerca (arricchimento nome negozio)", () => {
  test("query negozi riuscita con risultati: prodotti arricchiti, nessuna segnalazione", async () => {
    const { errori, segnalazione } = raccoglitore();
    const prodotti: ProdottoRicerca[] = await mappaProdottoRicerca(
      righe(),
      segnalazione,
      dbFinto({ data: [{ id: "n1", nome: "Panificio" }, { id: "n2", nome: "Caseificio" }], error: null })
    );

    expect(errori).toEqual([]);
    expect(prodotti).toHaveLength(2);
    expect(prodotti.map((p) => p.negozio_nome)).toEqual(["Panificio", "Caseificio"]);
  });

  test("query negozi riuscita senza risultati: i prodotti restano, nessun errore", async () => {
    const { errori, segnalazione } = raccoglitore();
    const prodotti = await mappaProdottoRicerca(
      righe(),
      segnalazione,
      dbFinto({ data: [], error: null })
    );

    expect(errori).toEqual([]);
    expect(prodotti).toHaveLength(2);
    expect(prodotti.every((p) => p.negozio_nome === "")).toBe(true);
  });

  test("errore della query negozi senza callback: comportamento precedente invariato", async () => {
    const prodotti = await mappaProdottoRicerca(
      righe(),
      undefined,
      dbFinto({ data: null, error: { code: "PGRST500" } })
    );
    // Prima di M6-C1.1 un errore di arricchimento non svuotava la lista: i
    // prodotti restavano, senza nome negozio. Il comportamento non cambia.
    expect(prodotti).toHaveLength(2);
    expect(prodotti.every((p) => p.negozio_nome === "")).toBe(true);
  });

  test("errore della query negozi con callback: errore segnalato una volta", async () => {
    const { errori, segnalazione } = raccoglitore();
    const errore = { code: "PGRST500", message: "boom" };
    const prodotti = await mappaProdottoRicerca(
      righe(),
      segnalazione,
      dbFinto({ data: null, error: errore })
    );

    expect(errori).toEqual([errore]);
    // La callback raccoglie soltanto: i prodotti restano con il nome vuoto.
    expect(prodotti).toHaveLength(2);
    expect(prodotti.every((p) => p.negozio_nome === "")).toBe(true);
  });

  test("con l'adapter Pino il guasto di arricchimento non diventa un catalogo vuoto", async () => {
    await expect(
      mappaProdottoRicerca(righe(), segnalazioneDatiPino, dbFinto({ data: null, error: { code: "08006" } }))
    ).rejects.toBeInstanceOf(ErroreDatiNonDisponibiliPino);
  });

  test("nessun prodotto da arricchire: nessuna query e nessuna segnalazione", async () => {
    const { errori, segnalazione } = raccoglitore();
    let accessi = 0;
    const db: DbFinto = {
      from: () => {
        accessi += 1;
        return db;
      },
    } as unknown as DbFinto;

    const prodotti = await mappaProdottoRicerca([], segnalazione, db);
    expect(prodotti).toEqual([]);
    expect(accessi).toBe(0);
    expect(errori).toEqual([]);
  });
});

test.describe("M6-C1.1 — filtraProdottiPerCitta (vincolo città)", () => {
  test("sotto-query riuscita con località: restano solo i prodotti della città", async () => {
    const { errori, segnalazione } = raccoglitore();
    const filtrati = await filtraProdottiPerCitta(
      dbFinto({
        data: [
          { id: "n1", citta: "Castrovillari", indirizzo: "Via Roma 1" },
          { id: "n2", citta: "Cosenza", indirizzo: "Corso 2" },
        ],
        error: null,
      }),
      righe(),
      "Castrovillari",
      segnalazione
    );

    expect(errori).toEqual([]);
    expect(filtrati.map((p) => p.id)).toEqual(["p1"]);
  });

  test("sotto-query riuscita senza risultati: filtro vuoto ma nessun errore", async () => {
    const { errori, segnalazione } = raccoglitore();
    const filtrati = await filtraProdottiPerCitta(
      dbFinto({ data: [], error: null }),
      righe(),
      "Castrovillari",
      segnalazione
    );

    expect(errori).toEqual([]);
    expect(filtrati).toEqual([]);
  });

  test("errore della sotto-query senza callback: comportamento precedente (nessuna eccezione)", async () => {
    await expect(
      filtraProdottiPerCitta(dbFinto({ data: null, error: { code: "PGRST500" } }), righe(), "Castrovillari")
    ).resolves.toEqual([]);
  });

  test("errore della sotto-query con callback: segnalato una volta", async () => {
    const { errori, segnalazione } = raccoglitore();
    const errore = { code: "PGRST500", message: "boom" };
    const filtrati = await filtraProdottiPerCitta(
      dbFinto({ data: null, error: errore }),
      righe(),
      "Castrovillari",
      segnalazione
    );

    expect(filtrati).toEqual([]);
    expect(errori).toEqual([errore]);
  });

  test("con l'adapter Pino i prodotti non vengono azzerati in silenzio", async () => {
    await expect(
      filtraProdottiPerCitta(dbFinto({ data: null, error: { code: "08006" } }), righe(), "Castrovillari", segnalazioneDatiPino)
    ).rejects.toBeInstanceOf(ErroreDatiNonDisponibiliPino);
  });

  test("nessun prodotto da filtrare: nessuna query e nessuna segnalazione", async () => {
    const { errori, segnalazione } = raccoglitore();
    let accessi = 0;
    const db: DbFinto = {
      from: () => {
        accessi += 1;
        return db;
      },
    } as unknown as DbFinto;

    const filtrati = await filtraProdottiPerCitta(db, [], "Castrovillari", segnalazione);
    expect(filtrati).toEqual([]);
    expect(accessi).toBe(0);
    expect(errori).toEqual([]);
  });
});
