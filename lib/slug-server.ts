import { createAdminSupabaseClient } from "./supabase/admin";
import { toSlug } from "./slug";

/**
 * Genera uno slug UNIVOCO su una tabella (negozi o prodotti) a partire da
 * una base: se la base è già usata, aggiunge -2, -3, ... finché non trova
 * uno libero. Gestisce le collisioni in modo deterministico e sicuro,
 * complementare all'indice UNIQUE parziale del database.
 *
 * @param tabella "negozi" | "prodotti"
 * @param base testo da cui derivare lo slug (verrà normalizzato con toSlug)
 */
export async function generaSlugUnivoco(
  tabella: "negozi" | "prodotti",
  base: string
): Promise<string> {
  const slugBase = toSlug(base) || (tabella === "negozi" ? "negozio" : "prodotto");
  const supabase = createAdminSupabaseClient();

  let candidato = slugBase;
  let n = 1;

  for (;;) {
    const { count, error } = await supabase
      .from(tabella)
      .select("id", { head: true, count: "exact" })
      .eq("slug", candidato);

    if (!error && (!count || count === 0)) {
      return candidato;
    }

    n += 1;
    candidato = `${slugBase}-${n}`;
  }
}
