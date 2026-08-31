/**
 * AGENDA — BADGE APPUNTAMENTI NUOVI (test PURI).
 *
 * Verifica la definizione di "nuovo/non letto" (lib/merchant/agenda-badge.ts):
 * appuntamento NUOVO = del negozio corrente, stato `confermata`, `created_at`
 * STRETTAMENTE dopo `data.agenda_ultima_lettura`. Agenda mai aperta → 0
 * (mai lo storico nel badge). Quando il merchant entra in Agenda
 * `agenda_ultima_lettura = now` → gli appuntamenti visualizzati risultano letti
 * e il conteggio si azzera.
 *
 * La "prima vista" del calendario è coperta da tests/agenda-prima-vista.spec.ts.
 */
import { test, expect } from "@playwright/test";
import {
  contaNuoviAppuntamenti,
  getBaselineAgenda,
  getUltimaLetturaAgenda,
  rigaPrenotazionePerBadge,
} from "@/lib/merchant/agenda-badge";

const NEGOZIO = "negozio-corrente";
const ALTRO_NEGOZIO = "altro-negozio";
const ULTIMA_LETTURA = "2026-08-30T12:00:00.000Z";

type Riga = { negozio_id: string; stato: string; created_at: string | null };

function riga(partial: Partial<Riga> = {}): Riga {
  return {
    negozio_id: NEGOZIO,
    stato: "confermata",
    created_at: "2026-08-31T08:00:00.000Z", // dopo ULTIMA_LETTURA → nuovo
    ...partial,
  };
}

test("0 nuovi appuntamenti → conteggio 0 (nessun badge)", () => {
  const righe = [
    riga({ created_at: "2026-08-30T10:00:00.000Z" }), // prima della lettura
    riga({ created_at: "2026-08-30T12:00:00.000Z" }), // esattamente alla lettura (non dopo)
  ];
  expect(contaNuoviAppuntamenti(righe, NEGOZIO, ULTIMA_LETTURA)).toBe(0);
  // nessun appuntamento → 0
  expect(contaNuoviAppuntamenti([], NEGOZIO, ULTIMA_LETTURA)).toBe(0);
});

test("1 nuovo appuntamento → conteggio 1", () => {
  const righe = [
    riga({ created_at: "2026-08-31T09:00:00.000Z" }),
    riga({ created_at: "2026-08-30T08:00:00.000Z" }), // vecchio
  ];
  expect(contaNuoviAppuntamenti(righe, NEGOZIO, ULTIMA_LETTURA)).toBe(1);
});

test("3 nuovi appuntamenti → conteggio 3", () => {
  const righe = [
    riga({ created_at: "2026-08-31T08:00:00.000Z" }),
    riga({ created_at: "2026-08-31T09:00:00.000Z" }),
    riga({ created_at: "2026-08-31T10:00:00.000Z" }),
    riga({ created_at: "2026-08-29T10:00:00.000Z" }), // vecchio
  ];
  expect(contaNuoviAppuntamenti(righe, NEGOZIO, ULTIMA_LETTURA)).toBe(3);
});

test("appuntamenti di un ALTRO negozio non vengono conteggiati", () => {
  const righe = [
    riga({ created_at: "2026-08-31T09:00:00.000Z" }),
    riga({ negozio_id: ALTRO_NEGOZIO, created_at: "2026-08-31T09:00:00.000Z" }),
    riga({ negozio_id: ALTRO_NEGOZIO, created_at: "2026-09-01T09:00:00.000Z" }),
  ];
  // il conteggio è SOLO per il negozio corrente
  expect(contaNuoviAppuntamenti(righe, NEGOZIO, ULTIMA_LETTURA)).toBe(1);
  expect(contaNuoviAppuntamenti(righe, ALTRO_NEGOZIO, ULTIMA_LETTURA)).toBe(2);
});

test("solo gli appuntamenti confermati contano come nuovi", () => {
  const righe = [
    riga({ stato: "confermata", created_at: "2026-08-31T09:00:00.000Z" }),
    riga({ stato: "cancellata", created_at: "2026-08-31T09:00:00.000Z" }),
    riga({ stato: "effettuata", created_at: "2026-08-31T09:00:00.000Z" }),
    riga({ stato: "no_show", created_at: "2026-08-31T09:00:00.000Z" }),
  ];
  expect(contaNuoviAppuntamenti(righe, NEGOZIO, ULTIMA_LETTURA)).toBe(1);
});

test("entrando in Agenda gli appuntamenti risultano letti (ultima lettura = now)", () => {
  const righe = [
    riga({ created_at: "2026-08-31T08:00:00.000Z" }),
    riga({ created_at: "2026-08-31T09:00:00.000Z" }),
  ];
  // prima di entrare: nuovi
  expect(contaNuoviAppuntamenti(righe, NEGOZIO, ULTIMA_LETTURA)).toBe(2);
  // entro in Agenda → ultima_lettura = now (dopo i created_at)
  const dopoLaLettura = "2026-08-31T10:00:00.000Z";
  expect(contaNuoviAppuntamenti(righe, NEGOZIO, dopoLaLettura)).toBe(0);
});

test("Agenda mai aperta (ultimaLettura null) → 0, mai lo storico", () => {
  const righe = [
    riga({ created_at: "2026-08-31T08:00:00.000Z" }),
    riga({ created_at: "2026-08-31T09:00:00.000Z" }),
  ];
  expect(contaNuoviAppuntamenti(righe, NEGOZIO, null)).toBe(0);
  expect(contaNuoviAppuntamenti(righe, NEGOZIO, "")).toBe(0);
  // timestamp non valido → 0
  expect(contaNuoviAppuntamenti(righe, NEGOZIO, "non-una-data")).toBe(0);
});

test("getBaselineAgenda: prende l'ultima lettura (dopo che il merchant ha aperto Agenda)", () => {
  const ultima = "2026-08-31T08:00:00.000Z";
  const creatoNegozio = "2026-08-25T08:00:00.000Z";
  expect(getBaselineAgenda(ultima, creatoNegozio)).toBe(ultima);
});

test("getBaselineAgenda: agenda mai aperta → baseline = data creazione negozio (badge secondo dopo la prima prenotazione)", () => {
  const creatoNegozio = "2026-08-25T08:00:00.000Z";
  // null (mai aperta) → fallback su created_at del negozio
  expect(getBaselineAgenda(null, creatoNegozio)).toBe(creatoNegozio);
  expect(getBaselineAgenda("", creatoNegozio)).toBe(creatoNegozio);
});

test("getBaselineAgenda: nessuna sorgente → null (nessun conteggio)", () => {
  expect(getBaselineAgenda(null, null)).toBeNull();
  expect(getBaselineAgenda(null, undefined)).toBeNull();
  expect(getBaselineAgenda(null, "")).toBeNull();
});

test("getUltimaLetturaAgenda legge data.agenda_ultima_lettura", () => {
  expect(getUltimaLetturaAgenda(null)).toBeNull();
  expect(getUltimaLetturaAgenda(undefined)).toBeNull();
  expect(getUltimaLetturaAgenda({})).toBeNull();
  expect(getUltimaLetturaAgenda({ agenda_ultima_lettura: "" })).toBeNull();
  expect(
    getUltimaLetturaAgenda({ agenda_ultima_lettura: "2026-08-31T08:00:00.000Z" })
  ).toBe("2026-08-31T08:00:00.000Z");
  // valore non stringa → ignorato
  expect(getUltimaLetturaAgenda({ agenda_ultima_lettura: 123 })).toBeNull();
});

test("rigaPrenotazionePerBadge normalizza le righe DB (mai crash)", () => {
  expect(
    rigaPrenotazionePerBadge({ negozio_id: NEGOZIO, stato: "confermata", created_at: "2026-08-31T08:00:00.000Z" })
  ).toEqual({ negozio_id: NEGOZIO, stato: "confermata", created_at: "2026-08-31T08:00:00.000Z" });
  expect(rigaPrenotazionePerBadge(null)).toEqual({ negozio_id: "", stato: "", created_at: null });
  expect(rigaPrenotazionePerBadge({ created_at: null })).toEqual({
    negozio_id: "",
    stato: "",
    created_at: null,
  });
});
