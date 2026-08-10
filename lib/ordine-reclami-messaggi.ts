/**
 * RECLAMI ORDINE — COMUNICAZIONI (dialogo venditore ↔ cliente).
 *
 * Il venditore può contattare il cliente su un reclamo e il cliente può
 * rispondere: i messaggi sono IMMUTABILI e salvati nel DB
 * (tabella `reclamo_comunicazioni`, migrazione 20260817) — fonte di verità.
 *
 * SICUREZZA (tutta server-side, mai fidarsi del browser):
 *   - CLIENTE → la RPC `aggiungi_messaggio_reclamo_cliente` verifica che il
 *     reclamo appartenga all'utente della SESSIONE (cliente_user_id) e che
 *     non sia chiuso;
 *   - VENDITORE → ownership pre-verificata in TS (canManageStore) e
 *     ri-verificata ATOMICAMENTE dalla RPC `aggiungi_messaggio_reclamo_venditore`
 *     (negozi.owner_user_id o admin autorizzato);
 *   - LETTURE: filtri espliciti su identità/negozio + RLS come rete di
 *     sicurezza (mai elenchi non protetti).
 *
 * NOTIFICHE BEST-EFFORT (mai bloccano il salvataggio del messaggio):
 *   - risposta del CLIENTE → ntfy al VENDITORE (topic NTFY_ORDERS_TOPIC);
 *   - messaggio del VENDITORE → email al CLIENTE via Resend (riusa
 *     l'infrastruttura esistente, best-effort con skip silenziosi).
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { inviaMessaggioNtfy, type ConfigNtfy } from "@/lib/notifiche/ntfy";
import { canManageStore } from "@/lib/merchant/data";
import {
  inviaEmailMessaggioReclamo,
  inviaEmailRispostaClienteReclamo,
} from "@/lib/cliente/ordine-email";
import { getReclamiOrdineCliente, type ReclamiDbClient } from "@/lib/ordine-reclami";

// ═══════════════════════════════════════════════════════════════════════
// TIPI E HELPERS PURI
// ═══════════════════════════════════════════════════════════════════════

export type MittenteMessaggio = "cliente" | "venditore";

export type MessaggioReclamo = {
  id: string;
  reclamoId: string;
  mittente: MittenteMessaggio;
  mittenteNome: string;
  corpo: string;
  lettoAt: string | null;
  createdAt: string;
};

export function isMittenteMessaggio(value: unknown): value is MittenteMessaggio {
  return value === "cliente" || value === "venditore";
}

/** Normalizza e valida il corpo di un messaggio (null se non valido). */
export function validaCorpoMessaggio(
  corpo: unknown,
  max = 2000
): string | null {
  if (typeof corpo !== "string") return null;
  const normalizzato = corpo.trim().slice(0, max);
  return normalizzato.length > 0 ? normalizzato : null;
}

function mappaMessaggio(row: Record<string, unknown>): MessaggioReclamo {
  const mittente = isMittenteMessaggio(row.mittente) ? row.mittente : "cliente";
  // Chiavi SNAKE_CASE (righe grezze del SELECT * usato dalle GET) oppure
  // CAMEL_CASE (jsonb restituito dalle RPC): entrambi gli stili supportati.
  return {
    id: String(row.id ?? ""),
    reclamoId: String(row.reclamo_id ?? row.reclamoId ?? ""),
    mittente,
    mittenteNome: String(row.mittente_nome ?? row.mittenteNome ?? ""),
    corpo: String(row.corpo ?? ""),
    lettoAt:
      ((row.letto_at as string | null) ?? (row.lettoAt as string | null) ?? null),
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
  };
}

/** Esito delle operazioni di scrittura. */
export type EsitoMessaggio =
  | { ok: true; messaggio: MessaggioReclamo }
  | { ok: false; codice: string; messaggio: string; status: number };

const STATUS_DA_CODICE: Record<string, number> = {
  VALIDATION_ERROR: 422,
  RECLAMO_NON_TROVATO: 404,
  FORBIDDEN: 403,
  RECLAMO_CHIUSO: 409,
  SAVE_FAILED: 500,
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.incitta.online";

// ═══════════════════════════════════════════════════════════════════════
// SCRITTURA
// ═══════════════════════════════════════════════════════════════════════

/** Opzioni testabili (RPC, ownership, fetch per ntfy, email iniettabile). */
export type OpzioniMessaggioVenditore = {
  rpc?: (
    fn: string,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  puòGestire?: boolean;
  inviaEmail?: (
    reclamoId: string,
    corpo: string,
    mittenteNome?: string
  ) => Promise<{ stato: string; motivo: string }>;
};

/**
 * Il VENDITORE scrive un messaggio sul reclamo di un suo negozio.
 * Ownership in TS (canManageStore) + RPC atomica. Dopo il salvataggio
 * l'email al cliente è BEST-EFFORT (mai un fallimento per l'email).
 */
export async function aggiungiMessaggioVenditore(
  userId: string,
  negozioId: string,
  reclamoId: string,
  corpo: unknown,
  opts: OpzioniMessaggioVenditore = {}
): Promise<EsitoMessaggio> {
  const testo = validaCorpoMessaggio(corpo);
  if (!testo) {
    return { ok: false, codice: "VALIDATION_ERROR", messaggio: "Messaggio non valido (max 2000 caratteri).", status: 422 };
  }

  const puòGestire =
    opts.puòGestire !== undefined ? opts.puòGestire : await canManageStore(userId, negozioId);
  if (!puòGestire) {
    return { ok: false, codice: "FORBIDDEN", messaggio: "Non puoi gestire reclami di questo negozio.", status: 403 };
  }

  const chiamaRpc =
    opts.rpc ??
    ((fn: string, params: Record<string, unknown>) =>
      (createAdminSupabaseClient() as any).rpc(fn, params));
  const { data, error } = await chiamaRpc("aggiungi_messaggio_reclamo_venditore", {
    p_reclamo_id: reclamoId,
    p_merchant_user_id: userId,
    p_corpo: testo,
  });

  if (error) {
    console.error("[reclami-messaggi] RPC venditore fallita:", error.message);
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Impossibile salvare il messaggio.", status: 500 };
  }

  const esito = data as unknown as {
    ok?: boolean;
    messaggio?: Record<string, unknown> | string;
    codice?: string;
  };

  if (!esito || esito.ok !== true) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      messaggio:
        typeof esito?.messaggio === "string"
          ? esito.messaggio
          : "Impossibile salvare il messaggio.",
      status: STATUS_DA_CODICE[codice] ?? 500,
    };
  }

  const messaggio = mappaMessaggio((esito.messaggio ?? {}) as Record<string, unknown>);

  // Email al cliente — BEST-EFFORT: MAI throw, MAI blocca il messaggio.
  try {
    await (opts.inviaEmail ?? inviaEmailMessaggioReclamo)(
      reclamoId,
      messaggio.corpo,
      messaggio.mittenteNome
    );
  } catch (err) {
    console.error(
      `[reclami-messaggi] reclamo ${reclamoId}: email fallita (best-effort): ${(err as Error)?.message ?? "sconosciuto"}`
    );
  }

  return { ok: true, messaggio };
}

/** Opzioni testabili (RPC, db per la notifica, fetch per ntfy, email). */
export type OpzioniMessaggioCliente = {
  rpc?: (
    fn: string,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  db?: ReclamiDbClient;
  fetchImpl?: typeof fetch;
  inviaEmailRisposta?: (
    reclamoId: string,
    corpo: string,
    clienteNome?: string
  ) => Promise<{ stato: string; motivo: string }>;
};

/**
 * Il CLIENTE risponde su un reclamo PROPRIO (RPC atomica). Dopo il
 * salvataggio viene inviata una notifica ntfy al venditore in BEST-EFFORT.
 */
export async function aggiungiMessaggioCliente(
  userId: string,
  reclamoId: string,
  corpo: unknown,
  opts: OpzioniMessaggioCliente = {}
): Promise<EsitoMessaggio> {
  const testo = validaCorpoMessaggio(corpo);
  if (!testo) {
    return { ok: false, codice: "VALIDATION_ERROR", messaggio: "Messaggio non valido (max 2000 caratteri).", status: 422 };
  }

  const chiamaRpc =
    opts.rpc ??
    ((fn: string, params: Record<string, unknown>) =>
      (createAdminSupabaseClient() as any).rpc(fn, params));
  const { data, error } = await chiamaRpc("aggiungi_messaggio_reclamo_cliente", {
    p_reclamo_id: reclamoId,
    p_cliente_user_id: userId,
    p_corpo: testo,
  });

  if (error) {
    console.error("[reclami-messaggi] RPC cliente fallita:", error.message);
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Impossibile salvare il messaggio.", status: 500 };
  }

  const esito = data as unknown as {
    ok?: boolean;
    messaggio?: Record<string, unknown> | string;
    codice?: string;
  };

  if (!esito || esito.ok !== true) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      messaggio:
        typeof esito?.messaggio === "string"
          ? esito.messaggio
          : "Impossibile salvare il messaggio.",
      status: STATUS_DA_CODICE[codice] ?? 500,
    };
  }

  const messaggio = mappaMessaggio((esito.messaggio ?? {}) as Record<string, unknown>);

  // ntfy al VENDITORE — BEST-EFFORT (il messaggio DB è la fonte di verità).
  await notificaRispostaClienteNtfy(messaggio, opts).catch(() => {});

  // EMAIL al VENDITORE — BEST-EFFORT: MAI throw, MAI blocca il messaggio.
  // Destinatario: owner del negozio (auth.users, fallback email_negozio).
  try {
    await (opts.inviaEmailRisposta ?? inviaEmailRispostaClienteReclamo)(
      reclamoId,
      messaggio.corpo,
      messaggio.mittenteNome
    );
  } catch (err) {
    console.error(
      `[reclami-messaggi] reclamo ${reclamoId}: email risposta cliente fallita (best-effort): ${(err as Error)?.message ?? "sconosciuto"}`
    );
  }

  return { ok: true, messaggio };
}

// ═══════════════════════════════════════════════════════════════════════
// LETTURE (ownership sempre verificata server-side)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Comunicazioni di un reclamo per il CLIENTE. Prima verifica che il reclamo
 * appartenga all'ordine dell'utente (getReclamiOrdineCliente), poi legge i
 * messaggi. Mai leak: nessun messaggio se non è un reclamo proprio.
 */
export async function getMessaggiReclamoCliente(
  userId: string,
  ordineId: string,
  reclamoId: string,
  client?: ReclamiDbClient
): Promise<MessaggioReclamo[]> {
  const db = (client ?? (await createServerSupabaseClient())) as ReclamiDbClient;

  const reclami = await getReclamiOrdineCliente(userId, ordineId, db);
  if (!reclami.some((r) => r.id === reclamoId)) return [];

  const { data, error } = await db
    .from("reclamo_comunicazioni")
    .select("*")
    .eq("reclamo_id", reclamoId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[reclami-messaggi] lettura cliente fallita:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => mappaMessaggio(r));
}

/** Opzioni testabili (ownership pre-valutata). */
export type OpzioniMessaggiVenditore = {
  client?: ReclamiDbClient;
  puòGestire?: boolean;
};

/**
 * Comunicazioni di un reclamo per il VENDITORE (ownership server-side).
 * Verifica che il reclamo appartenga al negozio indicato, poi legge i
 * messaggi. Un venditore non vede mai messaggi di altri negozi.
 */
export async function getMessaggiReclamoVenditore(
  userId: string,
  negozioId: string,
  reclamoId: string,
  opts: OpzioniMessaggiVenditore = {}
): Promise<MessaggioReclamo[]> {
  const puòGestire =
    opts.puòGestire !== undefined ? opts.puòGestire : await canManageStore(userId, negozioId);
  if (!puòGestire) return [];

  const db = (opts.client ?? (await createServerSupabaseClient())) as ReclamiDbClient;

  // Il reclamo deve appartenere a QUESTO negozio (mai fidarsi dell'id).
  const { data: reclamo } = await db
    .from("ordine_reclami")
    .select("id")
    .eq("id", reclamoId)
    .eq("negozio_id", negozioId)
    .maybeSingle();

  if (!reclamo) return [];

  const { data, error } = await db
    .from("reclamo_comunicazioni")
    .select("*")
    .eq("reclamo_id", reclamoId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[reclami-messaggi] lettura venditore fallita:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => mappaMessaggio(r));
}

// ═══════════════════════════════════════════════════════════════════════
// NOTIFICA ntfy — risposta del cliente (BEST-EFFORT)
// ═══════════════════════════════════════════════════════════════════════

/** Opzioni di notifica (db e fetch per i test). */
export type OpzioniNotificaRisposta = {
  db?: ReclamiDbClient;
  fetchImpl?: typeof fetch;
};

/** Formatta "GG/MM/AAAA HH:MM" (fuso Europe/Rome). */
function formattaDataBreve(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/Rome",
    }).format(d);
  } catch {
    return iso;
  }
}

/**
 * ntfy al VENDITORE quando il cliente risponde a un reclamo.
 * BEST-EFFORT: MAI throw (il messaggio DB è la fonte di verità). Usa il
 * topic ordini esistente (NTFY_ORDERS_TOPIC), MAI topic casuali nuovi.
 * Dati letti dal DB lato server (numero ordine LEGGIBILE, mai UUID).
 */
export async function notificaRispostaClienteNtfy(
  messaggio: MessaggioReclamo,
  opts: OpzioniNotificaRisposta = {}
): Promise<void> {
  try {
    const db = (opts.db ?? createAdminSupabaseClient()) as ReclamiDbClient;
    const { data: reclamo } = await db
      .from("ordine_reclami")
      .select("ordine_id, negozio_id")
      .eq("id", messaggio.reclamoId)
      .maybeSingle();

    if (!reclamo) return;

    const ordineId = String(reclamo.ordine_id ?? "");
    const negozioId = String(reclamo.negozio_id ?? "");
    const { data: ordine } = await db
      .from("ordini")
      .select("numero, negozio_nome")
      .eq("id", ordineId)
      .maybeSingle();

    const numero = String(ordine?.numero ?? "");
    const negozioNome = String(ordine?.negozio_nome ?? "");

    const link =
      negozioId && ordineId
        ? `${SITE_URL.replace(/\/+$/, "")}/merchant/${encodeURIComponent(negozioId)}/ordini/${encodeURIComponent(ordineId)}`
        : null;

    const righe: string[] = [];
    righe.push(`💬 RISPOSTA DEL CLIENTE — Reclamo #${numero || "—"}`);
    righe.push("");
    righe.push(`🏪 Negozio: ${negozioNome || "—"}`);
    righe.push(`👤 Cliente: ${messaggio.mittenteNome || "—"}`);
    righe.push(`📝 Risposta: ${messaggio.corpo || "—"}`);
    righe.push(`📅 Data: ${formattaDataBreve(messaggio.createdAt) || "—"}`);
    if (link) {
      righe.push("");
      righe.push("🔗 Apri reclamo:");
      righe.push(link);
    }

    const configVenditore: ConfigNtfy = {
      enabled: process.env.NTFY_ENABLED !== "false",
      serverUrl: process.env.NTFY_SERVER_URL ?? "https://ntfy.sh",
      topic: process.env.NTFY_ORDERS_TOPIC ?? "",
    };
    await inviaMessaggioNtfy(
      configVenditore,
      {
        titolo: `Risposta cliente — reclamo #${numero || ""}`.trim(),
        tags: "speech_balloon",
        priorita: "default",
        corpo: righe.join("\n"),
      },
      `reclamo ${messaggio.reclamoId.slice(0, 8)} risposta`,
      opts.fetchImpl
    );
  } catch (err) {
    console.error(
      `[reclami-messaggi] reclamo ${messaggio.reclamoId}: notifica risposta fallita (best-effort): ${(err as Error)?.message ?? "sconosciuto"}`
    );
  }
}
