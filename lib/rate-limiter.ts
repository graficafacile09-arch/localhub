import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const DEFAULT_RATE_PER_MINUTE = 60;
const DEFAULT_RATE_PER_HOUR = 1000;

/** Provider riservato ai token del rate limiting, escluso dalle statistiche AI. */
export const RATE_LIMIT_PROVIDER = "__rate_limit__";

/** Limiti di default per l'endpoint ordini (checkout pubblico, per IP). */
const ORDINI_DEFAULT_PER_MINUTE = 6;
const ORDINI_DEFAULT_PER_HOUR = 40;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number; reason: string };

/**
 * Opzioni del rate limiter (lo stesso sistema per tutti gli endpoint).
 *
 * Per il soggetto `scan_log`, `checkRateLimit` consuma un token tramite la
 * RPC atomica DB-backed `consume_rate_limit`, usando `user_id` come chiave.
 * Per gli ordini resta attivo il conteggio storico su `ordini.cliente_ip`.
 */
export type RateLimitOptions = {
  /** Soggetto del conteggio: "scan_log" (default) o "ordini". */
  subject?: "scan_log" | "ordini";
  /** Colonna identificativa (usata per il soggetto "ordini"). */
  idColumn?: string;
  /** Colonna timestamp (usata per il soggetto "ordini"). */
  timeColumn?: string;
  /** Limiti specifici; se assenti si usano env/limiti del soggetto. */
  perMinute?: number;
  perHour?: number;
  /**
   * true → client admin (service role, ignora RLS): necessario per i
   * soggetti contati senza sessione utente (ordini pubblici per IP).
   */
  useAdminClient?: boolean;
  /** Etichetta nel messaggio di errore (default "scansioni"/"ordini"). */
  reasonLabel?: string;
  /** Usa il contatore atomico condiviso su scan_log invece del conteggio storico. */
  useSharedCounter?: boolean;
};

function getLimits(subject: "scan_log" | "ordini", options: RateLimitOptions) {
  const isOrdini = subject === "ordini";
  const envMin = isOrdini
    ? process.env.ORDINI_RATE_LIMIT_PER_MINUTE
    : process.env.RATE_LIMIT_PER_MINUTE;
  const envHour = isOrdini
    ? process.env.ORDINI_RATE_LIMIT_PER_HOUR
    : process.env.RATE_LIMIT_PER_HOUR;

  return {
    perMinute:
      options.perMinute ??
      (envMin
        ? Number(envMin)
        : isOrdini
          ? ORDINI_DEFAULT_PER_MINUTE
          : DEFAULT_RATE_PER_MINUTE),
    perHour:
      options.perHour ??
      (envHour
        ? Number(envHour)
        : isOrdini
          ? ORDINI_DEFAULT_PER_HOUR
          : DEFAULT_RATE_PER_HOUR),
  };
}

function resultFromRpc(data: unknown): RateLimitResult {
  const result = Array.isArray(data) ? data[0] : data;
  if (result && typeof result === "object" && "allowed" in result && result.allowed === false) {
    const row = result as {
      retry_after?: unknown;
      reason?: unknown;
    };
    return {
      allowed: false,
      retryAfter: Number(row.retry_after) || 60,
      reason: String(row.reason ?? "Limite di richieste superato."),
    };
  }

  return { allowed: true };
}

export async function checkRateLimit(
  userId: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const subject = options.subject ?? "scan_log";
  const { perMinute, perHour } = getLimits(subject, options);
  const label = options.reasonLabel ?? (subject === "ordini" ? "ordini" : "scansioni");

  if (perMinute <= 0 && perHour <= 0) {
    return { allowed: true };
  }

  // `scan_log` is consumed through a SECURITY DEFINER RPC. The service-role
  // client is required because public endpoints have no authenticated RLS
  // identity and because count + insert must be one database transaction.
  if (subject === "scan_log" && options.useSharedCounter) {
    try {
      const admin = createAdminSupabaseClient();
      const { data, error } = await admin.rpc("consume_rate_limit", {
        p_key: userId,
        p_per_minute: perMinute,
        p_per_hour: perHour,
        p_reason_label: label,
      });

      if (error) throw error;
      return resultFromRpc(data);
    } catch {
      // Fail-open: a counter outage must not block the endpoint.
      return { allowed: true };
    }
  }

  // The default `scan_log` path intentionally retains its historical
  // semantics for authenticated Vision: it counts real scan rows. Public
  // endpoints opt into the atomic shared counter explicitly above.
  try {
    const supabase = options.useAdminClient
      ? createAdminSupabaseClient()
      : await createServerSupabaseClient();
    const idColumn = options.idColumn ?? "user_id";
    const timeColumn = options.timeColumn ?? "created_at";
    const now = new Date();

    const oneMinuteAgo = new Date(now.getTime() - 60_000).toISOString();
    const oneHourAgo = new Date(now.getTime() - 3_600_000).toISOString();

    if (perMinute > 0) {
      const { count: minuteCount, error: minuteError } = await supabase
        .from(subject)
        .select("id", { head: true, count: "exact" })
        .eq(idColumn, userId)
        .gte(timeColumn, oneMinuteAgo);

      if (!minuteError && (minuteCount ?? 0) >= perMinute) {
        return {
          allowed: false,
          retryAfter: 60,
          reason: `Hai superato il limite di ${perMinute} ${label} al minuto. Riprova tra qualche minuto.`,
        };
      }
    }

    if (perHour > 0) {
      const { count: hourCount, error: hourError } = await supabase
        .from(subject)
        .select("id", { head: true, count: "exact" })
        .eq(idColumn, userId)
        .gte(timeColumn, oneHourAgo);

      if (!hourError && (hourCount ?? 0) >= perHour) {
        return {
          allowed: false,
          retryAfter: 3600,
          reason: `Hai superato il limite di ${perHour} ${label} all'ora. Riprova più tardi.`,
        };
      }
    }

    return { allowed: true };
  } catch {
    // Fail-open: se il controllo fallisce (es. client non disponibile),
    // non blocchiamo il checkout — il limite è una prima difesa, non un
    // punto di rottura.
    return { allowed: true };
  }
}
