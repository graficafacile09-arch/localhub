import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import type {
  Segnalazione,
  SegnalazioneAdmin,
  SegnalazioneFiltri,
  SegnalazionePriorita,
  SegnalazioneStato,
  SegnalazioneStats,
  SegnalazioneTargetType,
  SegnalazioneTipo,
  CreaSegnalazioneInput,
} from "./segnalazioni/types";

export type {
  Segnalazione,
  SegnalazioneAdmin,
  SegnalazioneFiltri,
  SegnalazionePriorita,
  SegnalazioneStato,
  SegnalazioneStats,
  SegnalazioneTargetType,
  SegnalazioneTipo,
  CreaSegnalazioneInput,
} from "./segnalazioni/types";
export {
  PRIORITA_LABELS,
  PRIORITA_ORDINE,
  STATO_LABELS,
  TARGET_TYPE_LABELS,
  TIPO_LABELS,
} from "./segnalazioni/types";

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

function assumiSegnalazione(riga: Record<string, unknown>): Segnalazione {
  return {
    id: String(riga.id),
    created_at: String(riga.created_at),
    updated_at: String(riga.updated_at),
    user_id: (riga.user_id as string | null) ?? null,
    user_email: (riga.user_email as string | null) ?? null,
    tipo: (riga.tipo as SegnalazioneTipo) ?? "altro",
    titolo: String(riga.titolo ?? ""),
    descrizione: String(riga.descrizione ?? ""),
    target_type: (riga.target_type as SegnalazioneTargetType | null) ?? null,
    target_id: (riga.target_id as string | null) ?? null,
    target_name: (riga.target_name as string | null) ?? null,
    negozio_id: (riga.negozio_id as string | null) ?? null,
    stato: (riga.stato as SegnalazioneStato) ?? "nuova",
    priorita: (riga.priorita as SegnalazionePriorita) ?? "normale",
    note_admin: (riga.note_admin as string | null) ?? null,
    resolved_at: (riga.resolved_at as string | null) ?? null,
    resolved_by: (riga.resolved_by as string | null) ?? null,
  };
}

function estraiSegnalazioneAdmin(riga: Record<string, unknown>): SegnalazioneAdmin {
  const base = assumiSegnalazione(riga);
  const negozio = riga.negozi as { nome: string | null } | null;
  return {
    ...base,
    negozio_nome: negozio?.nome ?? null,
  };
}

/**
 * Crea una nuova segnalazione (lato client).
 * Usa la funzione SQL `crea_segnalazione` per bypassare RLS (service role).
 */
export async function creaSegnalazione(
  userId: string,
  userEmail: string,
  input: CreaSegnalazioneInput
): Promise<{ ok: true; id: string } | { ok: false; errore: string }> {
  const db = getDb();
  if (!db) return { ok: false, errore: "Database non disponibile." };

  try {
    const { data, error } = await db.rpc("crea_segnalazione", {
      p_user_id: userId,
      p_user_email: userEmail,
      p_tipo: input.tipo,
      p_titolo: input.titolo,
      p_descrizione: input.descrizione,
      p_target_type: input.target_type ?? null,
      p_target_id: input.target_id ?? null,
      p_target_name: input.target_name ?? null,
      p_negozio_id: input.negozio_id ?? null,
    });

    if (error) {
      return { ok: false, errore: error.message ?? "Impossibile creare la segnalazione." };
    }

    return { ok: true, id: data as string };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return { ok: false, errore: message };
  }
}

/**
 * Recupera le segnalazioni dell'utente corrente (area clienti).
 */
export async function getSegnalazioniUtente(
  userId: string,
  filtri: Pick<SegnalazioneFiltri, "stato" | "limit" | "offset"> = {}
): Promise<Segnalazione[]> {
  const { createServerSupabaseClient } = await import("@/lib/supabase/server");
  try {
    const db = await createServerSupabaseClient();
    if (!db) return [];

    let query = db.from("segnalazioni").select("*").eq("user_id", userId);

    if (filtri.stato) {
      query = query.eq("stato", filtri.stato);
    }

    query = query.order("created_at", { ascending: false });

    const limit = filtri.limit ?? 20;
    const offset = filtri.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) return [];

    return (data ?? []).map((r) => assumiSegnalazione(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

/**
 * Recupera una singola segnalazione per l'utente (deve essere proprietario).
 */
export async function getSegnalazioneUtente(
  userId: string,
  segnalazioneId: string
): Promise<Segnalazione | null> {
  const { createServerSupabaseClient } = await import("@/lib/supabase/server");
  const db = await createServerSupabaseClient();
  if (!db) return null;

  const { data, error } = await db
    .from("segnalazioni")
    .select("*")
    .eq("id", segnalazioneId)
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return assumiSegnalazione(data as Record<string, unknown>);
}

/**
 * Recupera le segnalazioni per l'amministratore (con join negozi).
 */
export async function getSegnalazioniAdmin(
  filtri: SegnalazioneFiltri = {}
): Promise<SegnalazioneAdmin[]> {
  const db = getDb();
  if (!db) return [];

  let query = db.from("segnalazioni").select("*, negozi(nome)");

  if (filtri.stato) {
    query = query.eq("stato", filtri.stato);
  }
  if (filtri.priorita) {
    query = query.eq("priorita", filtri.priorita);
  }
  if (filtri.tipo) {
    query = query.eq("tipo", filtri.tipo);
  }
  if (filtri.targetType) {
    query = query.eq("target_type", filtri.targetType);
  }
  if (filtri.negozioId) {
    query = query.eq("negozio_id", filtri.negozioId);
  }
  if (filtri.userId) {
    query = query.eq("user_id", filtri.userId);
  }
  if (filtri.dataDa) {
    query = query.gte("created_at", filtri.dataDa);
  }
  if (filtri.dataA) {
    const fineGiorno = new Date(filtri.dataA);
    fineGiorno.setDate(fineGiorno.getDate() + 1);
    query = query.lt("created_at", fineGiorno.toISOString());
  }
  if (filtri.ricerca) {
    const term = filtri.ricerca.trim().toLowerCase();
    query = query.or(
      `titolo.ilike.%${term}%,descrizione.ilike.%${term}%,user_email.ilike.%${term}%,target_name.ilike.%${term}%,negozi.nome.ilike.%${term}%`
    );
  }

  const orderBy = filtri.orderBy ?? "created_at";
  const orderDirection = filtri.orderDirection ?? "desc";
  query = query.order(orderBy, { ascending: orderDirection === "asc" });

  const limit = filtri.limit ?? 50;
  const offset = filtri.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error("[segnalazioni] Errore query admin:", error.message);
    return [];
  }

  return (data ?? []).map((r) => estraiSegnalazioneAdmin(r as Record<string, unknown>));
}

/**
 * Conta le segnalazioni con filtri (per paginazione admin).
 */
export async function contaSegnalazioniAdmin(
  filtri: SegnalazioneFiltri = {}
): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  let query = db.from("segnalazioni").select("id", { count: "exact", head: true });

  if (filtri.stato) {
    query = query.eq("stato", filtri.stato);
  }
  if (filtri.priorita) {
    query = query.eq("priorita", filtri.priorita);
  }
  if (filtri.tipo) {
    query = query.eq("tipo", filtri.tipo);
  }
  if (filtri.targetType) {
    query = query.eq("target_type", filtri.targetType);
  }
  if (filtri.negozioId) {
    query = query.eq("negozio_id", filtri.negozioId);
  }
  if (filtri.userId) {
    query = query.eq("user_id", filtri.userId);
  }
  if (filtri.dataDa) {
    query = query.gte("created_at", filtri.dataDa);
  }
  if (filtri.dataA) {
    const fineGiorno = new Date(filtri.dataA);
    fineGiorno.setDate(fineGiorno.getDate() + 1);
    query = query.lt("created_at", fineGiorno.toISOString());
  }
  if (filtri.ricerca) {
    const term = filtri.ricerca.trim().toLowerCase();
    query = query.or(
      `titolo.ilike.%${term}%,descrizione.ilike.%${term}%,user_email.ilike.%${term}%,target_name.ilike.%${term}%,negozi.nome.ilike.%${term}%`
    );
  }

  const { count, error } = await query;
  if (error) {
    console.error("[segnalazioni] Errore count:", error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Recupera una singola segnalazione per admin.
 */
export async function getSegnalazioneAdmin(id: string): Promise<SegnalazioneAdmin | null> {
  const db = getDb();
  if (!db) return null;

  const { data, error } = await db.from("segnalazioni").select("*, negozi(nome)").eq("id", id).single();

  if (error || !data) return null;
  return estraiSegnalazioneAdmin(data as Record<string, unknown>);
}

/**
 * Aggiorna una segnalazione (solo admin).
 * Restituisce i valori precedenti per il log.
 */
export async function aggiornaSegnalazioneAdmin(
  id: string,
  patch: Partial<Pick<Segnalazione, "stato" | "priorita" | "note_admin">> & {
    resolved_at?: string | null;
    resolved_by?: string | null;
  }
): Promise<{ ok: true; data: SegnalazioneAdmin; precedenti: Partial<Segnalazione> } | { ok: false; errore: string }> {
  const db = getDb();
  if (!db) return { ok: false, errore: "Database non disponibile." };

  const { data: precedente } = await db.from("segnalazioni").select("*").eq("id", id).single();

  if (!precedente) {
    return { ok: false, errore: "Segnalazione non trovata." };
  }

  const { data, error } = await db.from("segnalazioni").update(patch).eq("id", id).select("*, negozi(nome)").single();

  if (error || !data) {
    return { ok: false, errore: error?.message ?? "Impossibile aggiornare la segnalazione." };
  }

  return {
    ok: true,
    data: estraiSegnalazioneAdmin(data as Record<string, unknown>),
    precedenti: assumiSegnalazione(precedente as Record<string, unknown>),
  };
}

/**
 * Statistiche per filtri dashboard admin.
 */
export async function getSegnalazioniStats(): Promise<SegnalazioneStats> {
  const db = getDb();
  if (!db) {
    return { totale: 0, perStato: [], perPriorita: [], perTipo: [] };
  }

  const [totale, perStato, perPriorita, perTipo] = await Promise.all([
    db.from("segnalazioni").select("id", { count: "exact", head: true }),
    db.from("segnalazioni").select("stato"),
    db.from("segnalazioni").select("priorita"),
    db.from("segnalazioni").select("tipo"),
  ]);

  const contaPerCampo = (righe: { [k: string]: string | null }[] | null, campo: string) => {
    const m = new Map<string, number>();
    for (const r of righe ?? []) {
      const v = r[campo];
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([chiave, count]) => ({ [campo]: chiave, count }))
      .sort((a, b) => b.count - a.count);
  };

  return {
    totale: totale.count ?? 0,
    perStato: contaPerCampo(perStato.data, "stato") as { stato: string; count: number }[],
    perPriorita: contaPerCampo(perPriorita.data, "priorita") as { priorita: string; count: number }[],
    perTipo: contaPerCampo(perTipo.data, "tipo") as { tipo: string; count: number }[],
  };
}
