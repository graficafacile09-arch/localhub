/**
 * AGENDA ANNUALE — TEST PURI (senza browser/DB).
 *
 * Coprono la catena: orari settimanali → agenda_eccezioni → risolviGiorno()
 * → generaSlotDisponibili(). La barriera backend (RPC crea_prenotazione /
 * sposta_prenotazione su giorni chiusi o con orario speciale) è implementata
 * nella migration 20260916_agenda_eccezioni.sql (create or replace delle 2
 * RPC, NON applicata al DB remoto) e usa la STESSA risoluzione qui testata:
 * i casi 6–8 verificano quindi il comportamento condiviso via `risolviGiorno`
 * + `generaSlotDisponibili` (0 slot su giorno chiuso → la RPC risponde
 * STORE_CLOSED/SLOT_OUTSIDE_HOURS).
 */
import { test, expect } from "@playwright/test";
import type {
  AgendaEccezioni,
  ConfigPrenotazioni,
  DaySchedule,
  Negozio,
  Orari,
  Prenotazione,
} from "@/types/negozio";
import { generaSlotDisponibili } from "@/lib/prenotazioni-slot";
import { normalizzaGiorno } from "@/lib/orari";
import {
  giorniDelMese,
  giorniNelMese,
  isBisestile,
  isDataValida,
  normalizzaEccezioni,
  risolviGiorno,
  spostaMese,
} from "@/lib/agenda";
import { attivitaHaAgenda, getProfiloPerTemplate } from "@/lib/profili-attivita";

// ── helper ───────────────────────────────────────────────────────────────
const LUNEDI = "2026-08-31"; // data civile, lunedì (Europe/Rome)
const MARTEDI = "2026-09-01";
/** Riferimento temporale: la vigilia di LUNEDI, dentro la finestra di prenotazione. */
const ORA_TEST = new Date("2026-08-30T12:00:00Z");

/** Settimana: lun–ven 09–13 + 15–19, sab/dom chiusi (per i confronti). */
function orariSettimanali(): Orari {
  const aperto: DaySchedule = {
    chiuso: false,
    apertura1: "09:00",
    chiusura1: "13:00",
    apertura2: "15:00",
    chiusura2: "19:00",
  };
  const chiuso: DaySchedule = {
    chiuso: true,
    apertura1: "",
    chiusura1: "",
    apertura2: "",
    chiusura2: "",
  };
  return {
    "lunedì": { ...aperto },
    "martedì": { ...aperto },
    "mercoledì": { ...aperto },
    "giovedì": { ...aperto },
    "venerdì": { ...aperto },
    "sabato": { ...chiuso },
    "domenica": { ...chiuso },
  };
}

function config(partial: Partial<ConfigPrenotazioni> = {}): ConfigPrenotazioni {
  return {
    attiva: true,
    anticipo_min_ore: 0,
    anticipo_max_giorni: 30,
    buffer_min: 0,
    limite_giornaliero: null,
    passo_slot_min: 15,
    ...partial,
  };
}

let seq = 0;
function prenotazione(partial: Partial<Prenotazione> = {}): Prenotazione {
  seq += 1;
  return {
    id: `ag-${seq}`,
    numero: `PR-${seq}`,
    idempotency_key: `ik-${seq}`,
    negozio_id: "negozio",
    servizio_id: "s1",
    servizio_nome: "Consulenza",
    durata_min: 30,
    giorno: LUNEDI,
    ora_inizio: "10:00",
    ora_fine: "10:30",
    cliente_user_id: null,
    cliente_nome: "Mario",
    cliente_cognome: "Rossi",
    cliente_telefono: null,
    cliente_email: "mario@example.com",
    note: null,
    stato: "confermata",
    motivo_annullo: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function storeConProfilo(tipo: string): Negozio {
  return { data: { tipo_attivita: tipo }, moduli_attivi: [] } as unknown as Negozio;
}

// ── 1. risolviGiorno senza eccezione → calendario settimanale ───────────
test("1. risolviGiorno senza eccezione usa il calendario settimanale", () => {
  const orari = orariSettimanali();
  const giorno = risolviGiorno(orari, null, LUNEDI);
  expect(giorno.chiuso).toBe(false);
  expect(giorno.apertura1).toBe("09:00");
  expect(giorno.chiusura1).toBe("13:00");
  expect(giorno.apertura2).toBe("15:00");
  expect(giorno.chiusura2).toBe("19:00");

  // sabato: chiuso per calendario settimanale (senza eccezioni)
  const sabato = risolviGiorno(orari, null, "2026-09-05");
  expect(sabato.chiuso).toBe(true);
  // orari assenti → chiuso (0 slot)
  expect(risolviGiorno(null, null, LUNEDI).chiuso).toBe(true);
});

// ── 2. eccezione chiusa → nessuna disponibilità ─────────────────────────
test("2. eccezione chiusa → giorno chiuso e zero slot", () => {
  const orari = orariSettimanali();
  const eccezioni: AgendaEccezioni = { [LUNEDI]: { chiuso: true, motivo: "Ferie estive" } };
  const giorno = risolviGiorno(orari, eccezioni, LUNEDI);
  expect(giorno.chiuso).toBe(true);

  const slot = generaSlotDisponibili({
    giorno: LUNEDI,
    daySchedule: giorno,
    durataMin: 30,
    prenotazioni: [],
    config: config(),
    now: ORA_TEST,
  });
  expect(slot).toEqual([]);
});

// ── 3. eccezione con orario speciale → solo quelle fasce ────────────────
test("3. eccezione con orario speciale genera slot solo sulle fasce speciali", () => {
  const orari = orariSettimanali();
  const eccezioni: AgendaEccezioni = {
    [LUNEDI]: { chiuso: false, apertura1: "10:00", chiusura1: "12:00", motivo: "Orario ridotto" },
  };
  const giorno = risolviGiorno(orari, eccezioni, LUNEDI);
  expect(giorno.chiuso).toBe(false);
  expect(giorno.apertura1).toBe("10:00");
  expect(giorno.chiusura1).toBe("12:00");
  expect(giorno.apertura2).toBe("");

  const slot = generaSlotDisponibili({
    giorno: LUNEDI,
    daySchedule: giorno,
    durataMin: 30,
    prenotazioni: [],
    config: config(),
    now: ORA_TEST,
  });
  const orariInizio = slot.map((s) => s.oraInizio);
  // durata 30 / passo 15 → 7 slot dentro 10:00–12:00
  expect(orariInizio).toEqual([
    "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30",
  ]);
  // nessuno slot fuori dalla fascia speciale (il 09:00 settimanale è ignorato)
  expect(orariInizio.some((o) => o < "10:00" || o >= "12:00")).toBe(false);
});

// ── 4. rimozione eccezione → torna al calendario settimanale ────────────
test("4. rimozione eccezione fa tornare al calendario settimanale", () => {
  const orari = orariSettimanali();
  const conEccezione = { [LUNEDI]: { chiuso: true } } satisfies AgendaEccezioni;
  expect(risolviGiorno(orari, conEccezione, LUNEDI).chiuso).toBe(true);

  // rimozione = chiave assente dalla mappa
  const senzaEccezione: AgendaEccezioni = {};
  const giorno = risolviGiorno(orari, senzaEccezione, LUNEDI);
  expect(giorno.chiuso).toBe(false);
  expect(giorno.apertura1).toBe("09:00");
});

// ── 5. disponibilità pubblica su giorno chiuso → nessuno slot ───────────
test("5. giorno chiuso (settimanale o eccezione) → nessuno slot", () => {
  const orari = orariSettimanali();
  const eccezioni: AgendaEccezioni = { [MARTEDI]: { chiuso: true } };
  const daySchedule = risolviGiorno(orari, eccezioni, MARTEDI);
  const slot = generaSlotDisponibili({
    giorno: MARTEDI,
    daySchedule,
    durataMin: 30,
    prenotazioni: [],
    config: config(),
    now: ORA_TEST,
  });
  expect(slot).toEqual([]);
});

// ── 6–8. RPC/creazione manuale su giorno chiuso → rifiutate ─────────────
// Implementate nella migration 20260916_agenda_eccezioni.sql (crea_prenotazione
// e sposta_prenotazione leggono negozi.data.agenda_eccezioni con la stessa
// risoluzione di `risolviGiorno`). Qui verifichiamo che la risoluzione
// condivisa produca un giorno chiuso (→ la RPC risponde STORE_CLOSED) e zero
// slot (→ nessun percorso — pubblico, merchant, spostamento — può passare).
test("6. crea_prenotazione su giorno chiuso è rifiutata (risoluzione condivisa)", () => {
  const orari = orariSettimanali();
  const eccezioni: AgendaEccezioni = { [LUNEDI]: { chiuso: true } };
  const giorno = risolviGiorno(orari, eccezioni, LUNEDI);
  expect(giorno.chiuso).toBe(true);
  const slot = generaSlotDisponibili({
    giorno: LUNEDI,
    daySchedule: giorno,
    durataMin: 30,
    prenotazioni: [],
    config: config(),
    now: ORA_TEST,
  });
  expect(slot).toEqual([]);
});

test("7. sposta_prenotazione su giorno chiuso è rifiutata (risoluzione condivisa)", () => {
  const orari = orariSettimanali();
  const eccezioni: AgendaEccezioni = { [MARTEDI]: { chiuso: true } };
  expect(risolviGiorno(orari, eccezioni, MARTEDI).chiuso).toBe(true);
});

test("8. creazione manuale merchant su giorno chiuso è rifiutata (stessa RPC)", () => {
  const orari = orariSettimanali();
  const eccezioni: AgendaEccezioni = { [LUNEDI]: { chiuso: true } };
  // La creazione manuale merchant passa dalla stessa crea_prenotazione del
  // pubblico: giorno chiuso → STORE_CLOSED (qui: risoluzione condivisa).
  expect(risolviGiorno(orari, eccezioni, LUNEDI).chiuso).toBe(true);
  expect(
    generaSlotDisponibili({
      giorno: LUNEDI,
      daySchedule: risolviGiorno(orari, eccezioni, LUNEDI),
      durataMin: 30,
      prenotazioni: [],
      config: config(),
      now: ORA_TEST,
    })
  ).toEqual([]);
});

// ── 9. Agenda visibile solo ai profili corretti ─────────────────────────
test("9. Agenda (attivitaHaAgenda) solo per i profili con prenotazioni", () => {
  // CON agenda
  for (const profilo of ["medico", "beauty", "professionista", "immobiliare", "ricettivo", "artigiano", "ristorante"]) {
    expect(attivitaHaAgenda(storeConProfilo(profilo))).toBe(true);
  }
  // SENZA agenda
  for (const profilo of ["ecommerce", "alimentari", "altro"]) {
    expect(attivitaHaAgenda(storeConProfilo(profilo))).toBe(false);
  }
  // Regressione esplicita: bar (template → alimentari) resta senza Agenda.
  // Panificio/gioielleria/negozio al dettaglio ricadono nei profili
  // alimentari/ecommerce (già coperti da agenda-classificazione.spec.ts).
  expect(getProfiloPerTemplate("bar")?.id).toBe("alimentari");
  expect(attivitaHaAgenda(storeConProfilo("alimentari"))).toBe(false);
});

// ── 10. calendario annuale: cambio anno ─────────────────────────────────
test("10. calendario: navigazione mesi e cambio anno corretti", () => {
  // dicembre 2026 → gennaio 2027
  expect(spostaMese(2026, 11, 1)).toEqual({ anno: 2027, mese: 0 });
  // gennaio 2026 → dicembre 2025
  expect(spostaMese(2026, 0, -1)).toEqual({ anno: 2025, mese: 11 });
  // stesso mese
  expect(spostaMese(2026, 5, 0)).toEqual({ anno: 2026, mese: 5 });

  // griglia: sempre 42 celle, 7 colonne, i giorni del mese con fuoriMese=false
  const dicembre = giorniDelMese(2026, 11);
  expect(dicembre).toHaveLength(42);
  const giorniDicembre = dicembre.filter((c) => !c.fuoriMese);
  expect(giorniDicembre).toHaveLength(31);
  expect(giorniDicembre[0].data).toBe("2026-12-01");
  expect(giorniDicembre[30].data).toBe("2026-12-31");
  // le celle adiacenti includono gennaio 2027 (cambio anno nella griglia)
  expect(dicembre.some((c) => c.fuoriMese && c.data.startsWith("2027-01-"))).toBe(true);

  // giorni nei mesi e anni bisestili
  expect(giorniNelMese(2026, 1)).toBe(28);
  expect(giorniNelMese(2024, 1)).toBe(29);
  expect(isBisestile(2024)).toBe(true);
  expect(isBisestile(2026)).toBe(false);
  expect(isBisestile(2000)).toBe(true);
  expect(isBisestile(1900)).toBe(false);
});

// ── 11. nessuna sovrapposizione / doppio slot ───────────────────────────
test("11. eccezione con fasce sovrapposte → normalizzata, mai doppioni di slot", () => {
  // 09:00–20:00 + 15:00–19:00 (contenuta) → una sola fascia 09:00–20:00
  const normalizzata = normalizzaEccezioni({
    [LUNEDI]: { chiuso: false, apertura1: "09:00", chiusura1: "20:00", apertura2: "15:00", chiusura2: "19:00" },
  });
  expect(normalizzata[LUNEDI]).toMatchObject({
    chiuso: false,
    apertura1: "09:00",
    chiusura1: "20:00",
    apertura2: "",
    chiusura2: "",
  });

  const slot = generaSlotDisponibili({
    giorno: LUNEDI,
    daySchedule: risolviGiorno(orariSettimanali(), normalizzata, LUNEDI),
    durataMin: 30,
    prenotazioni: [],
    config: config(),
    now: ORA_TEST,
  });
  // durata 30 / passo 15 su 09:00–20:00 → 43 inizio unici (mai 58)
  expect(slot).toHaveLength(43);
  const inizi = new Set(slot.map((s) => s.inizioMin));
  expect(inizi.size).toBe(43); // nessun duplicato di inizio
  expect(slot[0].oraInizio).toBe("09:00");
  expect(slot[42].oraInizio).toBe("19:30");
});

// ── 12. prenotazioni esistenti non vengono toccate dall'Agenda ──────────
test("12. modificare l'Agenda non altera le prenotazioni esistenti", () => {
  const orari = orariSettimanali();
  const prenotazioni = [prenotazione()]; // confermata 10:00–10:30 del lunedì
  const copia = JSON.parse(JSON.stringify(prenotazioni));

  // prima dell'eccezione: lo slot occupato è escluso
  let slot = generaSlotDisponibili({
    giorno: LUNEDI,
    daySchedule: risolviGiorno(orari, null, LUNEDI),
    durataMin: 30,
    prenotazioni,
    config: config(),
    now: ORA_TEST,
  });
  expect(slot.map((s) => s.oraInizio)).not.toContain("10:00");

  // aggiungo un'eccezione (orario ridotto) → gli slot cambiano ma la
  // prenotazione resta valida ed esclusa come prima
  const eccezioni = normalizzaEccezioni({
    [LUNEDI]: { chiuso: false, apertura1: "10:00", chiusura1: "12:00" },
  });
  slot = generaSlotDisponibili({
    giorno: LUNEDI,
    daySchedule: risolviGiorno(orari, eccezioni, LUNEDI),
    durataMin: 30,
    prenotazioni,
    config: config(),
    now: ORA_TEST,
  });
  // passo 15: esclusi solo gli slot in conflitto con 10:00–10:30
  expect(slot.map((s) => s.oraInizio)).toEqual([
    "10:30", "10:45", "11:00", "11:15", "11:30",
  ]);
  // array di prenotazioni assolutamente invariato
  expect(prenotazioni).toEqual(copia);
});

// ── extra: normalizzazione e idempotenza ────────────────────────────────
test("extra. normalizzaEccezioni è idempotente e valida le date", () => {
  const raw = {
    [LUNEDI]: { chiuso: true, motivo: "  Ferie  " },
    "data-non-valida": { chiuso: true },
    "2026-02-30": { chiuso: true }, // data impossibile
    [MARTEDI]: { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "14:00", chiusura2: "14:00" },
  };
  const una = normalizzaEccezioni(raw);
  expect(Object.keys(una).sort()).toEqual([LUNEDI, MARTEDI].sort());
  expect(una[LUNEDI]?.motivo).toBe("Ferie");
  // 14:00–14:00 (apertura >= chiusura) scartata
  expect(una[MARTEDI]).toMatchObject({ apertura1: "09:00", chiusura1: "13:00", apertura2: "", chiusura2: "" });
  // idempotenza
  expect(normalizzaEccezioni(una)).toEqual(una);
  expect(isDataValida(LUNEDI)).toBe(true);
  expect(isDataValida("2026-02-30")).toBe(false);
});
