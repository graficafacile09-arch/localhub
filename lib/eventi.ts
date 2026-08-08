import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { utenteAdminAutorizzato } from "@/lib/auth/roles";

/** Tipo evento della tabella eventi. */
export type Evento = {
  id: string;
  negozio_id: string;
  titolo: string;
  descrizione: string | null;
  immagine_url: string | null;
  luogo: string | null;
  data_inizio: string | null;
  data_fine: string | null;
  attivo: boolean;
  created_at: string;
  updated_at: string;
};

export type EventoInput = {
  negozio_id?: string;
  titolo: string;
  descrizione?: string | null;
  immagine_url?: string | null;
  luogo?: string | null;
  data_inizio?: string | null;
  data_fine?: string | null;
  attivo?: boolean;
};

/** Evento con riferimenti del negozio per il pannello amministratore. */
export type EventoAdmin = Evento & {
  negozio_nome: string | null;
  negozio_slug: string | null;
  negozio_attivo: boolean | null;
};

export type FiltriEventi = {
  ricerca?: string;
  negozioId?: string;
  stato?: "attivi" | "disattivati";
};

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

function assumiEvento(riga: Record<string, unknown>): Evento {
  return {
    id: String(riga.id),
    negozio_id: String(riga.negozio_id),
    titolo: String(riga.titolo ?? ""),
    descrizione: (riga.descrizione as string | null) ?? null,
    immagine_url: (riga.immagine_url as string | null) ?? null,
    luogo: (riga.luogo as string | null) ?? null,
    data_inizio: (riga.data_inizio as string | null) ?? null,
    data_fine: (riga.data_fine as string | null) ?? null,
    attivo: (riga.attivo as boolean) ?? true,
    created_at: String(riga.created_at ?? ""),
    updated_at: String(riga.updated_at ?? ""),
  };
}

const COLONNE_EVENTI =
  "id, negozio_id, titolo, descrizione, immagine_url, luogo, data_inizio, data_fine, attivo, created_at, updated_at";

function estraiEventoAdmin(riga: Record<string, unknown>): EventoAdmin {
  const base = assumiEvento(riga);
  const negozio = riga.negozi as
    | { nome: string | null; slug: string | null; attivo?: boolean | null }
    | null;
  return {
    ...base,
    negozio_nome: negozio?.nome ?? null,
    negozio_slug: negozio?.slug ?? null,
    negozio_attivo: negozio?.attivo ?? false,
  };
}

async function getDbPerUtente(userId: string, email: string) {
  if (await utenteAdminAutorizzato(userId, email)) {
    return createAdminSupabaseClient();
  }
  return await createServerSupabaseClient();
}

// ════════════════════════════════════════════════════
// EVENTI DEL VENDITORE (per un singolo negozio)
// ════════════════════════════════════════════════════

export async function getEventiNegozio(
  userId: string,
  email: string,
  negozioId: string
): Promise<Evento[]> {
  const db = await getDbPerUtente(userId, email);
  const { data, error } = await db
    .from("eventi")
    .select(COLONNE_EVENTI)
    .eq("negozio_id", negozioId)
    .order("data_inizio", { ascending: true });

  if (error) return [];
  return (data ?? []).map((riga) => assumiEvento(riga as Record<string, unknown>));
}

export async function creaEventoNegozio(
  userId: string,
  email: string,
  negozioId: string,
  input: Omit<EventoInput, "negozio_id">
): Promise<{ ok: true; data: Evento } | { ok: false; errore: string }> {
  const db = await getDbPerUtente(userId, email);
  const { data, error } = await db
    .from("eventi")
    .insert({ ...input, negozio_id: negozioId })
    .select(COLONNE_EVENTI)
    .single();

  if (error || !data) {
    return { ok: false, errore: error?.message ?? "Impossibile creare l'evento." };
  }
  return { ok: true, data: assumiEvento(data as Record<string, unknown>) };
}

export async function aggiornaEventoNegozio(
  userId: string,
  email: string,
  negozioId: string,
  eventoId: string,
  patch: Partial<Omit<EventoInput, "negozio_id">>
): Promise<{ ok: true; data: Evento } | { ok: false; errore: string }> {
  const db = await getDbPerUtente(userId, email);
  const { data, error } = await db
    .from("eventi")
    .update(patch)
    .eq("id", eventoId)
    .eq("negozio_id", negozioId)
    .select(COLONNE_EVENTI)
    .single();

  if (error || !data) {
    return { ok: false, errore: error?.message ?? "Impossibile aggiornare l'evento." };
  }
  return { ok: true, data: assumiEvento(data as Record<string, unknown>) };
}

export async function eliminaEventoNegozio(
  userId: string,
  email: string,
  negozioId: string,
  eventoId: string
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const db = await getDbPerUtente(userId, email);
  const { error } = await db
    .from("eventi")
    .delete()
    .eq("id", eventoId)
    .eq("negozio_id", negozioId);

  if (error) {
    return { ok: false, errore: error.message ?? "Impossibile eliminare l'evento." };
  }
  return { ok: true };
}

// ════════════════════════════════════════════════════
// EVENTI AMMINISTRATORE (globale)
// ════════════════════════════════════════════════════

export async function getEventiAdmin(filtri?: FiltriEventi): Promise<EventoAdmin[]> {
  const db = getDb();
  if (!db) return [];

  let query = db
    .from("eventi")
    .select(`${COLONNE_EVENTI}, negozi(nome, slug, attivo)`);

  if (filtri?.negozioId) {
    query = query.eq("negozio_id", filtri.negozioId);
  }
  if (filtri?.stato === "attivi") {
    query = query.eq("attivo", true);
  }
  if (filtri?.stato === "disattivati") {
    query = query.eq("attivo", false);
  }

  const { data, error } = await query
    .order("attivo", { ascending: false })
    .order("data_inizio", { ascending: true });

  if (error) return [];

  let eventi = (data ?? []).map((riga) =>
    estraiEventoAdmin(riga as Record<string, unknown>)
  );

  if (filtri?.ricerca) {
    const termine = filtri.ricerca.trim().toLowerCase();
    eventi = eventi.filter(
      (e) =>
        e.titolo.toLowerCase().includes(termine) ||
        (e.descrizione ?? "").toLowerCase().includes(termine) ||
        (e.luogo ?? "").toLowerCase().includes(termine) ||
        (e.negozio_nome ?? "").toLowerCase().includes(termine)
    );
  }

  return eventi;
}

export async function aggiornaEventoAdmin(
  eventoId: string,
  patch: Partial<Omit<EventoInput, "negozio_id">> & { negozio_id?: string }
): Promise<{ ok: true; data: EventoAdmin } | { ok: false; errore: string }> {
  const db = getDb();
  if (!db) return { ok: false, errore: "Database non disponibile." };

  const { data, error } = await db
    .from("eventi")
    .update(patch)
    .eq("id", eventoId)
    .select(`${COLONNE_EVENTI}, negozi(nome, slug, attivo)`)
    .single();

  if (error || !data) {
    return { ok: false, errore: error?.message ?? "Impossibile aggiornare l'evento." };
  }
  return { ok: true, data: estraiEventoAdmin(data as Record<string, unknown>) };
}

export async function eliminaEventoAdmin(
  eventoId: string
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const db = getDb();
  if (!db) return { ok: false, errore: "Database non disponibile." };

  const { error } = await db.from("eventi").delete().eq("id", eventoId);
  if (error) {
    return { ok: false, errore: error.message ?? "Impossibile eliminare l'evento." };
  }
  return { ok: true };
}

// ════════════════════════════════════════════════════
// EVENTI PUBBLICI (solo attivi e in periodo valido)
// ════════════════════════════════════════════════════

export async function getEventiPubbliciNegozio(negozioId: string): Promise<Evento[]> {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("eventi")
    .select(COLONNE_EVENTI)
    .eq("negozio_id", negozioId)
    .eq("attivo", true)
    .order("data_inizio", { ascending: true });

  if (error) return [];

  const ora = Date.now();
  return (data ?? [])
    .map((riga) => assumiEvento(riga as Record<string, unknown>))
    .filter((e) => {
      if (e.data_inizio && Date.parse(e.data_inizio) > ora + 60_000) return false;
      if (e.data_fine && Date.parse(e.data_fine) < ora - 60_000) return false;
      return true;
    });
}

export async function getEventiPubblici(): Promise<Evento[]> {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("eventi")
    .select(COLONNE_EVENTI)
    .eq("attivo", true)
    .order("data_inizio", { ascending: true });

  if (error) return [];

  const ora = Date.now();
  return (data ?? [])
    .map((riga) => assumiEvento(riga as Record<string, unknown>))
    .filter((e) => {
      if (e.data_inizio && Date.parse(e.data_inizio) > ora + 60_000) return false;
      if (e.data_fine && Date.parse(e.data_fine) < ora - 60_000) return false;
      return true;
    });
}