import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";
import type { SezioneConoscenza } from "./tipi";
import { urlCanonico } from "./fonti";

export type RisultatoConoscenza = {
  chiave: string;
  sezione: SezioneConoscenza;
  titolo: string;
  estratto: string;
  url: string;
};

const ESTRATTO_MAX = 320;

/**
 * Ricerca FTS italiana sull'archivio `pino_conoscenza`.
 * Restituisce solo voci attive: le rimosse non vengono mai mostrate.
 */
export async function cercaConoscenza(
  query: string,
  limit = 6
): Promise<RisultatoConoscenza[]> {
  const q = query.replace(/\s+/g, " ").trim();
  if (!q) return [];

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("pino_conoscenza")
    .select("chiave, sezione, fonte_url, titolo, contenuto")
    .eq("stato", "attivo")
    .textSearch("fts", q, { type: "websearch", config: "italian" })
    .limit(Math.min(Math.max(limit, 1), 8));

  if (error || !data) return [];

  return data.map((r) => ({
    chiave: r.chiave as string,
    sezione: r.sezione as SezioneConoscenza,
    titolo: r.titolo as string,
    estratto:
      (r.contenuto as string).length > ESTRATTO_MAX
        ? `${(r.contenuto as string).slice(0, ESTRATTO_MAX).trimEnd()}…`
        : (r.contenuto as string),
    url: urlCanonico(getSiteUrl(), r.fonte_url as string),
  }));
}
