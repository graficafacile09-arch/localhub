/**
 * AGENDA ANNUALE — eccezioni per singola data (negozi.data.agenda_eccezioni).
 *
 * Catena di risoluzione (UNICO punto, mai duplicata):
 *   orari settimanali (negozi.orari)  →  agenda_eccezioni  →  risolviGiorno()
 *   →  generaSlotDisponibili()  →  prenotazione
 *
 * `agenda_eccezioni` è un jsonb dentro `negozi.data` con chiave = data civile
 * YYYY-MM-DD (Europe/Rome). Un'eccezione presente per una data PREVALE sul
 * calendario settimanale:
 *   - `chiuso: true`        → giorno non prenotabile (nessuno slot);
 *   - altrimenti le fasce speciali (apertura1/chiusura1 + eventuale
 *     apertura2/chiusura2) sostituiscono quelle settimanali, normalizzate con
 *     `normalizzaGiorno` (mai sovrapposte, fasce incomplete scartate);
 *   - `motivo` opzionale (ferie, festività, chiusura straordinaria...).
 *
 * Le RPC `crea_prenotazione` / `sposta_prenotazione` applicano la STESSA
 * risoluzione (migration 20260916_agenda_eccezioni.sql): la barriera backend
 * non è aggirabile via HTTP.
 *
 * SOLO funzioni pure (nessun import server-only): riusabili dalle route API
 * e dal client (PrenotazioniModule / AgendaCalendario).
 */
import {
  ITALIAN_DAYS,
  type AgendaEccezioni,
  type AgendaEccezione,
  type DaySchedule,
  type Orari,
} from "@/types/negozio";
import { normalizzaGiorno } from "@/lib/orari";
import { TIMEZONE } from "@/lib/prenotazioni-slot";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True se `giorno` è una data civile valida YYYY-MM-DD (Europe/Rome).
 *  Validazione STRETTA: `new Date()` normalizza le date impossibili
 *  (es. 2026-02-30 → 2026-03-02), quindi si controlla giorno-per-mese. */
export function isDataValida(giorno: string): boolean {
  if (!DATA_RE.test(giorno)) return false;
  const [y, m, d] = giorno.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= giorniNelMese(y, m - 1);
}

/**
 * DaySchedule del calendario SETTIMANALE (negozi.orari jsonb, chiavi giorno
 * italiane). `giorno` è civile YYYY-MM-DD; il dow segue extract(dow) di
 * PostgreSQL (0=domenica … 6=sabato) come nelle RPC. Orari mancanti o giorno
 * assente → giorno chiuso (0 slot).
 */
export function getDaySchedule(
  orari: Orari | null | undefined,
  giorno: string
): DaySchedule {
  if (!orari || typeof orari !== "object") {
    return { chiuso: true, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" };
  }
  const dow = new Date(`${giorno}T00:00:00Z`).getUTCDay();
  const chiave = ITALIAN_DAYS[dow];
  const day = orari[chiave];
  if (!day || typeof day !== "object") {
    return { chiuso: true, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" };
  }
  return {
    chiuso: day.chiuso === true,
    apertura1: day.apertura1 ?? "",
    chiusura1: day.chiusura1 ?? "",
    apertura2: day.apertura2 ?? "",
    chiusura2: day.chiusura2 ?? "",
  };
}

/**
 * Normalizza una singola eccezione: fasce incomplete/impossibili scartate,
 * sovrapposte/consecutive fuse (via `normalizzaGiorno`), `motivo` opzionale.
 * Restituisce null se l'input non è un oggetto.
 */
export function normalizzaEccezione(raw: unknown): AgendaEccezione | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const norm = normalizzaGiorno({
    chiuso: r.chiuso === true,
    apertura1: typeof r.apertura1 === "string" ? r.apertura1 : "",
    chiusura1: typeof r.chiusura1 === "string" ? r.chiusura1 : "",
    apertura2: typeof r.apertura2 === "string" ? r.apertura2 : "",
    chiusura2: typeof r.chiusura2 === "string" ? r.chiusura2 : "",
  });
  const eccezione: AgendaEccezione = {
    chiuso: norm.chiuso,
    apertura1: norm.apertura1,
    chiusura1: norm.chiusura1,
    apertura2: norm.apertura2,
    chiusura2: norm.chiusura2,
  };
  const motivo = r.motivo;
  if (typeof motivo === "string" && motivo.trim() !== "") {
    eccezione.motivo = motivo.trim().slice(0, 300);
  }
  return eccezione;
}

/**
 * Normalizza l'intera mappa `agenda_eccezioni`: mantiene solo le chiavi che
 * sono date civili valide e i valori normalizzati. Idempotente: applicare due
 * volte produce lo stesso risultato.
 */
export function normalizzaEccezioni(raw: unknown): AgendaEccezioni {
  const out: AgendaEccezioni = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [chiave, valore] of Object.entries(raw as Record<string, unknown>)) {
    if (!isDataValida(chiave)) continue;
    const eccezione = normalizzaEccezione(valore);
    if (eccezione) out[chiave] = eccezione;
  }
  return out;
}

/**
 * UNICO punto di risoluzione del DaySchedule di una data: eccezione dell'Agenda
 * se presente (prevale), altrimenti calendario settimanale. Usato da:
 *   1. disponibilità pubblica (route);
 *   2. creazione prenotazione (stessa logica nelle RPC via migration);
 *   3. spostamento prenotazione (stessa logica nelle RPC via migration);
 *   4. UI dell'Agenda (PrenotazioniModule / AgendaCalendario).
 */
export function risolviGiorno(
  orari: Orari | null | undefined,
  eccezioni: AgendaEccezioni | null | undefined,
  giorno: string
): DaySchedule {
  const eccezione = eccezioni && eccezioni[giorno];
  if (eccezione && typeof eccezione === "object") {
    return normalizzaGiorno({
      chiuso: eccezione.chiuso === true,
      apertura1: eccezione.apertura1 ?? "",
      chiusura1: eccezione.chiusura1 ?? "",
      apertura2: eccezione.apertura2 ?? "",
      chiusura2: eccezione.chiusura2 ?? "",
    });
  }
  return getDaySchedule(orari, giorno);
}

// ── helper calendario (puri, testabili) ─────────────────────────────────

export type GiornoCalendario = {
  data: string; // YYYY-MM-DD
  giorno: number; // 1..31
  dow: number; // 0=domenica … 6=sabato
  fuoriMese: boolean; // giorno di un mese adiacente che riempie la griglia
};

const MESI_INTERI = new Map([
  [0, 31], [1, 28], [2, 31], [3, 30], [4, 31], [5, 30],
  [6, 31], [7, 31], [8, 30], [9, 31], [10, 30], [11, 31],
]);

/** True se `anno` è bisestile. */
export function isBisestile(anno: number): boolean {
  return (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0;
}

/** Numero di giorni del mese (mese0: 0=gennaio … 11=dicembre). */
export function giorniNelMese(anno: number, mese0: number): number {
  if (mese0 === 1) return isBisestile(anno) ? 29 : 28;
  return MESI_INTERI.get(mese0) ?? 30;
}

/**
 * Griglia del mese (6 settimane × 7 giorni, settimane che iniziano di lunedì):
 * i giorni dei mesi adiacenti necessari a riempire la griglia hanno
 * `fuoriMese: true`. Deterministico (usa Date.UTC, mai timezone locale).
 */
export function giorniDelMese(anno: number, mese0: number): GiornoCalendario[] {
  const primoDow = new Date(Date.UTC(anno, mese0, 1)).getUTCDay(); // 0=dom
  const offsetLunedi = (primoDow + 6) % 7; // celle dei mesi adiacenti prima del 1°
  const inizio = new Date(Date.UTC(anno, mese0, 1 - offsetLunedi));
  const celle: GiornoCalendario[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inizio.getTime() + i * 86_400_000);
    celle.push({
      data: d.toISOString().slice(0, 10),
      giorno: d.getUTCDate(),
      dow: d.getUTCDay(),
      fuoriMese: d.getUTCMonth() !== mese0,
    });
  }
  return celle;
}

/**
 * Sposta la navigazione di `delta` mesi (negativo = indietro) gestendo il
 * cambio anno: dicembre 2026 + 1 → gennaio 2027, gennaio 2026 − 1 →
 * dicembre 2025. Puro e deterministico.
 */
export function spostaMese(
  anno: number,
  mese0: number,
  delta: number
): { anno: number; mese: number } {
  const totale = anno * 12 + mese0 + delta;
  return { anno: Math.floor(totale / 12), mese: ((totale % 12) + 12) % 12 };
}

/** Data civile odierna YYYY-MM-DD in Europe/Rome. */
export function dataCivileOggi(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
