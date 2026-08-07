import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AdminActivityLog = {
  id: string;
  created_at: string;
  admin_user_id: string | null;
  admin_email: string | null;
  operation_type: string;
  target_type: string;
  target_id: string | null;
  target_name: string | null;
  negozio_id: string | null;
  negozio_nome: string | null;
  result: "success" | "error";
  detail: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
};

export type AdminActivityFiltri = {
  ricerca?: string;
  operationType?: string;
  targetType?: string;
  negozioId?: string;
  dataDa?: string;
  dataA?: string;
  result?: "success" | "error";
  limit?: number;
  offset?: number;
};

export type AdminActivityStats = {
  totale: number;
  perTipoOperazione: { tipo: string; count: number }[];
  perRisorsa: { tipo: string; count: number }[];
  perRisultato: { risultato: string; count: number }[];
};

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

/**
 * Registra un'attività amministrativa.
 * Usa la funzione SQL `log_admin_activity` per bypassare RLS (service role).
 * Non lancia errori per non bloccare l'operazione principale.
 */
export async function registraAttivitaAdmin(params: {
  adminUserId: string;
  adminEmail: string;
  operationType: string;
  targetType: string;
  targetId?: string | null;
  targetName?: string | null;
  negozioId?: string | null;
  negozioNome?: string | null;
  result?: "success" | "error";
  detail?: Record<string, unknown>;
}): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const { data, error } = await db.rpc("log_admin_activity", {
      p_admin_user_id: params.adminUserId,
      p_admin_email: params.adminEmail,
      p_operation_type: params.operationType,
      p_target_type: params.targetType,
      p_target_id: params.targetId ?? null,
      p_target_name: params.targetName ?? null,
      p_negozio_id: params.negozioId ?? null,
      p_negozio_nome: params.negozioNome ?? null,
      p_result: params.result ?? "success",
      p_detail: params.detail ?? {},
    });

    if (error) {
      console.warn("[admin-activity-log] Errore registrazione:", error.message);
      return null;
    }

    return data as string;
  } catch (err) {
    console.warn("[admin-activity-log] Eccezione registrazione:", err);
    return null;
  }
}

/**
 * Recupera le attività con filtri e paginazione.
 */
export async function getAttivitaAdmin(
  filtri: AdminActivityFiltri = {}
): Promise<AdminActivityLog[]> {
  const db = getDb();
  if (!db) return [];

  let query = db.from("admin_activity_log").select("*");

  if (filtri.operationType) {
    query = query.eq("operation_type", filtri.operationType);
  }
  if (filtri.targetType) {
    query = query.eq("target_type", filtri.targetType);
  }
  if (filtri.negozioId) {
    query = query.eq("negozio_id", filtri.negozioId);
  }
  if (filtri.result) {
    query = query.eq("result", filtri.result);
  }
  if (filtri.dataDa) {
    query = query.gte("created_at", filtri.dataDa);
  }
  if (filtri.dataA) {
    // Aggiungi 1 giorno per includere tutto il giorno specificato
    const fineGiorno = new Date(filtri.dataA);
    fineGiorno.setDate(fineGiorno.getDate() + 1);
    query = query.lt("created_at", fineGiorno.toISOString());
  }
  if (filtri.ricerca) {
    const term = filtri.ricerca.trim().toLowerCase();
    query = query.or(
      `target_name.ilike.%${term}%,admin_email.ilike.%${term}%,operation_type.ilike.%${term}%,negozio_nome.ilike.%${term}%`
    );
  }

  query = query.order("created_at", { ascending: false });

  const limit = filtri.limit ?? 50;
  const offset = filtri.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error("[admin-activity-log] Errore query:", error.message);
    return [];
  }

  return (data ?? []) as AdminActivityLog[];
}

/**
 * Conta le attività con gli stessi filtri (per paginazione).
 */
export async function contaAttivitaAdmin(
  filtri: AdminActivityFiltri = {}
): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  let query = db.from("admin_activity_log").select("id", { count: "exact", head: true });

  if (filtri.operationType) {
    query = query.eq("operation_type", filtri.operationType);
  }
  if (filtri.targetType) {
    query = query.eq("target_type", filtri.targetType);
  }
  if (filtri.negozioId) {
    query = query.eq("negozio_id", filtri.negozioId);
  }
  if (filtri.result) {
    query = query.eq("result", filtri.result);
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
      `target_name.ilike.%${term}%,admin_email.ilike.%${term}%,operation_type.ilike.%${term}%,negozio_nome.ilike.%${term}%`
    );
  }

  const { count, error } = await query;
  if (error) {
    console.error("[admin-activity-log] Errore count:", error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Statistiche aggregate per dashboard/filtri.
 */
export async function getAttivitaStats(): Promise<AdminActivityStats> {
  const db = getDb();
  if (!db) {
    return { totale: 0, perTipoOperazione: [], perRisorsa: [], perRisultato: [] };
  }

  const [totale, perTipo, perRisorsa, perRisultato] = await Promise.all([
    db.from("admin_activity_log").select("id", { count: "exact", head: true }),
    db.from("admin_activity_log").select("operation_type"),
    db.from("admin_activity_log").select("target_type"),
    db.from("admin_activity_log").select("result"),
  ]);

  const contaPerCampo = (righe: { [k: string]: string | null }[] | null, campo: string) => {
    const m = new Map<string, number>();
    for (const r of righe ?? []) {
      const v = r[campo];
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([tipo, count]) => ({ tipo, count }))
      .sort((a, b) => b.count - a.count);
  };

  const perRisultatoMap = contaPerCampo(perRisultato.data, "result").map((item) => ({
    risultato: item.tipo,
    count: item.count,
  }));

  return {
    totale: totale.count ?? 0,
    perTipoOperazione: contaPerCampo(perTipo.data, "operation_type"),
    perRisorsa: contaPerCampo(perRisorsa.data, "target_type"),
    perRisultato: perRisultatoMap,
  };
}

/**
 * Tipi di operazione standardizzati.
 */
export const OPERATION_TYPES = {
  // Negozi
  NEGOZIO_CREATO: "negozio_creato",
  NEGOZIO_MODIFICATO: "negozio_modificato",
  NEGOZIO_CESTINATO: "negozio_cestinato",
  NEGOZIO_RIPRISTINATO: "negozio_ripristinato",
  NEGOZIO_ELIMINATO_DEFINITIVO: "negozio_eliminato_definitivo",

  // Prodotti
  PRODOTTO_CREATO: "prodotto_creato",
  PRODOTTO_MODIFICATO: "prodotto_modificato",
  PRODOTTO_ELIMINATO: "prodotto_eliminato",

  // Offerte
  OFFERTA_CREATA: "offerta_creata",
  OFFERTA_MODIFICATA: "offerta_modificata",
  OFFERTA_ELIMINATA: "offerta_eliminata",

  // Eventi
  EVENTO_CREATO: "evento_creato",
  EVENTO_MODIFICATO: "evento_modificato",
  EVENTO_ELIMINATO: "evento_eliminato",

  // Categorie
  CATEGORIA_CREATA: "categoria_creata",
  CATEGORIA_MODIFICATA: "categoria_modificata",
  CATEGORIA_ELIMINATA: "categoria_eliminata",

  // Impostazioni / Utenti / In Evidenza / Template
  IMPOSTAZIONI_MODIFICATE: "impostazioni_modificate",
  UTENTE_MODIFICATO: "utente_modificato",
  NEGOZIO_IN_EVIDENZA_MODIFICATO: "negozio_in_evidenza_modificato",
  TEMPLATE_CREATO: "template_creato",
  TEMPLATE_MODIFICATO: "template_modificato",
  TEMPLATE_ELIMINATO: "template_eliminato",

  // Segnalazioni
  SEGNALAZIONE_STATO_MODIFICATO: "segnalazione_stato_modificato",
  SEGNALAZIONE_PRIORITA_MODIFICATA: "segnalazione_priorita_modificata",
  SEGNALAZIONE_NOTA_MODIFICATA: "segnalazione_nota_modificata",
  SEGNALAZIONE_RISOLTA: "segnalazione_risolta",
  SEGNALAZIONE_ARCHIVIATA: "segnalazione_archiviata",
  SEGNALAZIONE_RIAPERTA: "segnalazione_riaperta",
} as const;

export const TARGET_TYPES = {
  NEGOZIO: "negozio",
  PRODOTTO: "prodotto",
  OFFERTA: "offerta",
  EVENTO: "evento",
  CATEGORIA: "categoria",
  UTENTE: "utente",
  IMPOSTAZIONI: "impostazioni",
  NEGOZIO_IN_EVIDENZA: "negozio_in_evidenza",
  TEMPLATE: "template",
  SEGNALAZIONE: "segnalazione",
} as const;