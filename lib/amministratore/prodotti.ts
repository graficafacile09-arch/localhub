import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Riga del catalogo prodotti per l'Area Amministratore: prodotto + nome del
 * negozio a cui appartiene (i negozi cancellati sono esclusi).
 */
export type ProdottoAdminRow = {
  id: string;
  negozioId: string;
  negozioNome: string;
  negozioDemo: boolean;
  nome: string;
  categoria: string | null;
  prezzo: number | null;
  quantitaDisponibile: number | null;
  attivo: boolean;
  originePubblicazione: string | null;
  statoCondizione: string | null;
  immaginePrincipale: string | null;
  created_at: string | null;
};

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

/**
 * Elenco di TUTTI i prodotti della piattaforma (compresi quelli dei negozi
 * demo, chiaramente marcati) per la supervisione del catalogo.
 * Due query, zero N+1: negozi + prodotti, associati in memoria.
 */
export async function getProdottiAmministrazione(): Promise<ProdottoAdminRow[]> {
  const db = getDb();
  if (!db) return [];

  // Negozi attivi (fuori dal Cestino) con nome e flag demo.
  const { data: negozi, error: erroreNegozi } = await db
    .from("negozi")
    .select("id, nome, is_demo")
    .is("deleted_at", null);

  if (erroreNegozi || !negozi || negozi.length === 0) return [];

  const mappaNegozio = new Map<string, { nome: string; demo: boolean }>();
  for (const n of negozi) {
    mappaNegozio.set(String(n.id), {
      nome: (n.nome as string) || "Negozio senza nome",
      demo: Boolean(n.is_demo),
    });
  }

  const ids = negozi.map((n) => n.id);
  const { data: prodotti } = await db
    .from("prodotti")
    .select(
      "id, negozio_id, nome, categoria, prezzo, quantita_disponibile, attivo, origine_pubblicazione, stato_condizione, immagine_principale, created_at"
    )
    .in("negozio_id", ids)
    .order("created_at", { ascending: false });

  return (prodotti ?? []).map((p) => {
    const negozio = mappaNegozio.get(String(p.negozio_id));
    return {
      id: String(p.id),
      negozioId: String(p.negozio_id),
      negozioNome: negozio?.nome ?? "Negozio sconosciuto",
      negozioDemo: negozio?.demo ?? false,
      nome: (p.nome as string) ?? "Prodotto senza nome",
      categoria: (p.categoria as string | null) ?? null,
      prezzo:
        typeof p.prezzo === "number"
          ? p.prezzo
          : typeof p.prezzo === "string"
            ? Number(p.prezzo)
            : null,
      quantitaDisponibile: (p.quantita_disponibile as number | null) ?? null,
      attivo: (p.attivo as boolean) ?? true,
      originePubblicazione: (p.origine_pubblicazione as string | null) ?? null,
      statoCondizione: (p.stato_condizione as string | null) ?? null,
      immaginePrincipale: (p.immagine_principale as string | null) ?? null,
      created_at: (p.created_at as string | null) ?? null,
    };
  });
}

/**
 * Recupera il negozio_id di un singolo prodotto (per il collegamento alla
 * modifica amministrativa, che riusa il form del venditore).
 */
export async function getNegozioIdProdotto(productId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const { data, error } = await db
    .from("prodotti")
    .select("negozio_id")
    .eq("id", productId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { negozio_id: string | null }).negozio_id ?? null;
}