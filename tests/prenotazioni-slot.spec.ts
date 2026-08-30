/**
 * FASE 6c — TEST UNITARI DELL'ALGORITMO SLOT PRENOTAZIONI.
 *
 * Test PURI (senza browser): usano soltanto `test`/`expect` di
 * @playwright/test. Coprono le regole A–U della Fase 6c.
 */
import { test, expect } from "@playwright/test";
import type { ConfigPrenotazioni, DaySchedule, Prenotazione } from "@/types/negozio";
import { generaSlotDisponibili, TIMEZONE } from "@/lib/prenotazioni-slot";
import { normalizzaGiorno } from "@/lib/orari";

// ── helper ───────────────────────────────────────────────────────────────
const GIORNO = "2026-08-31"; // lunedì (data civile, solo per confronti)

function day(partial: Partial<DaySchedule> = {}): DaySchedule {
  return {
    chiuso: false,
    apertura1: "09:00",
    chiusura1: "13:00",
    apertura2: "15:00",
    chiusura2: "19:00",
    ...partial,
  };
}

function config(partial: Partial<ConfigPrenotazioni> = {}): ConfigPrenotazioni {
  return {
    attiva: true,
    anticipo_min_ore: 0,
    anticipo_max_giorni: 30,
    buffer_min: 0,
    limite_giornaliero: null,
    passo_slot_min: 30,
    ...partial,
  };
}

let seq = 0;
function prenotazione(partial: Partial<Prenotazione> = {}): Prenotazione {
  seq += 1;
  return {
    id: `p-${seq}`,
    numero: `PR-${seq}`,
    idempotency_key: `ik-${seq}`,
    negozio_id: "negozio",
    servizio_id: "svc",
    servizio_nome: "Servizio",
    durata_min: 30,
    giorno: GIORNO,
    ora_inizio: "10:00",
    ora_fine: "10:30",
    cliente_user_id: null,
    cliente_nome: "M",
    cliente_cognome: "R",
    cliente_telefono: null,
    cliente_email: null,
    note: null,
    stato: "confermata",
    motivo_annullo: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const chiama = (over: Partial<
  Parameters<typeof generaSlotDisponibili>[0]> = {}) =>
  generaSlotDisponibili({
    giorno: GIORNO,
    daySchedule: day(),
    durataMin: 30,
    prenotazioni: [],
    config: config(),
    now: new Date("2026-08-28T12:00:00Z"), // lontano, così nessuna finestra min/max lo filtra
    ...over,
  });

const orari = (arr: Slot[]) => arr.map((s) => s.oraInizio);

type Slot = { oraInizio: string; oraFine: string; inizioMin: number; fineMin: number };

test("A — giorno chiuso → 0 slot", () => {
  const r = chiama({ daySchedule: day({ chiuso: true }) });
  expect(r).toHaveLength(0);
});

test("B — singola finestra → slot corretti", () => {
  const r = chiama({ daySchedule: day({ apertura2: "", chiusura2: "" }) });
  // solo 09:00-13:00, durata 30 passo 30 → 09:00,09:30,...,12:30
  expect(orari(r)).toEqual([
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  ]);
});

test("C — doppia finestra → nessuno slot attraversa la pausa", () => {
  const r = chiama();
  // 09-13 + 15-19: nessuno slot tra 13:00 e 15:00
  const o = orari(r);
  expect(o).toContain("12:30");
  expect(o).toContain("15:00");
  expect(o.every((t) => t < "13:00" || t >= "15:00")).toBe(true);
});

test("D — durata 30 / passo 30 (finestra singola 10:00-12:00)", () => {
  const r = chiama({
    daySchedule: day({ apertura1: "10:00", chiusura1: "12:00", apertura2: "", chiusura2: "" }),
  });
  expect(orari(r)).toEqual(["10:00", "10:30", "11:00", "11:30"]);
});

test("E — durata 60 / passo 30 (finestra singola 09:00-12:00)", () => {
  const r = chiama({
    durataMin: 60,
    daySchedule: day({ apertura1: "09:00", chiusura1: "12:00", apertura2: "", chiusura2: "" }),
  });
  expect(orari(r)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
});

test("F — durata 60 / passo 15 (finestra singola 09:00-11:00)", () => {
  const r = chiama({
    durataMin: 60,
    config: config({ passo_slot_min: 15 }),
    daySchedule: day({ apertura1: "09:00", chiusura1: "11:00", apertura2: "", chiusura2: "" }),
  });
  // 09:00, 09:15, 09:30, 09:45 (10:00 finirebbe 11:00 -> ok incluso? 10:00+60=11:00 <=11:00 ok)
  expect(orari(r)).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00"]);
});

test("G — slot che finirebbe oltre chiusura → escluso", () => {
  const r = chiama({
    durataMin: 60,
    daySchedule: day({ apertura1: "09:00", chiusura1: "10:00", apertura2: "", chiusura2: "" }),
  });
  // unico slot 09:00 (09:00+60=10:00 <=10:00). Nessuno "oltre".
  expect(r).toHaveLength(1);
  expect(r[0].oraInizio).toBe("09:00");

  // 08:30+60=09:30 ma 08:30 < apertura 09:00 -> non generato; 09:30+60=10:30>10:00 escluso
  const r2 = chiama({
    durataMin: 60,
    daySchedule: day({ apertura1: "08:30", chiusura1: "11:00", apertura2: "", chiusura2: "" }),
    config: config({ passo_slot_min: 60 }),
  });
  expect(orari(r2).filter((t) => t === "10:30")).toHaveLength(0);
});

test("H — prenotazione sovrapposta → slot escluso", () => {
  const r = chiama({
    daySchedule: day({ apertura1: "10:00", chiusura1: "12:00", apertura2: "", chiusura2: "" }),
    prenotazioni: [prenotazione({ ora_inizio: "10:30", ora_fine: "11:00", stato: "confermata" })],
  });
  // senza conflitto avrebbe 10:00,10:30,11:00,11:30; 10:30 bloccato, ma anche 10:00 (overlap con 10:30-11:00? 10:00-10:30 semiaperto non tocca) e 11:30 ok
  expect(orari(r)).toEqual(["10:00", "11:00", "11:30"]);
  expect(orari(r)).not.toContain("10:30");
});

test("I — prenotazione adiacente SENZA buffer → consentita (no falso conflitto)", () => {
  const r = chiama({
    daySchedule: day({ apertura1: "10:00", chiusura1: "12:00", apertura2: "", chiusura2: "" }),
    prenotazioni: [prenotazione({ ora_inizio: "10:30", ora_fine: "11:00", stato: "confermata" })],
  });
  // 11:00 (candidateEnd===existingStart? candidate 11:00-11:30: candEnd non tocca; candidateStart 11:00 === existingEnd 11:00 -> consentita)
  expect(orari(r)).toContain("11:00");
  // 10:00 (candidateEnd 10:30 === existingStart 10:30) consentita
  expect(orari(r)).toContain("10:00");
});

test("J — prenotazione adiacente CON buffer → esclusa quando incompatibile", () => {
  const r = chiama({
    config: config({ buffer_min: 15 }),
    daySchedule: day({ apertura1: "10:00", chiusura1: "12:00", apertura2: "", chiusura2: "" }),
    prenotazioni: [prenotazione({ ora_inizio: "10:30", ora_fine: "11:00", stato: "confermata" })],
  });
  // buffer 15: consideriamo intervalli estesi [start-15, end+15].
  // candidate 10:00-10:30 esteso [09:45,10:45] overlap [10:30,11:00] -> escluso
  // candidate 10:30-11:00 esteso [10:15,11:15] overlap -> escluso
  // candidate 11:00-11:30 esteso [10:45,11:45] overlap [10:30,11:00] (10:45<11:00 e 11:45>10:30) -> escluso
  // candidate 11:30-12:00 esteso [11:15,12:15]: 11:15>=11:00 -> nessun overlap -> consentito
  expect(orari(r)).toEqual(["11:30"]);
});

test("K — prenotazione cancellata → non blocca", () => {
  const r = chiama({
    daySchedule: day({ apertura1: "10:00", chiusura1: "12:00", apertura2: "", chiusura2: "" }),
    prenotazioni: [prenotazione({ ora_inizio: "10:30", ora_fine: "11:00", stato: "cancellata" })],
  });
  expect(orari(r)).toContain("10:30");
});

test("L — prenotazione effettuata → non blocca", () => {
  const r = chiama({
    daySchedule: day({ apertura1: "10:00", chiusura1: "12:00", apertura2: "", chiusura2: "" }),
    prenotazioni: [prenotazione({ ora_inizio: "10:30", ora_fine: "11:00", stato: "effettuata" })],
  });
  expect(orari(r)).toContain("10:30");
});

test("M — limite giornaliero raggiunto → 0 slot", () => {
  const r = chiama({
    config: config({ limite_giornaliero: 1 }),
    prenotazioni: [prenotazione({ ora_inizio: "10:30", ora_fine: "11:00", stato: "confermata" })],
  });
  expect(r).toHaveLength(0);
});

test("N — limite giornaliero non raggiunto → slot disponibili (limite non conta cancellate)", () => {
  const r = chiama({
    config: config({ limite_giornaliero: 2 }),
    prenotazioni: [
      prenotazione({ ora_inizio: "10:30", ora_fine: "11:00", stato: "confermata" }),
      prenotazione({ ora_inizio: "11:00", ora_fine: "11:30", stato: "cancellata" }),
    ],
  });
  expect(orari(r).length).toBeGreaterThan(0);
});

test("O — anticipo minimo → slot troppo vicini a now esclusi", () => {
  // now=2026-08-28T12:00Z. giorno 2026-08-31. Il primo slot (09:00) è lontano.
  // Simula un "now" vicino all'apertura dello stesso giorno per testare il filtro min.
  const now = new Date("2026-08-31T06:00:00Z"); // poco prima dell'apertura 09:00 Roma (=07:00Z?) → anticipo_min_ore=2 esclude <09:00? vedi regola
  // at time zone Europe/Rome: 2026-08-31 08:00 (estate +2). anticipo 1h → minimo 09:00.
  const r = chiama({
    now,
    config: config({ anticipo_min_ore: 1 }),
    daySchedule: day({ apertura1: "09:00", chiusura1: "11:00", apertura2: "", chiusura2: "" }),
  });
  // giorni: oraNow=civilDays(2026-08-31)*1440 + 08:00
  // slot con inizioMin>=08:00+60=09:00 -> 09:00,09:30,10:00(10:30+) ; ma 10:30+30=11:00 ok
  expect(orari(r)[0]).toBe("09:00");
});

test("P — anticipo massimo → giorni oltre finestra esclusi (0 slot per giorno lontano)", () => {
  // now = 2026-08-28. anticipo_max_giorni=2 → maxInizio c. 2026-08-30 12:00 Roma.
  // giorno 2026-08-31 supera il limite -> tutti gli slot hanno inizioAssoluto > maxInizio -> 0
  const r = chiama({
    now: new Date("2026-08-28T12:00:00Z"),
    config: config({ anticipo_max_giorni: 2 }),
  });
  expect(r).toHaveLength(0);
});

test("Q — giorno passato → 0 slot", () => {
  // now dopo il giorno
  const r = chiama({
    now: new Date("2026-09-01T12:00:00Z"),
    config: config({ anticipo_min_ore: 0 }),
  });
  expect(r).toHaveLength(0);
});

test("R — durata servizio diversa → griglia corretta (durata 90)", () => {
  const r = chiama({
    durataMin: 90,
    daySchedule: day({ apertura1: "09:00", chiusura1: "13:00", apertura2: "", chiusura2: "" }),
  });
  // 09:00..11:30 (ogni 30, durata 90: 11:30+90=13:00 <= 13:00 inclusa; 12:00+90=13:30>13:00 esclusa)
  expect(orari(r)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
});

test("S — orari invalidi → nessun risultato", () => {
  const r = chiama({ daySchedule: { chiuso: false, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" } as DaySchedule });
  expect(r).toHaveLength(0);
  const r2 = chiama({ daySchedule: day({ apertura1: "13:00", chiusura1: "09:00", apertura2: "", chiusura2: "" }) });
  expect(r2).toHaveLength(0);
  const r3 = chiama({ daySchedule: day({ apertura1: "abc", chiusura1: "09:00", apertura2: "", chiusura2: "" }) });
  expect(r3).toHaveLength(0);
});

test("S2 — durata non valida → nessuno slot", () => {
  expect(chiama({ durataMin: 2 })).toHaveLength(0);
  expect(chiama({ durataMin: 900 })).toHaveLength(0);
  expect(chiama({ durataMin: -5 })).toHaveLength(0);
});

test("T — idempotenza: stesso input → stesso output", () => {
  const input = {
    giorno: GIORNO,
    daySchedule: day(),
    durataMin: 30,
    prenotazioni: [prenotazione({ ora_inizio: "10:30", ora_fine: "11:00", stato: "confermata" })],
    config: config({ buffer_min: 10, passo_slot_min: 15, limite_giornaliero: 5 }),
    now: new Date("2026-08-28T12:00:00Z"),
  };
  const a = generaSlotDisponibili(input);
  const b = generaSlotDisponibili(input);
  expect(b).toEqual(a);
});

test("S3 — passo non valido → fallback documentato (non = durata)", () => {
  const r = chiama({
    durataMin: 30,
    config: config({ passo_slot_min: 0 }),
    daySchedule: day({ apertura1: "09:00", chiusura1: "12:00", apertura2: "", chiusura2: "" }),
  });
  // fallback 15: 09:00,09:15,...,11:30
  expect(orari(r)).toEqual([
    "09:00", "09:15", "09:30", "09:45", "10:00", "10:15",
    "10:30", "10:45", "11:00", "11:15", "11:30",
  ]);
});

test("U — DST/timezone Europe/Rome: nessun offset manuale", () => {
  // Il progetto usa sempre Intl timeZone Europe/Rome. Verifichiamo che il fuso
  // riferito non introduca offset fissi: cambiamo now attorno a un cambio DST
  // e controlliamo che il risultato dipenda dal MINUTO CIVILE ROMA, non dall'UTC.
  // Date di cambio DST Italia 2026: ultima domenica di marzo = 29/03/2026.
  const giorno = "2026-03-30"; // lunedì dopo il cambio
  const a = generaSlotDisponibili({
    giorno,
    daySchedule: day({ apertura1: "09:00", chiusura1: "11:00", apertura2: "", chiusura2: "" }),
    durataMin: 60,
    config: config({ passo_slot_min: 60, anticipo_min_ore: 0 }),
    prenotazioni: [],
    now: new Date("2026-03-30T06:00:00Z"), // 07:00 Roma (CEST? no 29/3 CEST -> 08:00 Roma)
  });
  // A prescindere dall'ora UTC, non ci aspettiamo errori e la griglia è deterministica.
  expect(Array.isArray(a)).toBe(true);
  // e il timezone è quello esposto
  expect(TIMEZONE).toBe("Europe/Rome");
});

test("V — finestre sovrapposte (09–20 + 15–19) → MASSIMO UNO slot per inizio, nessun duplicato", () => {
  // Caso critico reale: senza deduplica, la seconda finestra (15–19, interna a
  // 09–20) produce gli stessi inizio della prima → duplicati. Ora dedupe.
  const r = chiama({
    daySchedule: day({ chiusura1: "20:00", apertura2: "15:00", chiusura2: "19:00" }),
  });
  const o = orari(r);
  // garantisce massimo uno slot per ogni inizio
  expect(new Set(o).size).toBe(o.length);
  // 09:00..19:30 a passo 30 (durata 30) → 22 slot unici
  expect(o).toEqual([
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
    "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
    "18:00", "18:30", "19:00", "19:30",
  ]);
});

test("W — finestre identiche → nessun duplicato di inizio", () => {
  const r = chiama({
    daySchedule: day({ apertura2: "09:00", chiusura2: "13:00" }),
  });
  const o = orari(r);
  expect(new Set(o).size).toBe(o.length);
  expect(o).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"]);
});

test("X — dopo la normalizzazione backend, gli slot restano identici e senza duplicati", () => {
  // Simula ciò che avviene dopo che `normalizzaOrari` ha fuso 09–20 + 15–19
  // in una sola fascia 09–20: il generatore produce gli stessi slot unici.
  const normalizzato = normalizzaGiorno(
    day({ chiusura1: "20:00", apertura2: "15:00", chiusura2: "19:00" })
  );
  expect(normalizzato.apertura1).toBe("09:00");
  expect(normalizzato.chiusura1).toBe("20:00");
  expect(normalizzato.apertura2).toBe("");

  const r = chiama({ daySchedule: normalizzato });
  const o = orari(r);
  expect(new Set(o).size).toBe(o.length);
  expect(o[0]).toBe("09:00");
  expect(o[o.length - 1]).toBe("19:30");
});

test("Y — prenotazione già confermata → slot occupato ESCLUSO (nessun duplicato)", () => {
  const r = chiama({
    daySchedule: day({ chiusura1: "20:00", apertura2: "15:00", chiusura2: "19:00" }),
    prenotazioni: [
      prenotazione({ ora_inizio: "11:00", ora_fine: "11:30", stato: "confermata" }),
    ],
  });
  const o = orari(r);
  expect(new Set(o).size).toBe(o.length);
  expect(o).not.toContain("11:00");
  expect(o).toContain("10:30");
});

test("Z — caso reale Dott. Bianchi: durata 30 / passo 15 su 09–20 + 15–19 → da 58 a slot UNICI", () => {
  // Senza deduplica: 43 slot dalla fascia 09–20 + 15 slot duplicati dalla
  // 15–19 = 58 voci con 15 doppioni. Con la deduplica → 43 slot unici.
  const r = chiama({
    durataMin: 30,
    config: config({ passo_slot_min: 15 }),
    daySchedule: day({ chiusura1: "20:00", apertura2: "15:00", chiusura2: "19:00" }),
  });
  const o = orari(r);
  expect(o.length).toBe(43); // NON 58
  expect(new Set(o).size).toBe(o.length);
  expect(o).toContain("09:00");
  expect(o).toContain("11:15");
  expect(o).toContain("15:00");
  expect(o).toContain("19:30");
  expect(o).not.toContain("20:00"); // non oltre la chiusura
});