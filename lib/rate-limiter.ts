import { createServerSupabaseClient } from "@/lib/supabase/server";

const DEFAULT_RATE_PER_MINUTE = 60;
const DEFAULT_RATE_PER_HOUR = 1000;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number; reason: string };

function getLimits(): { perMinute: number; perHour: number } {
  const envMin = process.env.RATE_LIMIT_PER_MINUTE;
  const envHour = process.env.RATE_LIMIT_PER_HOUR;

  return {
    perMinute: envMin ? Number(envMin) : DEFAULT_RATE_PER_MINUTE,
    perHour: envHour ? Number(envHour) : DEFAULT_RATE_PER_HOUR,
  };
}

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const { perMinute, perHour } = getLimits();

  if (perMinute <= 0 && perHour <= 0) {
    return { allowed: true };
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date();

  const oneMinuteAgo = new Date(now.getTime() - 60_000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 3_600_000).toISOString();

  if (perMinute > 0) {
    const { count: minuteCount, error: minuteError } = await supabase
      .from("scan_log")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .gte("created_at", oneMinuteAgo);

    if (!minuteError && (minuteCount ?? 0) >= perMinute) {
      return {
        allowed: false,
        retryAfter: 60,
        reason: `Hai superato il limite di ${perMinute} scansioni al minuto.`,
      };
    }
  }

  if (perHour > 0) {
    const { count: hourCount, error: hourError } = await supabase
      .from("scan_log")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo);

    if (!hourError && (hourCount ?? 0) >= perHour) {
      return {
        allowed: false,
        retryAfter: 3600,
        reason: `Hai superato il limite di ${perHour} scansioni all'ora.`,
      };
    }
  }

  return { allowed: true };
}
