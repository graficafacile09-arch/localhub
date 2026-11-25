import { createAdminSupabaseClient } from "./supabase/admin";
import type { ProdottoTerritorio } from "./territori";
import { isDemoPubblico } from "@/lib/demo-pubblico";

/**
 * Lettura dei prodotti del catalogo da mostrare nelle pagine territoriali.
 *
 * I prodotti sono SEMPRE quelli della tabella `prodotti` (nessun secondo
 * catalogo): qui si recuperano per slug e si arricchiscono con il nome del
 * negozio, esattamente come fa la vetrina dei prodotti tipici.
 *
 * Se un prodotto non esiste più, non è attivo o il negozio non è pubblico,
 * viene semplicemente escluso dalla pagina.
 */
export type ProdottoCardTerritorio = Record<string, unknown> & {
  negozio_nome: string;
  territorio: ProdottoTerritorio;
};

export async function getProdottiTerritorio(
  prodotti: ProdottoTerritorio[]
): Promise<ProdottoCardTerritorio[]> {
  if (prodotti.length === 0) return [];

  let db;
  try {
    db = createAdminSupabaseClient();
  } catch {
    return [];
  }

  const slugs = prodotti.map((p) => p.slug);
  const { data, error } = await db
    .from("prodotti")
    .select("*")
    .in("slug", slugs)
    .eq("attivo", true);
  if (error || !data?.length) return [];

  const negozioIds = Array.from(
    new Set((data as Record<string, unknown>[]).map((p) => p.negozio_id).filter(Boolean))
  ) as string[];

  const { data: negozi } = negozioIds.length
    ? await db
        .from("negozi")
        .select("id, nome")
        .in("id", negozioIds)
        .is("deleted_at", null)
        .eq("attivo", true)
    : { data: [] };
  const nomiNegozi = new Map(
    ((negozi ?? []) as { id: string; nome: string }[]).map((n) => [n.id, n.nome])
  );

  const perSlug = new Map(prodotti.map((p) => [p.slug, p]));
  return (data as Record<string, unknown>[])
    .filter((p) => nomiNegozi.has(p.negozio_id as string))
    .filter((p) => !isDemoPubblico(p))
    .map((p) => ({
      ...p,
      negozio_nome: nomiNegozi.get(p.negozio_id as string) ?? "",
      territorio: perSlug.get(p.slug as string)!,
    }))
    .filter((p) => Boolean(p.territorio));
}
