/**
 * PAGAMENTI — COMMISSIONE PIATTAFORMA InCittà (V1, solo server).
 *
 * La commissione è la fonte di ricavo della piattaforma sul marketplace:
 *   - percentuale configurata SOLO server-side (piattaforma_config →
 *     chiave `commissione_percentuale`, default 10%) — MAI dal client;
 *   - calcolo deterministico in centesimi (Math.round) con clamp:
 *       0 ≤ commissione ≤ totale ordine;
 *   - snapshot salvato sull'ordine alla creazione (commissione_percentuale +
 *     commissione_importo, RPC crea_ordine/crea_ordine_carrello);
 *   - per Stripe Connect l'application_fee_amount deriva ESCLUSIVAMENTE
 *     dallo snapshot (ordini.commissione_importo), mai ricalcolata dal
 *     browser.
 *
 * Il valore di default 10 qui è il FALLBACK applicativo: la fonte autorevole
 * è la riga in piattaforma_config (read in getCommissionePercentuale), che
 * può essere aggiornata senza toccare il codice del checkout.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/** Percentuale di commissione di default (V1) se la config è assente. */
export const COMMISSIONE_PERCENTUALE_DEFAULT = 10;

/** Chiave in piattaforma_config che contiene la percentuale (0–100). */
export const CHIAVE_COMMISSIONE_PERCENTUALE = "commissione_percentuale";

/** Limite superiore della percentuale configurabile (sanità). */
const MASSIMO_PERCENTUALE = 100;

/**
 * Calcola la commissione su un totale (in euro, precisione 2 decimali).
 * Deterministico: arrotondamento al centesimo più vicino sul valore in
 * centesimi (Math.round), poi clamp a [0, totale].
 *
 * Esempi (percentuale 10%):
 *   totale 100.00 → 10.00
 *   totale 99.99  → 10.00 (round(999.9) = 1000 centesimi)
 *   totale 12.34  → 1.23  (round(123.4) = 123 centesimi)
 *   totale 0.00   → 0.00
 *   percentuale > 100 → commissione = totale (clamp, mai superiore)
 */
export function calcolaCommissione(
  totale: number,
  percentuale: number
): number {
  if (!Number.isFinite(totale) || totale <= 0) return 0;
  const pct = Number.isFinite(percentuale) ? Math.min(Math.max(percentuale, 0), MASSIMO_PERCENTUALE) : 0;
  if (pct <= 0) return 0;
  // In centesimi: totale(€) * pct / 100 * 100 = totale * pct (deterministico).
  const centesimi = Math.round(totale * pct);
  const importo = centesimi / 100;
  return Math.min(importo, Math.round(totale * 100) / 100);
}

/**
 * Percentuale di commissione configurata (server-side): legge la riga
 * `commissione_percentuale` in piattaforma_config; in assenza/errore usa il
 * default 10%. MAI dal client. Invariante: 0 ≤ risultato ≤ 100.
 */
export async function getCommissionePercentuale(): Promise<number> {
  try {
    const db = createAdminSupabaseClient();
    const { data } = await db
      .from("piattaforma_config")
      .select("valore_numeric")
      .eq("chiave", CHIAVE_COMMISSIONE_PERCENTUALE)
      .maybeSingle();
    const raw = data?.valore_numeric;
    const n = typeof raw === "number" ? raw : raw !== null && raw !== undefined ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return COMMISSIONE_PERCENTUALE_DEFAULT;
    return Math.min(Math.max(n, 0), MASSIMO_PERCENTUALE);
  } catch {
    return COMMISSIONE_PERCENTUALE_DEFAULT;
  }
}
