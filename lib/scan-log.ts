import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ScanLogEntry = {
  userId: string;
  negozioId?: string | null;
  provider: string;
  responseTimeMs: number;
  confidence?: number | null;
  cacheHit: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  imageHash?: string | null;
  modelUsed?: string | null;
  totalTokens?: number | null;
  status: "success" | "error" | "rate_limited";
};

export async function logScan(entry: ScanLogEntry): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();

    const payload = {
      user_id: entry.userId,
      negozio_id: entry.negozioId ?? null,
      provider: entry.provider,
      response_time_ms: entry.responseTimeMs,
      confidence: entry.confidence ?? null,
      cache_hit: entry.cacheHit,
      error_code: entry.errorCode ?? null,
      error_message: entry.errorMessage ?? null,
      image_hash: entry.imageHash ?? null,
      model_used: entry.modelUsed ?? null,
      total_tokens: entry.totalTokens ?? null,
      status: entry.status,
    };

    await supabase.from("scan_log").insert(payload as any);
  } catch (err) {
    console.error("[scan-log] Errore durante il logging:", err);
  }
}
