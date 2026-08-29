import type { DaySchedule, Orari } from "@/types/negozio";
import { DAYS, CLOSED_DAY, DEFAULT_HOURS } from "@/types/negozio";
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
  beauty: "apertura-continuata",
  medico: "apertura-continuata",
  professionista: "apertura-continuata",
  immobiliare: "negozio-classico",
  artigiano: "negozio-classico",
  ricettivo: "apertura-continuata",
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

export { DEFAULT_HOURS, CLOSED_DAY };