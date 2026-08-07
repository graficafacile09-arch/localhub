import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/** Riga minima di negozio valutabile per il filtro demo. */
export type NegozioDemoRow = {
  nome: string | null;
  slug?: string | null;
  is_demo?: boolean | null;
};

/**
 * FILTRO DEFINITIVO dei negozi demo (migrazione 20260806_negozi_is_demo):
 *  1. colonna is_demo = true (fonte autorevole, impostata dalla migrazione
 *     per i seed "demo-…" e per i negozi dei test E2E);
 *  2. fallback per nome ("E2E …", "Negozio Rinominato …" — suite E2E);
 *  3. fallback per slug ("demo-…" — negozi seed con nomi realistici).
 * I negozi demo NON compaiono MAI nelle viste dell'Area Amministratore.
 */
export function eNegozioDaEscludere(riga: NegozioDemoRow): boolean {
  if (riga.is_demo === true) return true;
  const nome = riga.nome ?? "";
  if (/^(E2E|Negozio Rinominato)\s/.test(nome)) return true;
  if (riga.slug && /^demo-/i.test(riga.slug)) return true;
  return false;
}

export type EsitoQuery<T> = {
  data: T[] | null;
  error: { code?: string; message?: string } | null;
};

/** Codici di errore PostgREST/Supabase relativi a schema/colonne mancanti. */
const CODICI_SCHEMA = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

/**
 * Esegue una query sui negozi escludendo SEMPRE i demo:
 * prova prima con la colonna is_demo (migrazione applicata); se la colonna
 * non esiste, ripete la query senza colonna e filtra per nome/slug in TS.
 * In entrambi i casi nessun negozio demo raggiunge il chiamante.
 */
export async function queryNegoziNonDemo<T extends NegozioDemoRow>(
  esegui: (usaColonna: boolean) => Promise<EsitoQuery<T>>
): Promise<EsitoQuery<T>> {
  const conColonna = await esegui(true);
  if (!conColonna.error) {
    return {
      data: (conColonna.data ?? []).filter((r) => !eNegozioDaEscludere(r)),
      error: null,
    };
  }
  if (CODICI_SCHEMA.has(conColonna.error.code ?? "")) {
    const senzaColonna = await esegui(false);
    if (!senzaColonna.error) {
      return {
        data: (senzaColonna.data ?? []).filter((r) => !eNegozioDaEscludere(r)),
        error: null,
      };
    }
    return senzaColonna;
  }
  return conColonna;
}

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
 * Elenca TUTTI i negozi soft-deleted, di qualunque proprietario e valore
 * is_demo: la lista admin "Gestione Negozi" mostra ogni negozio, quindi
 * anche ciò che viene eliminato deve essere visibile e ripristinabile.
 */
export async function getNegoziCestino(): Promise<NegozioCestino[]> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("negozi")
    .select(
      "id, nome, categoria, descrizione, attivo, logo_url, deleted_at, slug"
    )
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    throw new Error(
      error.message ?? "Impossibile recuperare il cestino."
    );
  }

  return (data ?? []) as NegozioCestino[];
}

/** Elenco dei negozi ATTIVI (per il picker della creazione template). */
export async function getNegoziAttiviSintesi(): Promise<NegozioSintesi[]> {
  const supabase = createAdminSupabaseClient();

  const esito = await queryNegoziNonDemo<NegozioSintesi & { slug: string | null }>(
    async (usaColonna) => {
      let query = supabase
        .from("negozi")
        .select("id, nome, categoria, slug")
        .is("deleted_at", null)
        .order("nome", { ascending: true });
      if (usaColonna) query = query.eq("is_demo", false);
      const { data, error } = await query;
      return {
        data: (data ?? []) as (NegozioSintesi & { slug: string | null })[],
        error,
      };
    }
  );

  if (esito.error) {
    throw new Error(
      esito.error.message ?? "Impossibile recuperare i negozi."
    );
  }

  return (esito.data ?? []) as NegozioSintesi[];
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

/**
 * Elimina DEFINITIVAMENTE un negozio dal database — SOLO se è nel Cestino
 * (deleted_at non null). Elimina anche prodotti e media collegati.
 * Azione distruttiva e irreversibile, riservata all'amministratore.
 */
export async function eliminaDefinitivamenteNegozio(
  negozioId: string
): Promise<void> {
  const supabase = createAdminSupabaseClient();

  // Soltanto dal Cestino: il negozio DEVE avere deleted_at impostato.
  const { error } = await supabase
    .from("negozi")
    .delete()
    .eq("id", negozioId)
    .not("deleted_at", "is", null);

  if (error) {
    throw new Error(
      error.message ?? "Impossibile eliminare definitivamente il negozio."
    );
  }

  // Pulizia dei dati collegati (best effort: se una tabella manca, si ignora).
  await supabase.from("prodotti").delete().eq("negozio_id", negozioId);
  await supabase.from("media").delete().eq("negozio_id", negozioId);
}
