/**
 * Pino — periodi temporali per gli eventi.
 *
 * "cosa c'è questo weekend?" non è una keyword: è un intervallo di date. Questo
 * modulo traduce le espressioni italiane/inglesi più comuni in un intervallo
 * civile (Europe/Rome) e verifica l'overlap con un evento reale. Nessuna stima:
 * un evento senza data non può essere confermato in un periodo.
 *
 * @module lib/assistente/eventi-periodo
 */

export type PeriodoEventiPino = {
  /** Primo giorno incluso, formato YYYY-MM-DD (Europe/Rome). */
  da: string;
  /** Ultimo giorno incluso, formato YYYY-MM-DD (Europe/Rome). */
  a: string;
  /** Etichetta naturale per la risposta. */
  etichetta: string;
};

const FORMATO_ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function normalizza(testo: string): string {
  return String(testo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Data civile Europe/Rome di un istante ISO, oppure null se non interpretabile. */
export function dataCivileRomaPino(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return FORMATO_ROMA.format(data);
}

/** Giorno civile corrente a Roma, formato YYYY-MM-DD. */
export function oggiRomaPino(now: Date = new Date()): string {
  return FORMATO_ROMA.format(now);
}

function aggiungiGiorni(ymd: string, giorni: number): string {
  const [anno, mese, giorno] = ymd.split("-").map(Number);
  const data = new Date(Date.UTC(anno, mese - 1, giorno + giorni));
  return data.toISOString().slice(0, 10);
}

/** 0 = domenica, 1 = lunedì, … 6 = sabato. */
function giornoSettimana(ymd: string): number {
  const [anno, mese, giorno] = ymd.split("-").map(Number);
  return new Date(Date.UTC(anno, mese - 1, giorno)).getUTCDay();
}

/**
 * Intervallo richiesto dalla frase, oppure null.
 *
 * Riconosce: oggi, stasera, domani, dopodomani, questo/prossimo weekend,
 * fine settimana, questa settimana. Non interpreta "sera" come filtro orario:
 * il catalogo eventi espone solo date, quindi il periodo resta giornaliero.
 */
export function rilevaPeriodoEventiPino(
  input: string,
  now: Date = new Date()
): PeriodoEventiPino | null {
  const q = normalizza(input);
  if (!q) return null;

  const oggi = oggiRomaPino(now);

  if (/\bdopodomani\b/.test(q)) {
    const da = aggiungiGiorni(oggi, 2);
    return { da, a: da, etichetta: "dopodomani" };
  }
  if (/\bdomani\b/.test(q)) {
    const da = aggiungiGiorni(oggi, 1);
    return { da, a: da, etichetta: "domani" };
  }
  if (/\boggi\b|\bstasera\b|\bstamattina\b|\boggi pomeriggio\b|\btoday\b|\btonight\b/.test(q)) {
    return { da: oggi, a: oggi, etichetta: "oggi" };
  }

  if (/\bweekend\b|\bfine settimana\b|\bfine-settimana\b|\bweek-?end\b/.test(q)) {
    const giorno = giornoSettimana(oggi);
    const sabato =
      giorno === 6 ? oggi : giorno === 0 ? aggiungiGiorni(oggi, -1) : aggiungiGiorni(oggi, 6 - giorno);
    const domenica = aggiungiGiorni(sabato, 1);
    const prossimo = /\bprossimo\b|\bnext\b/.test(q);
    const da = prossimo && giorno !== 0 ? aggiungiGiorni(sabato, 7) : sabato;
    const a = prossimo && giorno !== 0 ? aggiungiGiorni(domenica, 7) : domenica;
    return { da, a, etichetta: prossimo ? "il prossimo weekend" : "questo weekend" };
  }

  if (/\bquesta settimana\b|\bthis week\b/.test(q)) {
    const giorno = giornoSettimana(oggi);
    const domenica = giorno === 0 ? oggi : aggiungiGiorni(oggi, 7 - giorno);
    return { da: oggi, a: domenica, etichetta: "questa settimana" };
  }

  return null;
}

/**
 * True se l'evento cade (anche parzialmente) nel periodo.
 *
 * Un evento con sola data di inizio vale per quel giorno; con data di fine
 * vale per tutto l'intervallo. Un evento senza data non è verificabile e resta
 * fuori da un filtro temporale esplicito.
 */
export function eventoNelPeriodoPino(
  evento: { data_inizio?: string | null; data_fine?: string | null },
  periodo: PeriodoEventiPino | null | undefined
): boolean {
  if (!periodo) return true;
  const inizio = dataCivileRomaPino(evento?.data_inizio);
  if (!inizio) return false;
  const fine = dataCivileRomaPino(evento?.data_fine) ?? inizio;
  return inizio <= periodo.a && fine >= periodo.da;
}
