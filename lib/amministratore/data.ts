import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type ConteggiDashboard = {
  negozi: number;
  prodotti: number;
  utenti: number;
  offerte: number;
  eventi: number;
  negoziInEvidenza: number;
  segnalazioni: number;
  categorie: number;
};

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

type AdminDb = NonNullable<ReturnType<typeof getDb>>;

async function contaNegoziAttivi(db: AdminDb): Promise<number> {
  try {
    const { count, error } = await db
      .from("negozi")
      .select("id", { count: "exact", head: true })
      .eq("attivo", true)
      .is("deleted_at", null);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function contaProdottiAttivi(db: AdminDb): Promise<number> {
  try {
    const { count, error } = await db
      .from("prodotti")
      .select("id", { count: "exact", head: true })
      .eq("attivo", true);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function contaNegoziInEvidenza(db: AdminDb): Promise<number> {
  try {
    const { count, error } = await db
      .from("negozi")
      .select("id", { count: "exact", head: true })
      .eq("in_evidenza", true)
      .eq("attivo", true)
      .is("deleted_at", null);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function contaCategorieAttive(db: AdminDb): Promise<number> {
  try {
    const { count, error } = await db
      .from("categorie")
      .select("id", { count: "exact", head: true })
      .eq("attivo", true);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Conteggi reali per la Dashboard Amministratore.
 * Usa solo dati realmente disponibili: se una sezione non ha ancora una
 * tabella dedicata (utenti, offerte, eventi, segnalazioni) il valore è 0 —
 * nessun dato inventato. In caso di errore di configurazione ritorna 0.
 */
export async function getConteggiDashboard(): Promise<ConteggiDashboard> {
  const db = getDb();
  if (!db) {
    return {
      negozi: 0,
      prodotti: 0,
      utenti: 0,
      offerte: 0,
      eventi: 0,
      negoziInEvidenza: 0,
      segnalazioni: 0,
      categorie: 0,
    };
  }

  const [negozi, prodotti, negoziInEvidenza, categorie] = await Promise.all([
    contaNegoziAttivi(db),
    contaProdottiAttivi(db),
    contaNegoziInEvidenza(db),
    contaCategorieAttive(db),
  ]);

  return {
    negozi,
    prodotti,
    utenti: 0,
    offerte: 0,
    eventi: 0,
    negoziInEvidenza,
    segnalazioni: 0,
    categorie,
  };
}
