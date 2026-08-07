import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AttivitaRow } from "./attivita-types";

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

/**
 * Elenco completo dei negozi della piattaforma per il centro di controllo
 * Amministratore. ESATTAMENTE 3 query, zero N+1:
 *   Q1 negozi non nel Cestino (attivi e disattivati), TUTTI — nessun filtro
 *     su is_demo: la lista amministrativa deve mostrare ogni negozio del
 *     database, a prescindere dal valore di is_demo.
 *   Q2 conteggio prodotti attivi per negozio (una sola query)
 *   Q3 email dei proprietari da auth.users (una sola query)
 * In caso di errore (es. schema non pronto) ritorna [].
 */
export async function getAttivitaAdmin(): Promise<AttivitaRow[]> {
  const db = getDb();
  if (!db) return [];

  // Q1 — negozi (inclusi i disattivati, escluso SOLO il Cestino).
  const { data: negozi, error: erroreNegozi } = await db
    .from("negozi")
    .select(
      "id, nome, slug, categoria, citta, is_demo, logo_url, owner_user_id, attivo, in_evidenza, created_at"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (erroreNegozi) return [];
  if (!negozi || negozi.length === 0) return [];

  // Q2 — conteggio prodotti attivi per i negozi trovati.
  const conteggioProdotti = new Map<string, number>();
  const { data: prodotti } = await db
    .from("prodotti")
    .select("negozio_id")
    .eq("attivo", true)
    .in(
      "negozio_id",
      negozi.map((n) => n.id)
    );
  for (const p of prodotti ?? []) {
    const id = p.negozio_id as string;
    conteggioProdotti.set(id, (conteggioProdotti.get(id) ?? 0) + 1);
  }

  // Q3 — email dei proprietari (auth.users). Se la lettura non è
  // disponibile, il proprietario resta null (placeholder in tabella).
  const ownerIds = Array.from(
    new Set(
      negozi
        .map((n) => n.owner_user_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const emailProprietari = new Map<string, string>();
  if (ownerIds.length > 0) {
    try {
      const { data: utenti } = await db
        .from("auth.users")
        .select("id, email")
        .in("id", ownerIds);
      for (const u of utenti ?? []) {
        emailProprietari.set(u.id as string, (u.email as string) ?? "");
      }
    } catch {
      // Schema auth non accessibile: si lascia il proprietario null.
    }
  }

  return negozi.map((n) => ({
    id: n.id,
    nome: n.nome,
    slug: n.slug ?? null,
    categoria: n.categoria ?? null,
    citta: n.citta ?? null,
    is_demo: Boolean(n.is_demo),
    logo_url: n.logo_url ?? null,
    proprietarioId: n.owner_user_id ?? null,
    proprietario:
      (n.owner_user_id && emailProprietari.get(n.owner_user_id)) || null,
    prodotti: conteggioProdotti.get(n.id) ?? 0,
    attivo: n.attivo,
    in_evidenza: n.in_evidenza,
    created_at: n.created_at,
  }));
}
