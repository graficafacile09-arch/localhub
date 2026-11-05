/**
 * Pino — Shadow Adapter Tier 0: integrazione runtime (Fase 2).
 *
 * L'osservazione non tocca la risposta servita: `creaOsservazioneTier0`
 * associa un lavoro alla risposta e restituisce `void`; la risposta resta lo
 * stesso oggetto, con gli stessi campi. Il lavoro viene eseguito DOPO la
 * risposta HTTP tramite `after()` di Next.js (route handler).
 *
 * Confini:
 * - kill switch doppio: `PINO_SHADOW_MODE === "on"` E `SHADOW_TIER0_ABILITATO`;
 * - con la Shadow spenta non viene registrato nulla e il planner non viene
 *   mai chiamato;
 * - B2: planner, dipendenze e serializzatore sono racchiusi in un `try/catch`
 *   reale; nessuna eccezione esce dal callback e nessun retry viene introdotto;
 * - i log contengono solo il report sanificato (nessun testo conversazionale).
 *
 * @module lib/assistente/shadow/integrazione
 */
import {
  eseguiTier0Shadow,
  serializzaReportTier0,
  shadowTier0Attivo,
  type DipendenzeTier0,
  type InputTier0,
} from "./tier0.ts";

/** Lavoro post-risposta: valuta e serializza la Shadow. */
export type OsservazioneShadowTier0 = () => void;

/** Associazione risposta servita → osservazione (nessuna proprietà aggiunta). */
const osservazioniTier0 = new WeakMap<object, OsservazioneShadowTier0>();

function ambienteShadow(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

/**
 * Registra l'osservazione per una risposta già composta.
 *
 * Con la Shadow disattivata esce prima di costruire il lavoro: nessuna
 * valutazione, nessuna chiamata al planner, nessun log. La risposta non viene
 * letta né modificata oltre a farne da chiave nel `WeakMap`.
 */
export function creaOsservazioneTier0(
  risposta: object,
  input: InputTier0,
  dipendenze: DipendenzeTier0,
  env: Record<string, string | undefined> = ambienteShadow()
): void {
  // Kill switch doppio: qui il primo controllo, `eseguiTier0Shadow` ripete il
  // secondo al momento dell'esecuzione.
  if (!shadowTier0Attivo(env)) return;

  osservazioniTier0.set(risposta, () => {
    try {
      const report = eseguiTier0Shadow(input, dipendenze, env);
      if (report) {
        // Solo report sanificato: nessun messaggio, query o testo utente.
        console.info("[pino-shadow-tier0]", serializzaReportTier0(report));
      }
    } catch {
      // B2 — l'errore resta confinato all'osservazione: la risposta è già
      // stata servita e non viene ritentata né alterata.
    }
  });
}

/**
 * Restituisce e consuma il lavoro associato alla risposta.
 * `null` quando la Shadow era spenta o l'osservazione è già stata presa.
 */
export function prendiOsservazioneTier0(risposta: object): OsservazioneShadowTier0 | null {
  const osservazione = osservazioniTier0.get(risposta);
  if (!osservazione) return null;
  osservazioniTier0.delete(risposta);
  return osservazione;
}
