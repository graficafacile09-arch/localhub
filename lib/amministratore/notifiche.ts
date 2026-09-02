import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * NOTIFICHE AMMINISTRATORE — helper server-side.
 *
 * Inbox interna del back office: le notifiche sono generate dagli eventi
 * applicativi reali e lette SOLO via API guardate (requireApiArea("admin")).
 *
 * PRINCIPI:
 * - BEST-EFFORT: creaNotificaAdmin NON lancia MAI e NON può far fallire
 *   l'operazione principale che la chiama (stesso pattern dei canali
 *   ntfy/WhatsApp). Qualunque errore (DB assente, tabella non migrata,
 *   input non valido) viene solo loggato;
 * - niente dati sensibili nelle notifiche: nessun token, password, numero
 *   di telefono completo, dato di pagamento. I testi usano solo snapshot
 *   non sensibili (nomi, titoli, importi di esercizio);
 * - niente servizi esterni: nessun push/email/WhatsApp/ntfy;
 * - user_id resta NULLABLE (rivolta a tutti gli admin): l'admin autorizzato
 *   oggi è unico, la colonna è pronta per più amministratori futuri;
 * - href SOLO interno al back office (inizia con "/");
 * - la marcatura letta/archiviazione NON passa da admin_activity_log:
 *   resta esclusivamente una gestione dello stato dell'inbox.
 */

/** Tipi di notifica ammessi — allineati al CHECK della migration. */
export const TIPI_NOTIFICA_ADMIN = [
  "ordine_nuovo",
  "segnalazione_nuova",
  "venditore_registrato",
  "negozio_creato",
  "prodotto_creato",
  "offerta_creata",
  "evento_creato",
  "payout_da_erogare",
] as const;

export type TipoNotificaAdmin = (typeof TIPI_NOTIFICA_ADMIN)[number];

export function isTipoNotificaAdmin(value: unknown): value is TipoNotificaAdmin {
  return (
    typeof value === "string" &&
    (TIPI_NOTIFICA_ADMIN as readonly string[]).includes(value)
  );
}

/** Gravità ammesse — allineate al CHECK della migration. */
export const GRAVITA_NOTIFICA_ADMIN = ["info", "attenzione", "urgente"] as const;

export type GravitaNotificaAdmin = (typeof GRAVITA_NOTIFICA_ADMIN)[number];

export function isGravitaNotificaAdmin(value: unknown): value is GravitaNotificaAdmin {
  return (
    typeof value === "string" &&
    (GRAVITA_NOTIFICA_ADMIN as readonly string[]).includes(value)
  );
}

export type AdminNotificaRiga = {
  id: string;
  user_id: string | null;
  tipo: TipoNotificaAdmin;
  titolo: string;
  corpo: string;
  gravita: GravitaNotificaAdmin;
  href: string | null;
  letta_at: string | null;
  archiviata_at: string | null;
  created_at: string;
};

export type InputNotificaAdmin = {
  tipo: TipoNotificaAdmin;
  titolo: string;
  corpo: string;
  gravita: GravitaNotificaAdmin;
  /** Solo link INTERNI al back office (iniziano con "/"). */
  href?: string | null;
  /** NULL = rivolta a tutti gli admin (destinatario di default). */
  user_id?: string | null;
};

const DB_NON_DISPONIBILE = "Database non disponibile.";

function getDb() {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

function assumiRiga(riga: Record<string, unknown>): AdminNotificaRiga {
  return {
    id: String(riga.id),
    user_id: (riga.user_id as string | null) ?? null,
    tipo: (isTipoNotificaAdmin(riga.tipo) ? riga.tipo : "ordine_nuovo"),
    titolo: String(riga.titolo ?? ""),
    corpo: String(riga.corpo ?? ""),
    gravita: isGravitaNotificaAdmin(riga.gravita) ? riga.gravita : "info",
    href: (riga.href as string | null) ?? null,
    letta_at: (riga.letta_at as string | null) ?? null,
    archiviata_at: (riga.archiviata_at as string | null) ?? null,
    created_at: String(riga.created_at ?? new Date().toISOString()),
  };
}

/**
 * Crea una notifica amministrativa (BEST-EFFORT).
 *
 * Ritorna sempre boolean senza lanciare mai: un errore qui non deve MAI
 * propagarsi all'operazione principale (ordine, segnalazione, …).
 */
export async function creaNotificaAdmin(
  input: InputNotificaAdmin
): Promise<boolean> {
  try {
    if (!input || typeof input !== "object") return false;
    if (!isTipoNotificaAdmin(input.tipo)) return false;
    if (!isGravitaNotificaAdmin(input.gravita)) return false;

    const titolo = String(input.titolo ?? "").trim();
    const corpo = String(input.corpo ?? "").trim();
    if (!titolo || !corpo) return false;

    // Solo link interni al back office: mai URL esterni.
    let href: string | null = null;
    if (input.href !== undefined && input.href !== null) {
      const candidato = String(input.href).trim();
      if (candidato.startsWith("/")) href = candidato;
    }

    const user_id = input.user_id ?? null;

    const db = getDb();
    if (!db) {
      console.warn("[notifiche-admin] creazione saltata:", DB_NON_DISPONIBILE);
      return false;
    }

    const { error } = await db.from("admin_notifiche").insert({
      user_id,
      tipo: input.tipo,
      titolo,
      corpo,
      gravita: input.gravita,
      href,
    });

    if (error) {
      console.error("[notifiche-admin] creazione fallita:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      "[notifiche-admin] creazione fallita:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/**
 * Conteggio notifiche NON lette per l'admin (badge sidebar).
 * Server-side, best-effort: in caso di errore ritorna 0 (nessun badge).
 */
export async function contaNotificheAdminNonLette(): Promise<number> {
  try {
    const db = getDb();
    if (!db) return 0;
    const { count, error } = await db
      .from("admin_notifiche")
      .select("id", { head: true, count: "exact" })
      .is("letta_at", null)
      .is("archiviata_at", null);
    if (error) {
      console.error("[notifiche-admin] conteggio fallito:", error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error(
      "[notifiche-admin] conteggio fallito:",
      err instanceof Error ? err.message : String(err)
    );
    return 0;
  }
}

export type FiltriNotificheAdmin = {
  nonLette?: boolean;
  gravita?: GravitaNotificaAdmin;
  tipo?: TipoNotificaAdmin;
  page?: number;
  pageSize?: number;
};

export type RisultatoListaNotifiche = {
  notifiche: AdminNotificaRiga[];
  totale: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

/**
 * Elenco notifiche per il pannello admin (escluse le archiviate, ordinate
 * dalle più recenti). Best-effort: errori → lista vuota, conteggi 0.
 */
export async function getNotificheAdmin(
  filtri: FiltriNotificheAdmin = {}
): Promise<RisultatoListaNotifiche> {
  const page = Math.max(1, filtri.page ?? 1);
  const pageSize = Math.min(Math.max(1, filtri.pageSize ?? 20), 100);
  const offset = (page - 1) * pageSize;

  try {
    const db = getDb();
    if (!db) {
      return { notifiche: [], totale: 0, unreadCount: 0, page, pageSize, hasMore: false };
    }

    let query = db
      .from("admin_notifiche")
      .select("id", { count: "exact" })
      .is("archiviata_at", null);

    if (filtri.nonLette) query = query.is("letta_at", null);
    if (filtri.gravita) query = query.eq("gravita", filtri.gravita);
    if (filtri.tipo) query = query.eq("tipo", filtri.tipo);

    const { data: righeId, count: totale, error: errConteggio } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (errConteggio) {
      console.error("[notifiche-admin] elenco fallito:", errConteggio.message);
      return { notifiche: [], totale: 0, unreadCount: 0, page, pageSize, hasMore: false };
    }

    const ids = (righeId ?? []).map((r) => String((r as Record<string, unknown>).id));
    let notifiche: AdminNotificaRiga[] = [];
    if (ids.length > 0) {
      const { data, error } = await db
        .from("admin_notifiche")
        .select("*")
        .in("id", ids);
      if (!error && data) {
        notifiche = (data as Record<string, unknown>[])
          .map((riga) => assumiRiga(riga))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
      } else if (error) {
        console.error("[notifiche-admin] dettagli elenco falliti:", error.message);
      }
    }

    const nonLette = await contaNotificheAdminNonLette();

    return {
      notifiche,
      totale: totale ?? 0,
      unreadCount: nonLette,
      page,
      pageSize,
      hasMore: offset + ids.length < (totale ?? 0),
    };
  } catch (err) {
    console.error(
      "[notifiche-admin] elenco fallito:",
      err instanceof Error ? err.message : String(err)
    );
    return { notifiche: [], totale: 0, unreadCount: 0, page, pageSize, hasMore: false };
  }
}

/**
 * Notifica "NUOVO ORDINE CONFERMATO" all'admin.
 *
 * Punto unico per ordini confermati/pagati: snapshot minimo letti dal DB
 * (numero, negozio_nome, totale — nessun dato sensibile). Chiamata dagli
 * stessi punti dove WhatsApp/ntfy/email già confermano l'ordine, quindi
 * l'anti-duplicazione è già garantita a monte (idempotenza ordini +
 * pagamenti_eventi UNIQUE): si ereditano quelle guardie senza aggiungere
 * meccanismi nuovi.
 */
export async function notificaNuovoOrdineAdmin(ordineId: string): Promise<void> {
  try {
    if (!ordineId) return;
    const db = getDb();
    if (!db) return;

    const { data: ordine, error } = (await db
      .from("ordini")
      .select("numero, totale, negozio_nome")
      .eq("id", ordineId)
      .maybeSingle()) as {
      data: { numero: string; totale: number; negozio_nome: string } | null;
      error: { message: string } | null;
    };

    if (error || !ordine) {
      if (error) console.error("[notifiche-admin] lettura ordine fallita:", error.message);
      return;
    }

    const numero = String(ordine.numero ?? ordineId);
    const totale = Number(ordine.totale ?? 0).toFixed(2).replace(".", ",");
    const negozio = String(ordine.negozio_nome ?? "negozio");

    await creaNotificaAdmin({
      tipo: "ordine_nuovo",
      titolo: "Nuovo ordine ricevuto",
      corpo: `Ordine ${numero} — ${negozio} · Totale € ${totale}`,
      gravita: "info",
      href: `/amministratore/ordini/${ordineId}`,
    });
  } catch (err) {
    console.error(
      "[notifiche-admin] notifica ordine fallita:",
      err instanceof Error ? err.message : String(err)
    );
  }
}