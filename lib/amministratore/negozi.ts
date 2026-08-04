import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/** Negozio nel Cestino (soft-deleted) visto dall'amministratore. */
export type NegozioCestino = {
  id: string;
  nome: string;
  categoria: string | null;
  descrizione: string | null;
  attivo: boolean | null;
  logo_url: string | null;
  deleted_at: string | null;
};

/** Sintesi di un negozio attivo (per picker, es. sorgente template). */
export type NegozioSintesi = {
  id: string;
  nome: string;
  categoria: string | null;
};

/**
 * Cestino GLOBALE della piattaforma (funzione di piattaforma → solo admin).
 * Elenca TUTTI i negozi soft-deleted, di qualunque proprietario.
 */
export async function getNegoziCestino(): Promise<NegozioCestino[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("negozi")
    .select("id, nome, categoria, descrizione, attivo, logo_url, deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Impossibile recuperare il cestino.");
  }

  return (data ?? []) as NegozioCestino[];
}

/** Elenco dei negozi ATTIVI (per il picker della creazione template). */
export async function getNegoziAttiviSintesi(): Promise<NegozioSintesi[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("negozi")
    .select("id, nome, categoria")
    .is("deleted_at", null)
    .order("nome", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Impossibile recuperare i negozi.");
  }

  return (data ?? []) as NegozioSintesi[];
}

/**
 * Sposta un negozio nel Cestino (soft delete) — azione di piattaforma.
 * A differenza del soft-delete del commerciante (solo sui propri negozi),
 * qui l'amministratore può cestinare QUALSIASI negozio.
 */
export async function cestinaNegozio(negozioId: string, userId: string): Promise<void> {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("negozi")
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq("id", negozioId)
    .is("deleted_at", null);

  if (error) {
    throw new Error(error.message ?? "Impossibile spostare il negozio nel cestino.");
  }
}

/**
 * Ripristina un negozio dal Cestino — ESCLUSIVAMENTE amministratore.
 * Il commerciante può eliminare il proprio negozio ma non ripristinarlo.
 */
export async function ripristinaNegozio(negozioId: string): Promise<void> {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("negozi")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", negozioId)
    .not("deleted_at", "is", null);

  if (error) {
    throw new Error(error.message ?? "Impossibile ripristinare il negozio.");
  }
}
