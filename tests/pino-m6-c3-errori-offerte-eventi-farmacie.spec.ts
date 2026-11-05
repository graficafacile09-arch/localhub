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
  segnalaErroreFarmaciePino,
  segnalazioneDatiPino,
  segnalazioneFarmaciePino,
} from "../lib/assistente/tools";
import { getOffertePubbliche } from "../lib/offerte";
import { getEventiPubblici } from "../lib/eventi";
import { ErroreFonteFarmacie, getFarmacieTurnoCastrovillari, parseFarmacieTurno } from "../lib/farmacie-turno";

// ─── M6-C3: errori offerte, eventi e farmacie ───────────────────────────────
//
// Obiettivo: distinguere "non c'e' nulla" da "la fonte non ha risposto".
// Offerte ed eventi usano la segnalazione M6-C1 (PostgREST/configurazione);
// le farmacie distinguono HTTP, timeout, rete e risposta non riconosciuta.

type EsitoFinto = { data?: unknown; error?: unknown };

type DbFinto = NonNullable<Parameters<typeof getOffertePubbliche>[1]>;

function dbFinto(esito: EsitoFinto): DbFinto {
  const catena: Record<string, unknown> = {};
  for (const passo of ["from", "select", "eq", "in", "is", "order", "limit"]) {
    catena[passo] = () => catena;
  }
  catena.then = (risolvi: (valore: EsitoFinto) => unknown) => risolvi(esito);
  return catena as unknown as DbFinto;
}

const raccoglitore = () => {
  const errori: unknown[] = [];
  return { errori, segnalazione: { onErrore: (errore: unknown) => errori.push(errore) } };
};

const offerta = (id: string) => ({
  id,
  negozio_id: "n1",
  titolo: "Sconto pane",
  descrizione: null,
  prezzo_originale: 3,
  prezzo_offerta: 2,
  immagine_url: null,
  data_inizio: null,
  data_fine: null,
  attiva: true,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
});

const evento = (id: string) => ({
  id,
  negozio_id: "n1",
  titolo: "Concerto",
  descrizione: null,
  immagine_url: null,
  luogo: "Piazza",
  data_inizio: null,
  data_fine: null,
  attivo: true,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
});

const fetchFinto = (
  esito: { ok: boolean; status?: number; testo?: string } | { errore: unknown }
): typeof fetch =>
  (async () => {
    if ("errore" in esito) throw esito.errore;
    return {
      ok: esito.ok,
      status: esito.status ?? 200,
      text: async () => esito.testo ?? "",
    } as unknown as Response;
  }) as unknown as typeof fetch;

const HTML_FARMACIE =
  '<div itemscope itemtype="https://schema.org/Pharmacy" class="farmacia-box">' +
  '<span class="pharmacyname">Farmacia Centrale</span>' +
  "<a class='orario'>Apertura: 8:30-13:00</a>" +
  '<a href="tel:0981123456">0981123456</a>' +
  "</div>";

const HTML_VUOTO_VALIDO =
  "<html><body><h1>Farmacie di turno a Castrovillari</h1>" +
  "<p>Nessuna farmacia risulta in turno per la giornata odierna.</p>" +
  "<p>La pagina viene aggiornata ogni mattina con i turni del comune.</p>" +
  "</body></html>";

const HTML_NON_VALIDO = "<html><body>Manutenzione</body></html>";

test.describe("M6-C3 — offerte", () => {
  test("offerte con dati: nessuna segnalazione", async () => {
    const { errori, segnalazione } = raccoglitore();
    const offerte = await getOffertePubbliche(
      segnalazione,
      dbFinto({ data: [offerta("o1")], error: null })
    );

    expect(errori).toEqual([]);
    expect(offerte.map((o) => o.id)).toEqual(["o1"]);
  });

  test("offerte realmente vuote: lista vuota e nessun errore", async () => {
    const { errori, segnalazione } = raccoglitore();
    const offerte = await getOffertePubbliche(segnalazione, dbFinto({ data: [], error: null }));

    expect(offerte).toEqual([]);
    expect(errori).toEqual([]);
  });

  test("errore PostgREST: segnalato, lista vuota come prima", async () => {
    const { errori, segnalazione } = raccoglitore();
    const errore = { code: "PGRST500", message: "boom" };
    const offerte = await getOffertePubbliche(segnalazione, dbFinto({ data: null, error: errore }));

    expect(offerte).toEqual([]);
    expect(errori).toEqual([errore]);
  });

  test("con l'adapter Pino l'errore offerte non diventa catalogo vuoto", async () => {
    await expect(
      getOffertePubbliche(segnalazioneDatiPino, dbFinto({ data: null, error: { code: "08006" } }))
    ).rejects.toBeInstanceOf(ErroreDatiNonDisponibiliPino);
  });

  test("client Supabase mancante: segnalato, non silenzioso", async () => {
    const { errori, segnalazione } = raccoglitore();
    expect(await getOffertePubbliche(segnalazione, null)).toEqual([]);
    expect(errori).toHaveLength(1);
  });
});

test.describe("M6-C3 — eventi", () => {
  test("eventi con dati: nessuna segnalazione", async () => {
    const { errori, segnalazione } = raccoglitore();
    const eventi = await getEventiPubblici(
      segnalazione,
      dbFinto({ data: [evento("e1")], error: null })
    );

    expect(errori).toEqual([]);
    expect(eventi.map((e) => e.id)).toEqual(["e1"]);
  });

  test("eventi realmente vuoti: lista vuota e nessun errore", async () => {
    const { errori, segnalazione } = raccoglitore();
    const eventi = await getEventiPubblici(segnalazione, dbFinto({ data: [], error: null }));

    expect(eventi).toEqual([]);
    expect(errori).toEqual([]);
  });

  test("errore PostgREST: segnalato, lista vuota come prima", async () => {
    const { errori, segnalazione } = raccoglitore();
    const errore = { code: "PGRST500", message: "boom" };
    const eventi = await getEventiPubblici(segnalazione, dbFinto({ data: null, error: errore }));

    expect(eventi).toEqual([]);
    expect(errori).toEqual([errore]);
  });

  test("con l'adapter Pino l'errore eventi non diventa lista vuota", async () => {
    await expect(
      getEventiPubblici(segnalazioneDatiPino, dbFinto({ data: null, error: { code: "08006" } }))
    ).rejects.toBeInstanceOf(ErroreDatiNonDisponibiliPino);
  });

  test("client Supabase mancante: segnalato", async () => {
    const { errori, segnalazione } = raccoglitore();
    expect(await getEventiPubblici(segnalazione, null)).toEqual([]);
    expect(errori).toHaveLength(1);
  });
});

test.describe("M6-C3 — farmacie di turno", () => {
  test("parser tollera attributi riordinati, virgolette singole e schema.org http", () => {
    const html = "<div class='farmacia-box' itemtype='http://schema.org/Pharmacy' itemscope>" +
      "<span itemprop='name'>Farmacia Test</span>" +
      "<span class='btorario'>TURNO</span>" +
      "<a class='orario'>Apertura: 8:30-13:00<br>Turno*: fino alle 16:00</a>" +
      "<a href='tel:0981123456'>0981123456</a></div>";
    const farmacie = parseFarmacieTurno(html);
    expect(farmacie).toHaveLength(1);
    expect(farmacie[0]).toMatchObject({
      nome: "Farmacia Test",
      stato: "turno",
      apertura: "8:30-13:00",
      turno: "fino alle 16:00",
      telefono: "0981123456",
    });
  });

  test("risposta valida con farmacie: dati estratti, nessuna segnalazione", async () => {
    const { errori, segnalazione } = raccoglitore();
    const farmacie = await getFarmacieTurnoCastrovillari(
      segnalazione,
      fetchFinto({ ok: true, testo: HTML_FARMACIE })
    );

    expect(errori).toEqual([]);
    expect(farmacie).toHaveLength(1);
    expect(farmacie[0].nome).toBe("Farmacia Centrale");
    expect(farmacie[0].apertura).toBe("8:30-13:00");
  });

  test("risposta valida senza farmacie: nessuna farmacia, nessun errore", async () => {
    const { errori, segnalazione } = raccoglitore();
    const farmacie = await getFarmacieTurnoCastrovillari(
      segnalazione,
      fetchFinto({ ok: true, testo: HTML_VUOTO_VALIDO })
    );

    expect(farmacie).toEqual([]);
    expect(errori).toEqual([]);
  });

  test("HTTP non riuscito: segnalato con il codice dello status", async () => {
    const { errori, segnalazione } = raccoglitore();
    const farmacie = await getFarmacieTurnoCastrovillari(
      segnalazione,
      fetchFinto({ ok: false, status: 503 })
    );

    expect(farmacie).toEqual([]);
    expect(errori).toHaveLength(1);
    expect((errori[0] as ErroreFonteFarmacie).code).toBe("HTTP_503");
  });

  test("timeout: codice TIMEOUT distinto dal guasto di rete", async () => {
    const timeout = Object.assign(new Error("aborted"), { name: "AbortError" });
    const { errori, segnalazione } = raccoglitore();
    const farmacie = await getFarmacieTurnoCastrovillari(segnalazione, fetchFinto({ errore: timeout }));

    expect(farmacie).toEqual([]);
    expect((errori[0] as ErroreFonteFarmacie).code).toBe("TIMEOUT");
  });

  test("errore di rete: codice RETE", async () => {
    const { errori, segnalazione } = raccoglitore();
    const farmacie = await getFarmacieTurnoCastrovillari(
      segnalazione,
      fetchFinto({ errore: new TypeError("fetch failed") })
    );

    expect(farmacie).toEqual([]);
    expect((errori[0] as ErroreFonteFarmacie).code).toBe("RETE");
  });

  test("risposta non riconosciuta: codice RISPOSTA_NON_VALIDA", async () => {
    const { errori, segnalazione } = raccoglitore();
    const farmacie = await getFarmacieTurnoCastrovillari(
      segnalazione,
      fetchFinto({ ok: true, testo: HTML_NON_VALIDO })
    );

    expect(farmacie).toEqual([]);
    expect((errori[0] as ErroreFonteFarmacie).code).toBe("RISPOSTA_NON_VALIDA");
  });

  test("senza callback il comportamento resta quello preesistente", async () => {
    expect(
      await getFarmacieTurnoCastrovillari(undefined, fetchFinto({ ok: false, status: 500 }))
    ).toEqual([]);
    expect(
      await getFarmacieTurnoCastrovillari(undefined, fetchFinto({ errore: new TypeError("x") }))
    ).toEqual([]);
  });

  test("adapter farmacie: HTTP e risposta non valida sono errori dati", () => {
    for (const codice of ["HTTP_503", "RISPOSTA_NON_VALIDA", "RETE"]) {
      let catturato: unknown = null;
      try {
        segnalaErroreFarmaciePino(new ErroreFonteFarmacie(codice));
      } catch (errore) {
        catturato = errore;
      }
      expect(catturato).toBeInstanceOf(ErroreDatiNonDisponibiliPino);
      expect((catturato as ErroreDatiNonDisponibiliPino).codice).toBe(codice);
    }
  });

  test("adapter farmacie: TIMEOUT resta timeout per M6-A", () => {
    let catturato: unknown = null;
    try {
      segnalaErroreFarmaciePino(new ErroreFonteFarmacie("TIMEOUT"));
    } catch (errore) {
      catturato = errore;
    }
    expect((catturato as Error).name).toBe("TimeoutError");
    expect(catturato).not.toBeInstanceOf(ErroreDatiNonDisponibiliPino);
  });

  test("con l'adapter farmacie il guasto HTTP non e' una lista vuota", async () => {
    await expect(
      getFarmacieTurnoCastrovillari(segnalazioneFarmaciePino, fetchFinto({ ok: false, status: 503 }))
    ).rejects.toBeInstanceOf(ErroreDatiNonDisponibiliPino);
  });
});

test.describe("M6-C3 — classificazione M6-A", () => {
  const invocazione = (tool: string): ToolInvocation =>
    ({ tool, params: { query: "x" } }) as unknown as ToolInvocation;

  test("errore dati offerte/eventi: stato errore", async () => {
    const esiti = await eseguiInvocazioniPino([invocazione("searchOffers")], async () => {
      throw new ErroreDatiNonDisponibiliPino("PGRST500");
    });
    expect(esiti[0].stato).toBe("errore");
    expect(riepilogoEsitiInvocazioniPino(esiti)).toMatchObject({
      fallite: 1,
      timeout: 0,
      tutteFallite: true,
    });
  });

  test("timeout farmacie: stato timeout, non errore", async () => {
    const esiti = await eseguiInvocazioniPino([invocazione("searchPharmacies")], async () => {
      const timeout = new Error("timeout fonte farmacie");
      timeout.name = "TimeoutError";
      throw timeout;
    });
    expect(esiti[0].stato).toBe("timeout");
    expect(riepilogoEsitiInvocazioniPino(esiti)).toMatchObject({
      fallite: 0,
      timeout: 1,
      tutteFallite: true,
    });
  });
});

test.describe("M6-C3 — invarianti di codice", () => {
  const normalizza = (testo: string) => testo.replace(/\r\n/g, "\n");
  const tools = normalizza(readFileSync(join(process.cwd(), "lib/assistente/tools.ts"), "utf8"));

  test("i tre wrapper attivano l'adapter, il fallback searchAll resta tollerante", () => {
    expect(tools).toContain("getOffertePubbliche(segnalazione)");
    expect(tools).toContain("getEventiPubblici(segnalazione)");
    expect(tools).toContain("getFarmacieTurnoCastrovillari(segnalazione)");

    const inizio = tools.indexOf("export async function searchAll(");
    expect(inizio).toBeGreaterThan(-1);
    const fine = tools.indexOf("\nexport ", inizio + 10);
    const corpo = tools.slice(inizio, fine === -1 ? tools.length : fine);
    expect(corpo).toContain("searchOffers(q, 5, {})");
    expect(corpo).toContain("searchEvents(q, 5, {})");
  });
});
