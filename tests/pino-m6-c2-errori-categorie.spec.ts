import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  eseguiInvocazioniPino,
  riepilogoEsitiInvocazioniPino,
  type ToolInvocation,
} from "../lib/assistente/index";
import {
  ErroreDatiNonDisponibiliPino,
  getCategoriesList,
  segnalazioneDatiPino,
} from "../lib/assistente/tools";
import {
  getCategorie,
  getCategorieConNegozi,
  getConteggiNegoziPerCategoria,
} from "../lib/negozi";
import type { Categoria } from "../types/negozio";

// ─── M6-C2: errori categorie e conteggi ─────────────────────────────────────
//
// Prima di M6-C2 un guasto delle query restituiva le categorie statiche con
// conteggio zero: un dato falso ("nessun negozio in questa categoria"). Ora la
// segnalazione e' opzionale: senza callback nulla cambia per il sito, con la
// callback di Pino l'errore interrompe il calcolo e M6-A lo classifica errore.

type EsitoFinto = { data?: unknown; error?: unknown };

type DbFinto = NonNullable<Parameters<typeof getCategorie>[1]>;

function dbFinto(esiti: { categorie?: EsitoFinto; negozi?: EsitoFinto } = {}): DbFinto {
  let corrente: EsitoFinto = { data: [], error: null };
  const catena: Record<string, unknown> = {};
  catena.from = (tabella: string) => {
    corrente = esiti[tabella as "categorie" | "negozi"] ?? { data: [], error: null };
    return catena;
  };
  for (const passo of ["select", "eq", "in", "is", "order", "limit", "range"]) {
    catena[passo] = () => catena;
  }
  catena.then = (risolvi: (valore: EsitoFinto) => unknown) => risolvi(corrente);
  return catena as unknown as DbFinto;
}

const categoriaSport = (): Categoria =>
  ({ id: "cat-sport", slug: "sport", nome: "Sport" }) as unknown as Categoria;

const raccoglitore = () => {
  const errori: unknown[] = [];
  return { errori, segnalazione: { onErrore: (errore: unknown) => errori.push(errore) } };
};

test.describe("M6-C2 — getCategorie e getConteggiNegoziPerCategoria", () => {
  test("categorie recuperate correttamente: nessuna segnalazione", async () => {
    const { errori, segnalazione } = raccoglitore();
    const categorie = await getCategorie(
      segnalazione,
      dbFinto({ categorie: { data: [categoriaSport()], error: null } })
    );

    expect(errori).toEqual([]);
    expect(categorie.map((c) => c.slug)).toEqual(["sport"]);
  });

  test("errore della query categorie: segnalato e lista vuota come prima", async () => {
    const { errori, segnalazione } = raccoglitore();
    const errore = { code: "PGRST500", message: "boom" };
    const categorie = await getCategorie(
      segnalazione,
      dbFinto({ categorie: { data: null, error: errore } })
    );

    expect(categorie).toEqual([]);
    expect(errori).toEqual([errore]);
  });

  test("conteggi recuperati correttamente per categoria", async () => {
    const { errori, segnalazione } = raccoglitore();
    const conteggi = await getConteggiNegoziPerCategoria(
      [categoriaSport()],
      segnalazione,
      dbFinto({ negozi: { data: [{ categoria: "Sport" }, { categoria: "Sport" }], error: null } })
    );

    expect(errori).toEqual([]);
    expect(conteggi.get("cat-sport")).toBe(2);
  });

  test("errore della query conteggi: segnalato e mappa vuota come prima", async () => {
    const { errori, segnalazione } = raccoglitore();
    const errore = { code: "PGRST500", message: "boom" };
    const conteggi = await getConteggiNegoziPerCategoria(
      [categoriaSport()],
      segnalazione,
      dbFinto({ negozi: { data: null, error: errore } })
    );

    expect(conteggi.size).toBe(0);
    expect(errori).toEqual([errore]);
  });
});

test.describe("M6-C2 — getCategorieConNegozi", () => {
  test("categorie e conteggi corretti: nessun falso errore", async () => {
    const { errori, segnalazione } = raccoglitore();
    const categorie = await getCategorieConNegozi(
      segnalazione,
      dbFinto({
        categorie: { data: [categoriaSport()], error: null },
        negozi: { data: [{ categoria: "Sport" }, { categoria: "Sport" }], error: null },
      })
    );

    expect(errori).toEqual([]);
    const sport = categorie.find((c) => c.categoria.slug === "sport");
    expect(sport?.count).toBe(2);
    expect(sport?.categoria.nome).toBe("Sport");
  });

  test("categoria realmente senza negozi: conteggio zero valido, nessuna segnalazione", async () => {
    const { errori, segnalazione } = raccoglitore();
    const categorie = await getCategorieConNegozi(
      segnalazione,
      dbFinto({
        categorie: { data: [categoriaSport()], error: null },
        negozi: { data: [], error: null },
      })
    );

    expect(errori).toEqual([]);
    expect(categorie.find((c) => c.categoria.slug === "sport")?.count).toBe(0);
  });

  test("errore query categorie senza callback: comportamento precedente (nessuna eccezione)", async () => {
    const categorie = await getCategorieConNegozi(
      undefined,
      dbFinto({ categorie: { data: null, error: { code: "PGRST500" } } })
    );

    // Prima di M6-C2 il guasto produceva le categorie statiche con count 0.
    expect(categorie.length).toBeGreaterThan(0);
    expect(categorie.every((c) => c.count === 0)).toBe(true);
  });

  test("errore query categorie con adapter Pino: errore tipizzato", async () => {
    await expect(
      getCategorieConNegozi(
        segnalazioneDatiPino,
        dbFinto({ categorie: { data: null, error: { code: "PGRST500" } } })
      )
    ).rejects.toBeInstanceOf(ErroreDatiNonDisponibiliPino);
  });

  test("errore query conteggi con callback: segnalato una volta", async () => {
    const { errori, segnalazione } = raccoglitore();
    const errore = { code: "PGRST500", message: "boom" };
    const categorie = await getCategorieConNegozi(
      segnalazione,
      dbFinto({
        categorie: { data: [categoriaSport()], error: null },
        negozi: { data: null, error: errore },
      })
    );

    expect(errori).toEqual([errore]);
    expect(categorie.find((c) => c.categoria.slug === "sport")?.count).toBe(0);
  });

  test("errore query conteggi con adapter Pino: nessun conteggio zero spacciato per reale", async () => {
    await expect(
      getCategorieConNegozi(
        segnalazioneDatiPino,
        dbFinto({
          categorie: { data: [categoriaSport()], error: null },
          negozi: { data: null, error: { code: "08006" } },
        })
      )
    ).rejects.toBeInstanceOf(ErroreDatiNonDisponibiliPino);
  });

  test("client Supabase non disponibile: segnalato, non silenzioso", async () => {
    const { errori, segnalazione } = raccoglitore();
    const categorie = await getCategorieConNegozi(segnalazione, null);

    expect(categorie.length).toBeGreaterThan(0);
    expect(categorie.every((c) => c.count === 0)).toBe(true);
    expect(errori).toHaveLength(1);
  });

  test("client mancante con adapter Pino: errore tipizzato", async () => {
    await expect(getCategorieConNegozi(segnalazioneDatiPino, null)).rejects.toBeInstanceOf(
      ErroreDatiNonDisponibiliPino
    );
  });
});

test.describe("M6-C2 — tool getCategories e classificazione M6-A", () => {
  test("il tool propaga l'errore della query categorie all'adapter", async () => {
    await expect(
      getCategoriesList(dbFinto({ categorie: { data: null, error: { code: "PGRST500" } } }))
    ).rejects.toBeInstanceOf(ErroreDatiNonDisponibiliPino);
  });

  test("il tool restituisce l'elenco ordinato per conteggio quando le query riescono", async () => {
    const elenco = await getCategoriesList(
      dbFinto({
        categorie: { data: [categoriaSport()], error: null },
        negozi: { data: [{ categoria: "Sport" }, { categoria: "Sport" }], error: null },
      })
    );

    expect(elenco[0]).toEqual({ nome: "Sport", count: 2 });
    expect(elenco.length).toBeLessThanOrEqual(20);
    expect(elenco.every((c, i) => i === 0 || elenco[i - 1].count >= c.count)).toBe(true);
  });

  test("M6-A classifica l'errore dati come errore, non vuoto né timeout", async () => {
    const invocazione = {
      tool: "getCategories",
      params: {},
    } as unknown as ToolInvocation;

    const esiti = await eseguiInvocazioniPino([invocazione], async () => {
      throw new ErroreDatiNonDisponibiliPino("PGRST500");
    });

    expect(esiti[0].stato).toBe("errore");
    expect(riepilogoEsitiInvocazioniPino(esiti)).toMatchObject({
      fallite: 1,
      timeout: 0,
      vuote: 0,
      tutteFallite: true,
    });
  });

  test("il fallback di searchAll resta tollerante (nessun adapter)", () => {
    const sorgente = readFileSync(join(process.cwd(), "lib/assistente/tools.ts"), "utf8").replace(
      /\r\n/g,
      "\n"
    );
    const inizio = sorgente.indexOf("export async function searchAll(");
    expect(inizio).toBeGreaterThan(-1);
    const fine = sorgente.indexOf("\nexport ", inizio + 10);
    const corpo = sorgente.slice(inizio, fine === -1 ? sorgente.length : fine);
    expect(corpo).toContain("elencoCategorie(),");
    expect(corpo).not.toContain("getCategoriesList(),");
  });
});
