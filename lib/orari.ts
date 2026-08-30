import type { DaySchedule, Orari } from "@/types/negozio";
import { DAYS, CLOSED_DAY, DEFAULT_HOURS, EMPTY_DAY } from "@/types/negozio";
import type { ProfiloAttivitaId } from "@/lib/profili-attivita";

/**
 * ORARI — fonte unica della logica preset/default degli orari di apertura.
 *
 * Prima del refactor l'editor orari (OpeningHoursEditor) offriva presets
 * rapidi applicabili con un click e precompilava la griglia con
 * `store.orari ?? DEFAULT_HOURS`. Quel comportamento è andato perso quando
 * gli orari sono stati spostati nello step Contatti. Questo file lo
 * ripristina in un unico posto, riutilizzato sia dall'editor (StepContatti)
 * sia dal modulo Impostazioni (OrariModule), così non esistono due
 * implementazioni diverse.
 */

export type OrariPresetId =
  | "negozio-classico"
  | "apertura-continuata"
  | "bar"
  | "ristorante"
  | "chiuso";

function buildForDays(days: readonly string[], s: DaySchedule): Orari {
  const r: Orari = {};
  for (const d of DAYS) {
    r[d] = days.includes(d) ? { ...s } : { ...CLOSED_DAY };
  }
  return r;
}

/**
 * Presets di orari per tipo di attività (recuperati dal vecchio
 * OpeningHoursEditor). Ogni preset è un oggetto `Orari` completo per tutti
 * i giorni; applicarlo sostituisce interamente la griglia (mai un merge).
 */
export const ORARI_PRESETS: Record<OrariPresetId, Orari> = {
  "negozio-classico": buildForDays(
    ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì"],
    { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "16:00", chiusura2: "20:00" }
  ),
  "apertura-continuata": buildForDays(
    ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"],
    { chiuso: false, apertura1: "09:00", chiusura1: "20:00", apertura2: "", chiusura2: "" }
  ),
  bar: buildForDays(
    ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"],
    { chiuso: false, apertura1: "07:30", chiusura1: "13:00", apertura2: "15:30", chiusura2: "20:00" }
  ),
  ristorante: buildForDays(
    ["martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
    { chiuso: false, apertura1: "10:00", chiusura1: "14:30", apertura2: "18:00", chiusura2: "23:00" }
  ),
  chiuso: buildForDays([], { ...CLOSED_DAY }),
};

/** Etichette leggibili dei presets, per l'ordine di presentazione nella UI. */
export const ORARI_PRESET_LABELS: { id: OrariPresetId; nome: string }[] = [
  { id: "negozio-classico", nome: "Negozio classico" },
  { id: "apertura-continuata", nome: "Apertura continuata" },
  { id: "bar", nome: "Bar" },
  { id: "ristorante", nome: "Ristorante" },
  { id: "chiuso", nome: "Chiuso" },
];

/** Restituisce il preset per id (undefined se sconosciuto). */
export function getOrariPreset(id: string | null | undefined): Orari | undefined {
  if (!id) return undefined;
  return ORARI_PRESETS[id as OrariPresetId];
}

/**
 * Preset d'orari automatico per tipo di attività (profilo), quando il
 * negozio non ha ancora orari propri. Ogni profilo ha un preset consigliato
 * che il commerciante può poi modificare liberamente.
 */
export const PRESET_ORARI_PER_PROFILO: Partial<Record<ProfiloAttivitaId, OrariPresetId>> = {
  ristorante: "ristorante",
  // Le attività da bar/pizzeria ricadono nei profili alimentari/ristorante
  // (vedi mapping template in profili-attivita), quindi nessuna chiave "bar".
  ecommerce: "negozio-classico",
  alimentari: "negozio-classico",
  // Profili di servizio/prestazione: partono col preset commerciale a doppia
  // fascia (09:00–13:00 + 16:00–20:00 su lun–ven, sab/dom chiusi) così la
  // settimana è GIÀ precompilata con mattina+pomeriggio; il titolare corregge
  // solo le eccezioni. (Scelta confermata: apertura spezzata commerciale.)
  beauty: "negozio-classico",
  medico: "negozio-classico",
  professionista: "negozio-classico",
  immobiliare: "negozio-classico",
  artigiano: "negozio-classico",
  ricettivo: "negozio-classico",
  altro: "negozio-classico",
};

/** Preset consigliato per un profilo (undefined se profilo non noto). */
export function getPresetPerProfilo(
  profiloId: string | null | undefined
): OrariPresetId | undefined {
  if (!profiloId) return undefined;
  return PRESET_ORARI_PER_PROFILO[profiloId as ProfiloAttivitaId];
}

/**
 * Orari di partenza, con questa priorità:
 *   1. preset ESPLICITO (scelto dall'utente cliccando un preset → sostituisce
 *      la griglia, come nel vecchio OpeningHoursEditor);
 *   2. orari GIÀ SALVATI del negozio → NON vanno MAI sovrascritti;
 *   3. preset automatico del profilo attività (solo se il negozio non ha
 *      ancora orari propri);
 *   4. DEFAULT_HOURS.
 */
export function orariIniziali(
  orari?: Orari | null,
  presetId?: string | null,
  profiloId?: string | null
): Orari {
  const esplicito = getOrariPreset(presetId);
  if (esplicito) return esplicito;
  if (orari && typeof orari === "object" && Object.keys(orari).length > 0) return orari;
  const profilo = getOrariPreset(getPresetPerProfilo(profiloId));
  if (profilo) return profilo;
  return DEFAULT_HOURS;
}

/** Versione con solo profilo attività (comodo in editor/wizard). */
export function orariPerProfilo(
  orari: Orari | null | undefined,
  profiloId: string | null | undefined
): Orari {
  return orariIniziali(orari, null, profiloId);
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * NORMALIZZAZIONE ORARI (helper puri e testabili)
 *
 * Fornisce `normalizzaOrari`/`normalizzaGiorno`: la SORGENTE UNICA della
 * coerenza delle fasce orarie, usata sia dal backend (route settings, PRIMA
 * del salvataggio) sia dagli editor UI (OrariModule / StepContatti / il
 * componente condiviso). Garantisce che due fasce non si sovrappongano mai,
 * che quelle incomplete vengano scartate e che il JSONB salvato sia sempre
 * in formato pulito (massimo 2 fasce: apertura1/chiusura1, apertura2/chiusura2).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Una fascia di apertura in minuti dal mezzanotte. */
type Fascia = { open: number; close: number };

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

/**
 * Estrae le fasce valide di un giorno: scarta le coppie incomplete o
 * impossibili (apertura >= chiusura), ordina, e fonde le fasce che si
 * sovrappongono o si toccano in un'unica fascia coerente.
 *
 * Regole applicate (cfr. requisiti gestione orari):
 *  - `09–13 + 15–19`         → due fasce separate (gap reale) → VALIDE.
 *  - `09–13 + 13–17`         → consecutive (si toccano) → fuse in 09–17.
 *  - `09–20 + 15–19`         → contenuta → 09–20.
 *  - `09–20 + 18–22`         → sovrapposte → fuse in 09–22.
 *  - `09–13 + 11–12`         → contenuta → 09–13.
 *  In nessun caso si producono duplicati o configurazioni ambigue.
 */
export function fasceNormalizzate(scheda: DaySchedule): Fascia[] {
  if (!scheda || scheda.chiuso) return [];

  const coppie: [string, string][] = [
    [scheda.apertura1, scheda.chiusura1],
    [scheda.apertura2, scheda.chiusura2],
  ];

  const raccolte: Fascia[] = [];
  for (const [a, c] of coppie) {
    const open = parseHHMM(a);
    const close = parseHHMM(c);
    if (open === null || close === null) continue; // fascia incompleta/illeggibile
    if (open >= close) continue; // intervallo impossibile
    raccolte.push({ open, close });
  }

  // ordina per inizio (a parità, per fine) → output deterministico
  raccolte.sort((x, y) => x.open - y.open || x.close - y.close);

  // fonde sovrapposti/consecutivi
  const fuse: Fascia[] = [];
  for (const f of raccolte) {
    const last = fuse[fuse.length - 1];
    if (last && f.open <= last.close) {
      if (f.close > last.close) last.close = f.close;
    } else {
      fuse.push({ ...f });
    }
  }
  return fuse;
}

/** True se un giorno aperto contiene fasce sovrapposte o contenute (da segnalare in UI). */
export function giornoHaSovrapposizioni(scheda: DaySchedule): boolean {
  if (!scheda || scheda.chiuso) return false;
  const raw: Fascia[] = [];
  for (const [a, c] of [
    [scheda.apertura1, scheda.chiusura1],
    [scheda.apertura2, scheda.chiusura2],
  ] as [string, string][]) {
    const open = parseHHMM(a);
    const close = parseHHMM(c);
    if (open === null || close === null || open >= close) continue;
    raw.push({ open, close });
  }
  if (raw.length < 2) return false;
  raw.sort((x, y) => x.open - y.open || x.close - y.close);
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].open <= raw[i - 1].close) return true;
  }
  return false;
}

/**
 * Normalizza una singola giornata:
 *  - chiusa → CLOSED_DAY (fasce vuote);
 *  - aperta senza fasce valide → aperta con fasce vuote (lo slot-generator la
 *    tratta come chiusa, senza cambiare lo stato `chiuso` dichiarato);
 *  - altrimenti riempie al massimo 2 fasce fuse/normalizzate;
 *  - mantiene il formato JSONB attuale (chiuso, apertura1..chiusura2).
 */
export function normalizzaGiorno(scheda: DaySchedule | null | undefined): DaySchedule {
  if (!scheda) return { ...CLOSED_DAY };
  const aperto = scheda.chiuso !== true;
  if (!aperto) {
    return { chiuso: true, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" };
  }

  const fasce = fasceNormalizzate(scheda);
  const out: DaySchedule = {
    chiuso: false,
    apertura1: "",
    chiusura1: "",
    apertura2: "",
    chiusura2: "",
  };
  if (fasce[0]) {
    out.apertura1 = minToHHMM(fasce[0].open);
    out.chiusura1 = minToHHMM(fasce[0].close);
  }
  if (fasce[1]) {
    out.apertura2 = minToHHMM(fasce[1].open);
    out.chiusura2 = minToHHMM(fasce[1].close);
  }
  return out;
}

/**
 * Normalizza un intero oggetto `Orari`, giorno per giorno, mantenendo solo le
 * chiavi presenti (non aggiunge giorni mancanti → non altera dati esistenti).
 */
export function normalizzaOrari(orari: Orari | null | undefined): Orari {
  const r: Orari = {};
  if (!orari || typeof orari !== "object") return r;
  for (const key of Object.keys(orari)) {
    const scheda = (orari as Record<string, DaySchedule>)[key];
    if (scheda && typeof scheda === "object") {
      r[key] = normalizzaGiorno(scheda);
    }
  }
  return r;
}

/**
 * Replica la configurazione del lunedì su tutta la settimana (incluso il
 * lunedì stesso). Logica estratta qui così è testabile e identica in tutti
 * i punti d'ingresso (requisito "Copia dal lunedì").
 */
export function copiaSettimanaDalLunedi(orari: Orari): Orari {
  const lunedi = orari["lunedì"] ? { ...orari["lunedì"] } : { ...EMPTY_DAY };
  const nuovi: Orari = {};
  for (const d of DAYS) nuovi[d] = { ...lunedi };
  return nuovi;
}

/**
 * Propone una seconda fascia che NON si sovrappone alla prima: parte esattamente
 * dove finisce `chiusura1` (fascia consecutiva, mai ambigua). Usata dal pulsante
 * "+ seconda fascia"/"+ pomeriggio" nell'editor condiviso (requisito livello A).
 */
export function suggerisciSecondaFascia(scheda: DaySchedule): {
  apertura2: string;
  chiusura2: string;
} {
  const close1 = parseHHMM(scheda?.chiusura1);
  // -X-X-X- primo fallback basso rischio 15–19
  if (close1 === null) return { apertura2: "15:00", chiusura2: "19:00" };

  const start = close1;
  const end = Math.min(start + 4 * 60, 23 * 60); // 4 ore, al più 23:00
  if (end <= start) return { apertura2: "15:00", chiusura2: "19:00" };

  return { apertura2: minToHHMM(start), chiusura2: minToHHMM(end) };
}

export { DEFAULT_HOURS, CLOSED_DAY, EMPTY_DAY };