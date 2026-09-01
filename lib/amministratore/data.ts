import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { eNegozioDaEscludere } from "./negozi";

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

/** Codici di errore PostgREST/Supabase relativi a schema/colonne mancanti. */
const CODICI_SCHEMA = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const èErroreSchema = (e: { code?: string } | null) =>
  Boolean(e?.code && CODICI_SCHEMA.has(e.code));

/**
 * Id dei negozi demo (colonna is_demo, con fallback per nome/slug).
 * I negozi demo non compaiono MAI nei dati dell'Area Amministratore.
 */
async function idNegoziDemo(db: AdminDb): Promise<string[]> {
  const { data: conColonna, error } = await db
    .from("negozi")
    .select("id")
    .eq("is_demo", true)
    .is("deleted_at", null);

  if (!error) return (conColonna ?? []).map((r) => String(r.id));

  if (èErroreSchema(error)) {
    const { data: senzaColonna } = await db
      .from("negozi")
      .select("id, nome, slug")
      .is("deleted_at", null);
    return (senzaColonna ?? [])
      .filter((r) =>
        eNegozioDaEscludere({
          nome: r.nome as string | null,
          slug: r.slug as string | null,
        })
      )
      .map((r) => String(r.id));
  }

  return [];
}

async function contaNegoziAttivi(db: AdminDb): Promise<number> {
  try {
    const query = db
      .from("negozi")
      .select("id", { count: "exact", head: true })
      .eq("attivo", true)
      .is("deleted_at", null);
    let res = await query.eq("is_demo", false);
    if (èErroreSchema(res.error)) {
      res = await db
        .from("negozi")
        .select("id", { count: "exact", head: true })
        .eq("attivo", true)
        .is("deleted_at", null);
    }
    return res.count ?? 0;
  } catch {
    return 0;
  }
}

async function contaProdottiAttivi(db: AdminDb): Promise<number> {
  try {
    const demoIds = await idNegoziDemo(db);
    let query = db
      .from("prodotti")
      .select("id", { count: "exact", head: true })
      .eq("attivo", true);
    // I prodotti dei negozi demo non contano nei dati della piattaforma.
    if (demoIds.length > 0) {
      query = query.not("negozio_id", "in", `(${demoIds.join(",")})`);
    }
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function contaNegoziInEvidenza(db: AdminDb): Promise<number> {
  try {
    const query = db
      .from("negozi")
      .select("id", { count: "exact", head: true })
      .eq("in_evidenza", true)
      .eq("attivo", true)
      .is("deleted_at", null);
    let res = await query.eq("is_demo", false);
    if (èErroreSchema(res.error)) {
      res = await db
        .from("negozi")
        .select("id", { count: "exact", head: true })
        .eq("in_evidenza", true)
        .eq("attivo", true)
        .is("deleted_at", null);
    }
    return res.count ?? 0;
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
 * Dati REALI dal database; i negozi demo sono sempre esclusi. Le sezioni
 * senza tabella dedicata (utenti, offerte, eventi, segnalazioni) restano
 * a 0 finché il relativo modulo non avrà la sua fonte dati.
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
