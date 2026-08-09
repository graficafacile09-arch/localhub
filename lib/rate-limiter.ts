import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const DEFAULT_RATE_PER_MINUTE = 60;
const DEFAULT_RATE_PER_HOUR = 1000;

/** Limiti di default per l'endpoint ordini (checkout pubblico, per IP). */
const ORDINI_DEFAULT_PER_MINUTE = 6;
const ORDINI_DEFAULT_PER_HOUR = 40;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number; reason: string };

/**
 * Opzioni del rate limiter (lo stesso sistema per tutti gli endpoint).
 *
 * Di default conta le righe di `scan_log` per `user_id` (comportamento
 * storico del pannello Vision). Per gli ordini si passa il soggetto
 * "ordini": il conteggio avviene sulla tabella ordini per IP
 * (colonna cliente_ip) usando il client admin (il checkout è pubblico,
 * non c'è una sessione utente da usare per RLS).
 */
export type RateLimitOptions = {
  /** Soggetto del conteggio: "scan_log" (Vision, default) o "ordini". */
  subject?: "scan_log" | "ordini";
  /** Colonna identificativa (default "user_id"; per ordini "cliente_ip"). */
  idColumn?: string;
  /** Colonna timestamp (default "created_at"). */
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
    perMinute: options.perMinute ?? (envMin ? Number(envMin) : isOrdini ? ORDINI_DEFAULT_PER_MINUTE : DEFAULT_RATE_PER_MINUTE),
    perHour: options.perHour ?? (envHour ? Number(envHour) : isOrdini ? ORDINI_DEFAULT_PER_HOUR : DEFAULT_RATE_PER_HOUR),
  };
}

export async function checkRateLimit(
  userId: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const subject = options.subject ?? "scan_log";
  const idColumn = options.idColumn ?? "user_id";
  const timeColumn = options.timeColumn ?? "created_at";
  const { perMinute, perHour } = getLimits(subject, options);
  const label = options.reasonLabel ?? (subject === "ordini" ? "ordini" : "scansioni");

  if (perMinute <= 0 && perHour <= 0) {
    return { allowed: true };
  }

  try {
    const supabase = options.useAdminClient
      ? createAdminSupabaseClient()
      : await createServerSupabaseClient();
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
