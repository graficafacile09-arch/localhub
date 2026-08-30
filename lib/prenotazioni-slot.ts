/**
 * FASE 6c — GENERAZIONE SLOT PRENOTAZIONI (algoritmo puro).
 *
 * Funzione pura e deterministica: riceve TUTTO come input (durata, orari,
 * buffer, passo, prenotazioni esistenti, config, riferimento temporale) e
 * restituisce gli slot disponibili. NON interroga il DB, NON chiama API.
 *
 * Timezone: il tempo civile del negozio è Europe/Rome. `now` è un istante
 * assoluto (Date). Per confrontare `now` con giorno/ora civili si usa
 * `Intl.DateTimeFormat(..., { timeZone: "Europe/Rome" })` — mai offset
 * manuali (+1/+2) che sarebbero sbagliati con il DST.
 *
 * Semantica del buffer (regola 7, Fase 6c):
 *   - ogni slot candidato occupa concettualmente un intervallo esteso
 *     [candStart - buffer, candEnd + buffer];
 *   - è incompatibile con una prenotazione confermata esistente se
 *     l'intervallo ESTESO si sovrappone all'intervallo esistente,
 *     con intervalli SEMIAPERTI ([inizio, fine)).
 *   - con buffer = 0, due slot che si toccano (candEnd === existingStart)
 *     NON sono in conflitto (nessun falso conflitto).
 *
 * PASSO (regola 6): il passo è SEMPRE `passo_slot_min` (config), non la
 * durata. Se non valido (<=0) si applica un fallback documentato:
 * `FALLBACK_PASSO_SLOT_MIN`, mai la durata in modo silenzioso.
 */
import type { ConfigPrenotazioni, DaySchedule, Prenotazione } from "@/types/negozio";

/** Fallback per `passo_slot_min` quando il valore config non è valido (<=0). */
export const FALLBACK_PASSO_SLOT_MIN = 15;

/** Valore minimo ammesso per `passo_slot_min` (serve per evitare loop infiniti). */
export const MIN_PASSO_SLOT_MIN = 5;

/** Valori limite di durata coerenti con il CHECK DB della Fase 6b. */
export const DURATA_MIN_MIN = 5;
export const DURATA_MIN_MAX = 480;

/** Timezone operativa del progetto. */
export const TIMEZONE = "Europe/Rome";

/** Un singolo slot disponibile. */
export type SlotDisponibile = {
  oraInizio: string; // "09:00"
  oraFine: string; // "09:30"
  inizioMin: number; // minuti dal mezzanotte civile
  fineMin: number; // minuti dal mezzanotte civile
};

export type GeneraSlotsInput = {
  giorno: string; // YYYY-MM-DD (civile Europe/Rome)
  daySchedule: DaySchedule;
  durataMin: number;
  prenotazioni: Prenotazione[]; // le prenotazioni del negozio
  config: ConfigPrenotazioni;
  /** Istante assoluto di riferimento (di solito new Date()). */
  now: Date;
};

// ── utilità tempo (tutte invarianti rispetto al DST) ──────────────────────
function parseHHMM(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Data civile YYYY-MM-DD in Europe/Rome per un istante assoluto. */
function dataCivile(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Minuti civili accumulati dall'inizio della giornata (0..1439) in Europe/Rome. */
function minutiDelGiornoCivile(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const h = Number(get("hour"));
  const m = Number(get("minute"));
  return h * 60 + m;
}

/** Numero di giorni dall'époque per una data civile YYYY-MM-DD. */
function civilDays(giorno: string): number {
  const [y, mo, d] = giorno.split("-").map(Number);
  return Math.floor(Date.UTC(y, (mo ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** Minuti civili ASSOLUTI (giorni*1440+minuti) Europe/Rome per un istante. */
function civilMinutiAssoluti(now: Date): number {
  return civilDays(dataCivile(now)) * 1440 + minutiDelGiornoCivile(now);
}

/**
 * Genera gli slot disponibili per un singolo giorno.
 *
 * La funzione è pura e deterministica: dato lo stesso input restituisce
 * sempre lo stesso output. Nessun accesso esterno.
 */
export function generaSlotDisponibili({
  giorno,
  daySchedule,
  durataMin,
  prenotazioni,
  config,
  now,
}: GeneraSlotsInput): SlotDisponibile[] {
  // ── 1/2. Giorno chiuso o orari mancanti/non validi → nessuno slot ───────
  if (daySchedule?.chiuso) return [];
  if (!daySchedule) return [];

  // ── 16. Durata non valida → nessuno slot corrotto ────────────────────────
  const durata = Math.round(durataMin);
  if (!Number.isFinite(durata) || durata < DURATA_MIN_MIN || durata > DURATA_MIN_MAX) {
    return [];
  }

  // ── 16. Passo non valido → fallback documentato ──────────────────────────
  let passo = Math.round(config.passo_slot_min);
  if (!Number.isFinite(passo) || passo <= 0) {
    passo = FALLBACK_PASSO_SLOT_MIN;
  }
  if (passo < MIN_PASSO_SLOT_MIN) passo = MIN_PASSO_SLOT_MIN;

  // ── Finestre di apertura valide (apertura >= chiusura → scarta) ─────────
  const finestre: { open: number; close: number }[] = [];
  const coppie: [string, string][] = [
    [daySchedule.apertura1, daySchedule.chiusura1],
    [daySchedule.apertura2, daySchedule.chiusura2],
  ];
  for (const [a, c] of coppie) {
    const open = parseHHMM(a);
    const close = parseHHMM(c);
    if (open === null || close === null) continue; // orari non parsabili → finestra ignorata
    if (open >= close) continue; // apertura >= chiusura → non valida
    finestre.push({ open, close });
  }
  if (finestre.length === 0) return [];

  // ── 8. Solo prenotazioni confermate contano ──────────────────────────────
  const confermate = prenotazioni.filter(
    (p) =>
      p &&
      p.stato === "confermata" &&
      typeof p.ora_inizio === "string" &&
      typeof p.ora_fine === "string" &&
      (p.giorno == null || String(p.giorno) === giorno)
  );

  // ── 14. limite_giornaliero: confermate del giorno >= limite → nessuno slot ─
  if (
    config.limite_giornaliero != null &&
    Number.isFinite(config.limite_giornaliero) &&
    config.limite_giornaliero >= 0 &&
    confermate.length >= config.limite_giornaliero
  ) {
    return [];
  }

  // ── 10/11/12. Finestra temporale (Europe/Rome) ───────────────────────────
  const oraNow = civilMinutiAssoluti(now);
  // minimo: non prima di now + anticipo_min_ore (copre anche il passato)
  const minInizio = oraNow + Math.max(0, config.anticipo_min_ore) * 60;
  // massimo (giorni): non oltre now + anticipo_max_giorni
  let maxInizio = Infinity;
  if (Number.isFinite(config.anticipo_max_giorni) && config.anticipo_max_giorni >= 0) {
    maxInizio = oraNow + config.anticipo_max_giorni * 24 * 60;
  }
  const giornoMin = civilDays(giorno) * 1440;

  // ── preparazione prenotazioni esistenti (intervalli semiaperti in minuti) ─
  const esistenti: { start: number; end: number }[] = [];
  for (const p of confermate) {
    const start = parseHHMM(p.ora_inizio.slice(0, 5));
    const end = parseHHMM(p.ora_fine.slice(0, 5));
    if (start === null || end === null || end <= start) continue;
    esistenti.push({ start, end });
  }

  const buffer = Math.max(0, Math.round(config.buffer_min));

  // ── Generazione candidati + filtro overlap/buffer/finestra ───────────────
  const risultato: SlotDisponibile[] = [];
  for (const finestra of finestre) {
    let inizio = finestra.open;
    while (inizio + durata <= finestra.close) {
      const fine = inizio + durata;
      const inizioAssoluto = giornoMin + inizio;
      const fineAssoluto = giornoMin + fine;

      // finestra minima: non prima di now+anticipo_min (mai nel passato)
      // finestra massima: non oltre ora+anticipo_max; giorno civile nella finestra
      if (inizioAssoluto >= minInizio && inizioAssoluto <= maxInizio) {
        // 9+7. overlap con buffer (intervalli semiaperti, buffer esteso)
        const candStart = inizio - buffer;
        const candEnd = fine + buffer;
        const inConflitto = esistenti.some(
          (e) => candStart < e.end && candEnd > e.start
        );
        if (!inConflitto) {
          risultato.push({ oraInizio: minToHHMM(inizio), oraFine: minToHHMM(fine), inizioMin: inizio, fineMin: fine });
        }
      }

      inizio += passo;
    }
  }

  // deterministico: ordina per inizio
  risultato.sort((a, b) => a.inizioMin - b.inizioMin);

  // ── 17. Deduplica SEMPRE per inizio ───────────────────────────────────────
  // Se nel DB esistono ancora vecchi orari sovrapposti (due fasce che coprono
  // la stessa fascia), ogni finestra genererebbe gli stessi inizio → duplicati.
  // Garanzia: MASSIMO UNO slot per ogni ora di inizio, a prescindere da quante
  // fasce lo abbiano prodotto. Non cambia la durata, non cambia la timezone,
  // non altera le prenotazioni esistenti.
  const visti = new Set<number>();
  const unici: SlotDisponibile[] = [];
  for (const s of risultato) {
    if (visti.has(s.inizioMin)) continue;
    visti.add(s.inizioMin);
    unici.push(s);
  }
  return unici;
}