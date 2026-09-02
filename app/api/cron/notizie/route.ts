import { timingSafeEqual } from "node:crypto";
import { apiError, apiOk } from "@/lib/api/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { eseguiImportNotizie } from "@/lib/notizie/import";

/**
 * POST /api/cron/notizie (chiamato anche via GET per semplicità Vercel Cron)
 *
 * Job di aggiornamento dell'aggregatore Notizie CV. Protetto da CRON_SECRET
 * (Authorization: Bearer <CRON_SECRET>, confronto a tempo costante).
 *
 * - Legge le fonti attive, rispetta frequenza_minuti, acquisisce, filtra
 *   Castrovillari, deduplica e inserisce le nuove notizie.
 * - `?dryRun=1`: NON scrive nel database (verifica sicura, nessun dato
 *   toccato) — utile per test manuali.
 * - Sempre JSON riepilogativo: { imported, skipped, errors, perFonte }.
 */
export async function GET(req: Request) {
  return esegui(req);
}

export async function POST(req: Request) {
  return esegui(req);
}

async function esegui(req: Request) {
  // 1. Autenticazione del job: Bearer CRON_SECRET, confronto sicuro.
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !token) {
    return apiError("UNAUTHORIZED", "CRON_SECRET mancante o header Authorization assente", 401);
  }
  const a = Buffer.from(secret);
  const b = Buffer.from(token);
  const valido =
    a.length === b.length && timingSafeEqual(a, b);

  if (!valido) {
    return apiError("UNAUTHORIZED", "CRON_SECRET non valido", 401);
  }

  // 2. Esecuzione dell'import.
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  let db;
  try {
    db = createAdminSupabaseClient();
  } catch (err) {
    return apiError("CONFIG_ERROR", (err as Error)?.message ?? "Supabase non configurato", 500);
  }

  const riepilogo = await eseguiImportNotizie({ db, dryRun, dettagli: dryRun });

  return apiOk(
    {
      ...riepilogo,
      dryRun,
      eseguitoIl: new Date().toISOString(),
    },
    200
  );
}