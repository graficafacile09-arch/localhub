import { timingSafeEqual } from "node:crypto";
import { apiError, apiOk } from "@/lib/api/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { raccogliConoscenza } from "@/lib/conoscenza/raccolta";
import {
  leggiTutteLePagine,
  pianificaAggiornamento,
  type VoceArchiviata,
} from "@/lib/conoscenza/sincronizzazione";

/**
 * POST /api/cron/conoscenza (anche GET).
 *
 * Aggiorna l'archivio `pino_conoscenza` con scansione completa delle fonti.
 * NON è registrato in vercel.json: il cron va attivato solo dopo verifica
 * del piano Vercel. Protetto da CRON_SECRET (Bearer, confronto costante).
 * Errori di scansione non producono cancellazioni (vedi pianificaAggiornamento).
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  return esegui(req);
}

export async function POST(req: Request) {
  return esegui(req);
}

async function esegui(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret) {
    console.error("[cron-conoscenza] CRON_SECRET non impostato: scansione annullata. Imposta la variabile su Vercel.");
  }
  if (!secret || !token) {
    return apiError("UNAUTHORIZED", "CRON_SECRET mancante o header Authorization assente", 401);
  }
  const a = Buffer.from(secret);
  const b = Buffer.from(token);
  if (!(a.length === b.length && timingSafeEqual(a, b))) {
    return apiError("UNAUTHORIZED", "CRON_SECRET non valido", 401);
  }

  let db;
  try {
    db = createAdminSupabaseClient();
  } catch (err) {
    return apiError("CONFIG_ERROR", (err as Error)?.message ?? "Supabase non configurato", 500);
  }

  const esito = await raccogliConoscenza();

  let archiviate: VoceArchiviata[];
  try {
    archiviate = await leggiTutteLePagine<VoceArchiviata>(async (da, a) => {
      const { data, error, count } = await db
        .from("pino_conoscenza")
        .select("chiave, hash, stato", { count: "exact" })
        .order("chiave", { ascending: true })
        .range(da, a);
      if (error) return { righe: [], totale: null, errore: error.message };
      const righe = (data ?? []).map((r) => ({
        chiave: r.chiave as string,
        hash: r.hash as string,
        stato: r.stato as "attivo" | "rimosso",
      }));
      return { righe, totale: count ?? null };
    }, 1000);
  } catch (err) {
    // Archivio letto solo in parte: nessuna scrittura né rimozione.
    return apiOk(
      { aggiornato: false, motivo: (err as Error).message, eseguitoIl: new Date().toISOString() },
      200
    );
  }

  const piano = pianificaAggiornamento(esito, archiviate);
  if (!piano.sicuro) {
    return apiOk({ aggiornato: false, motivo: piano.motivoBlocco, eseguitoIl: new Date().toISOString() }, 200);
  }

  const ora = new Date().toISOString();
  const scritture = piano.daScrivere.map((v) => ({
    chiave: v.chiave,
    sezione: v.sezione,
    fonte_url: v.percorso,
    titolo: v.titolo,
    contenuto: v.testo,
    hash: v.hash,
    stato: "attivo",
    visto_il: ora,
    aggiornato_il: ora,
  }));
  if (scritture.length > 0) {
    const { error } = await db.from("pino_conoscenza").upsert(scritture, { onConflict: "chiave" });
    if (error) return apiError("DB_ERROR", error.message, 500);
  }

  const tutte = [...piano.daRimuovere];
  if (tutte.length > 0) {
    const { error } = await db
      .from("pino_conoscenza")
      .update({ stato: "rimosso", aggiornato_il: ora })
      .in("chiave", tutte);
    if (error) return apiError("DB_ERROR", error.message, 500);
  }

  // Le voci presenti nella scansione restano/tornano visibili con visto_il aggiornato.
  return apiOk(
    {
      aggiornato: true,
      scritte: scritture.length,
      rimosseLogicamente: piano.daRimuovere.length,
      riattivate: piano.daRiattivare.length,
      eseguitoIl: ora,
    },
    200
  );
}
