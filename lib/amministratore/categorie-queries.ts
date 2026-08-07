import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Categoria } from "@/types/negozio";
import { getConteggiNegoziPerCategoria } from "@/lib/negozi";

/**
 * Categoria amministrativa: riga della tabella categorie + conteggio negozi
 * associati (stesso matching nome + sinonimi del resto della piattaforma).
 */
export type CategoriaAdmin = Categoria & {
  /** Numero di negozi ATTIVI associati (matching sinonimi esistente). */
  negozi: number;
};

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

/**
 * Tutte le categorie configurate (ATTIVE e disattivate) per il pannello
 * Amministratore. Il conteggio negozi riusa getConteggiNegoziPerCategoria,
 * lo STESSO criterio di matching (uguaglianza case-insensitive su nome +
 * sinonimi) usato da home, /categorie e ricerca: nessuna logica parallela.
 */
export async function getCategorieAdmin(): Promise<CategoriaAdmin[]> {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("categorie")
    .select("*")
    .order("ordine", { ascending: true });

  if (error) return [];

  const categorie = (data as Categoria[]) ?? [];
  if (categorie.length === 0) return [];

  const conteggi = await getConteggiNegoziPerCategoria(categorie);

  return categorie.map((categoria) => ({
    ...categoria,
    negozi: conteggi.get(categoria.id) ?? 0,
  }));
}
