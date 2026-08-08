import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { utenteAdminAutorizzato } from "@/lib/auth/roles";

/** Tipo offerta della tabella offerte. */
export type Offerta = {
  id: string;
  negozio_id: string;
  titolo: string;
  descrizione: string | null;
  prezzo_originale: number | null;
  prezzo_offerta: number | null;
  immagine_url: string | null;
  data_inizio: string | null;
  data_fine: string | null;
  attiva: boolean;
  created_at: string;
  updated_at: string;
};

export type OffertaInput = {
  negozio_id?: string;
  titolo: string;
  descrizione?: string | null;
  prezzo_originale?: number | null;
  prezzo_offerta?: number | null;
  immagine_url?: string | null;
  data_inizio?: string | null;
  data_fine?: string | null;
  attiva?: boolean;
};

/** Offerta con riferimenti del negozio per il pannello amministratore. */
export type OffertaAdmin = Offerta & {
  negozio_nome: string | null;
  negozio_slug: string | null;
  negozio_attivo: boolean | null;
};

export type FiltriOfferte = {
  ricerca?: string;
  negozioId?: string;
  stato?: "attive" | "disattivate";
};

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

function assumiOfferta(riga: Record<string, unknown>): Offerta {
  return {
    id: String(riga.id),
    negozio_id: String(riga.negozio_id),
    titolo: String(riga.titolo ?? ""),
    descrizione: (riga.descrizione as string | null) ?? null,
    prezzo_originale: assumiNumero(riga.prezzo_originale),
    prezzo_offerta: assumiNumero(riga.prezzo_offerta),
    immagine_url: (riga.immagine_url as string | null) ?? null,
    data_inizio: (riga.data_inizio as string | null) ?? null,
    data_fine: (riga.data_fine as string | null) ?? null,
    attiva: (riga.attiva as boolean) ?? true,
    created_at: String(riga.created_at ?? ""),
    updated_at: String(riga.updated_at ?? ""),
  };
}

function assumiNumero(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const COLONNE_OFFERTE =
  "id, negozio_id, titolo, descrizione, prezzo_originale, prezzo_offerta, immagine_url, data_inizio, data_fine, attiva, created_at, updated_at";

function estraiOffertaAdmin(riga: Record<string, unknown>): OffertaAdmin {
  const base = assumiOfferta(riga);
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

// ────────────────────────────────────────────────────
// CLIENT per venditore vs admin
// ────────────────────────────────────────────────────
async function getDbPerUtente(userId: string, email: string) {
  if (await utenteAdminAutorizzato(userId, email)) {
    return createAdminSupabaseClient();
  }
  return await createServerSupabaseClient();
}

// ════════════════════════════════════════════════════
// OFFERTE DEL VENDITORE (per un singolo negozio)
// ════════════════════════════════════════════════════

export async function getOfferteNegozio(
  userId: string,
  email: string,
  negozioId: string
): Promise<Offerta[]> {
  const db = await getDbPerUtente(userId, email);
  const { data, error } = await db
    .from("offerte")
    .select(COLONNE_OFFERTE)
    .eq("negozio_id", negozioId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []).map((riga) => assumiOfferta(riga as Record<string, unknown>));
}

export async function creaOffertaNegozio(
  userId: string,
  email: string,
  negozioId: string,
  input: Omit<OffertaInput, "negozio_id">
): Promise<{ ok: true; data: Offerta } | { ok: false; errore: string }> {
  const db = await getDbPerUtente(userId, email);
  const { data, error } = await db
    .from("offerte")
    .insert({ ...input, negozio_id: negozioId })
    .select(COLONNE_OFFERTE)
    .single();

  if (error || !data) {
    return { ok: false, errore: error?.message ?? "Impossibile creare l'offerta." };
  }
  return { ok: true, data: assumiOfferta(data as Record<string, unknown>) };
}

export async function aggiornaOffertaNegozio(
  userId: string,
  email: string,
  negozioId: string,
  offertaId: string,
  patch: Partial<Omit<OffertaInput, "negozio_id">>
): Promise<{ ok: true; data: Offerta } | { ok: false; errore: string }> {
  const db = await getDbPerUtente(userId, email);
  const { data, error } = await db
    .from("offerte")
    .update(patch)
    .eq("id", offertaId)
    .eq("negozio_id", negozioId)
    .select(COLONNE_OFFERTE)
    .single();

  if (error || !data) {
    return { ok: false, errore: error?.message ?? "Impossibile aggiornare l'offerta." };
  }
  return { ok: true, data: assumiOfferta(data as Record<string, unknown>) };
}

export async function eliminaOffertaNegozio(
  userId: string,
  email: string,
  negozioId: string,
  offertaId: string
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const db = await getDbPerUtente(userId, email);
  const { error } = await db
    .from("offerte")
    .delete()
    .eq("id", offertaId)
    .eq("negozio_id", negozioId);

  if (error) {
    return { ok: false, errore: error.message ?? "Impossibile eliminare l'offerta." };
  }
  return { ok: true };
}

// ════════════════════════════════════════════════════
// OFFERTE AMMINISTRATORE (globale)
// ════════════════════════════════════════════════════

export async function getOfferteAdmin(filtri?: FiltriOfferte): Promise<OffertaAdmin[]> {
  const db = getDb();
  if (!db) return [];

  let query = db
    .from("offerte")
    .select(`${COLONNE_OFFERTE}, negozi(nome, slug, attivo)`);

  if (filtri?.negozioId) {
    query = query.eq("negozio_id", filtri.negozioId);
  }
  if (filtri?.stato === "attive") {
    query = query.eq("attiva", true);
  }
  if (filtri?.stato === "disattivate") {
    query = query.eq("attiva", false);
  }

  const { data, error } = await query
    .order("attiva", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];

  let offerte = (data ?? []).map((riga) =>
    estraiOffertaAdmin(riga as Record<string, unknown>)
  );

  if (filtri?.ricerca) {
    const termine = filtri.ricerca.trim().toLowerCase();
    offerte = offerte.filter(
      (o) =>
        o.titolo.toLowerCase().includes(termine) ||
        (o.descrizione ?? "").toLowerCase().includes(termine) ||
        (o.negozio_nome ?? "").toLowerCase().includes(termine)
    );
  }

  return offerte;
}

export async function aggiornaOffertaAdmin(
  offertaId: string,
  patch: Partial<Omit<OffertaInput, "negozio_id">> & { negozio_id?: string }
): Promise<{ ok: true; data: OffertaAdmin } | { ok: false; errore: string }> {
  const db = getDb();
  if (!db) return { ok: false, errore: "Database non disponibile." };

  const { data, error } = await db
    .from("offerte")
    .update(patch)
    .eq("id", offertaId)
    .select(`${COLONNE_OFFERTE}, negozi(nome, slug, attivo)`)
    .single();

  if (error || !data) {
    return { ok: false, errore: error?.message ?? "Impossibile aggiornare l'offerta." };
  }
  return { ok: true, data: estraiOffertaAdmin(data as Record<string, unknown>) };
}

export async function eliminaOffertaAdmin(
  offertaId: string
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const db = getDb();
  if (!db) return { ok: false, errore: "Database non disponibile." };

  const { error } = await db.from("offerte").delete().eq("id", offertaId);
  if (error) {
    return { ok: false, errore: error.message ?? "Impossibile eliminare l'offerta." };
  }
  return { ok: true };
}

// ════════════════════════════════════════════════════
// OFFERTE PUBBLICHE (solo attive e in periodo valido)
// ════════════════════════════════════════════════════

export async function getOffertePubblicheNegozio(negozioId: string): Promise<Offerta[]> {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("offerte")
    .select(COLONNE_OFFERTE)
    .eq("negozio_id", negozioId)
    .eq("attiva", true)
    .order("created_at", { ascending: false });

  if (error) return [];

  const ora = Date.now();
  return (data ?? [])
    .map((riga) => assumiOfferta(riga as Record<string, unknown>))
    .filter((o) => {
      if (o.data_inizio && Date.parse(o.data_inizio) > ora) return false;
      if (o.data_fine && Date.parse(o.data_fine) < ora) return false;
      return true;
    });
}

export async function getOffertePubbliche(): Promise<Offerta[]> {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("offerte")
    .select(COLONNE_OFFERTE)
    .eq("attiva", true)
    .order("created_at", { ascending: false });

  if (error) return [];

  const ora = Date.now();
  return (data ?? [])
    .map((riga) => assumiOfferta(riga as Record<string, unknown>))
    .filter((o) => {
      if (o.data_inizio && Date.parse(o.data_inizio) > ora) return false;
      if (o.data_fine && Date.parse(o.data_fine) < ora) return false;
      return true;
    });
}