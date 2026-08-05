import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Monitoraggio GLOBALE delle scansioni AI (scan_log di piattaforma).
 * Riservato alla sessione admin (email autorizzata + ruolo admin).
 */
export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const oneHourAgo = new Date(now.getTime() - 3_600_000).toISOString();

  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  ).toISOString();

  try {
    const [
      scansioniOggi,
      scansioniUltimaOra,
      cacheHitOggi,
      distribuzioneProvider,
      erroriOggi,
      scansioniRecenti,
    ] = await Promise.all([
      supabase
        .from("scan_log")
        .select("id", { head: true, count: "exact" })
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd),

      supabase
        .from("scan_log")
        .select("id", { head: true, count: "exact" })
        .gte("created_at", oneHourAgo),

      supabase
        .from("scan_log")
        .select("id", { head: true, count: "exact" })
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd)
        .eq("cache_hit", true),

      supabase
        .from("scan_log")
        .select("provider, response_time_ms, confidence, cache_hit, status, created_at")
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd)
        .order("created_at", { ascending: false }),

      supabase
        .from("scan_log")
        .select("id", { head: true, count: "exact" })
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd)
        .neq("status", "success"),

      supabase
        .from("scan_log")
        .select("id, provider, response_time_ms, confidence, cache_hit, status, error_code, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const tuttiOggi = distribuzioneProvider.data ?? [];
    const totaleOggi = scansioniOggi.count ?? 0;
    const cacheHitCount = cacheHitOggi.count ?? 0;
    const errorCount = erroriOggi.count ?? 0;
    const ultimaOra = scansioniUltimaOra.count ?? 0;

    const providerMap = new Map<string, number>();
    let sommaTempi = 0;
    let conteggioTempi = 0;

    for (const row of tuttiOggi) {
      const p = (row.provider as string) || "unknown";
      providerMap.set(p, (providerMap.get(p) ?? 0) + 1);
      if (row.response_time_ms && row.status === "success") {
        sommaTempi += row.response_time_ms as number;
        conteggioTempi++;
      }
    }

    const providerDistribuzione = Array.from(providerMap.entries())
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count);

    const tempoMedio = conteggioTempi > 0 ? Math.round(sommaTempi / conteggioTempi) : 0;

    const recenti = (scansioniRecenti.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        provider: r.provider as string,
        responseTimeMs: r.response_time_ms as number,
        confidence: r.confidence as number | null,
        cacheHit: r.cache_hit as boolean,
        status: r.status as string,
        errorCode: r.error_code as string | null,
        createdAt: r.created_at as string,
      };
    });

    return apiOk({
      oggi: {
        totale: totaleOggi,
        cacheHit: cacheHitCount,
        cacheHitPercent: totaleOggi > 0 ? Math.round((cacheHitCount / totaleOggi) * 100) : 0,
        errori: errorCount,
        errorPercent: totaleOggi > 0 ? Math.round((errorCount / totaleOggi) * 100) : 0,
        tempoMedio: tempoMedio,
        ultimaOra,
        distribuzioneProvider: providerDistribuzione,
      },
      recenti,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return apiError("STATS_ERROR", message, 500);
  }
}
