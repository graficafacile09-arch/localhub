import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { utenteAdminAutorizzato } from "@/lib/auth/roles";
import { creaNotificaAdmin } from "@/lib/amministratore/notifiche";

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

/** Campi di un'offerta modificabili dal pannello (senza il negozio). */
export type CampiOfferta = Partial<Omit<OffertaInput, "negozio_id">>;

export type EsitoValidazione<T> =
  | { valore: T; errore: null }
  | { valore: null; errore: string };

function validaCampoPrezzo(campo: "prezzo_originale" | "prezzo_offerta", value: unknown): number | null | "invalido" {
  if (value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const numero = Number(value);
  if (!Number.isFinite(numero) || numero < 0) return "invalido";
  return numero;
}

function validaCampoData(value: unknown): string | null | "invalido" {
  if (value === null) return null;
  if (typeof value !== "string") return "invalido";
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return "invalido";
  return data.toISOString();
}

/**
 * Validazione condivisa dei campi offerta (titolo/descrizione/prezzi/date/
 * immagine/attiva), coerente con i flussi del venditore. Usata dalle route
 * amministrative (POST crea e PATCH modifica) senza duplicare logica.
 */
export function validaCampiOfferta(
  body: Record<string, unknown>,
  opts: { parziale: boolean }
): EsitoValidazione<CampiOfferta> {
  const input: CampiOfferta = {};

  if ("titolo" in body) {
    const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
    if (!titolo) {
      return { valore: null, errore: "Il titolo dell'offerta è obbligatorio." };
    }
    input.titolo = titolo;
  } else if (!opts.parziale) {
    return { valore: null, errore: "Il titolo dell'offerta è obbligatorio." };
  }

  if ("descrizione" in body && body.descrizione !== undefined) {
    if (body.descrizione === null) {
      input.descrizione = null;
    } else if (typeof body.descrizione === "string") {
      input.descrizione = body.descrizione.trim() || null;
    } else {
      return { valore: null, errore: "La descrizione deve essere testo." };
    }
  }

  for (const campo of ["prezzo_originale", "prezzo_offerta"] as const) {
    if (!(campo in body) || body[campo] === undefined) continue;
    const esito = validaCampoPrezzo(campo, body[campo]);
    if (esito === "invalido") {
      return { valore: null, errore: `"${campo}" deve essere un numero non negativo.` };
    }
    input[campo] = esito;
  }

  if ("immagine_url" in body && body.immagine_url !== undefined) {
    if (body.immagine_url === null) {
      input.immagine_url = null;
    } else if (typeof body.immagine_url === "string") {
      input.immagine_url = body.immagine_url.trim() || null;
    } else {
      return { valore: null, errore: "immagine_url deve essere testo." };
    }
  }

  for (const campo of ["data_inizio", "data_fine"] as const) {
    if (!(campo in body) || body[campo] === undefined) continue;
    const esito = validaCampoData(body[campo]);
    if (esito === "invalido") {
      return { valore: null, errore: `"${campo}" deve essere una data ISO valida.` };
    }
    input[campo] = esito;
  }

  if ("attiva" in body && body.attiva !== undefined && body.attiva !== null) {
    if (typeof body.attiva !== "boolean") {
      return { valore: null, errore: "attiva deve essere booleano." };
    }
    input.attiva = body.attiva;
  }

  if (opts.parziale && Object.keys(input).length === 0) {
    return { valore: null, errore: "Nessun campo da aggiornare." };
  }

  return { valore: input, errore: null };
}

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

  // Notifica admin — BEST-EFFORT, creazione offerta riuscita. Mai
  // bloccante: un errore qui non tocca l'esito della creazione.
  await creaNotificaAdmin({
    tipo: "offerta_creata",
    titolo: "Nuova offerta pubblicata",
    corpo: data.titolo,
    gravita: "info",
    href: "/amministratore/offerte",
  });

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

/** Negozi attivi (non cestinati) tra cui l'admin può scegliere alla creazione. */
export async function getNegoziPerOffertaAdmin(): Promise<{ id: string; nome: string }[]> {
  const db = getDb();
  if (!db) return [];
  const { data, error } = await db
    .from("negozi")
    .select("id, nome")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error || !data) return [];
  return (data ?? []).map((riga) => ({
    id: String(riga.id),
    nome: String(riga.nome ?? "Negozio senza nome"),
  }));
}

/** Legge un'offerta nella forma OffertaAdmin (con i riferimenti del negozio). */
export async function getOffertaAdminById(
  offertaId: string
): Promise<OffertaAdmin | null> {
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db
    .from("offerte")
    .select(`${COLONNE_OFFERTE}, negozi(nome, slug, attivo)`)
    .eq("id", offertaId)
    .maybeSingle();
  if (error || !data) return null;
  return estraiOffertaAdmin(data as Record<string, unknown>);
}

/** Crea un'offerta dal pannello Amministratore (per un negozio scelto). */
export async function creaOffertaAdmin(
  input: Omit<OffertaInput, "negozio_id"> & { negozio_id: string }
): Promise<{ ok: true; data: OffertaAdmin } | { ok: false; errore: string }> {
  const db = getDb();
  if (!db) return { ok: false, errore: "Database non disponibile." };

  const { data, error } = await db
    .from("offerte")
    .insert({
      negozio_id: input.negozio_id,
      titolo: input.titolo,
      descrizione: input.descrizione ?? null,
      prezzo_originale: input.prezzo_originale ?? null,
      prezzo_offerta: input.prezzo_offerta ?? null,
      immagine_url: input.immagine_url ?? null,
      data_inizio: input.data_inizio ?? null,
      data_fine: input.data_fine ?? null,
      attiva: input.attiva ?? true,
    })
    .select(COLONNE_OFFERTE)
    .single();

  if (error || !data) {
    return { ok: false, errore: error?.message ?? "Impossibile creare l'offerta." };
  }

  const completa = await getOffertaAdminById(String(data.id));
  if (!completa) {
    return { ok: false, errore: "Offerta creata ma non leggibile dal pannello." };
  }
  return { ok: true, data: completa };
}

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