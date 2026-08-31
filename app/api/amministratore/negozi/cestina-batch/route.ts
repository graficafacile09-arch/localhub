import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { cestinaNegoziAdmin } from "@/lib/amministratore/negozi";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BATCH = 100;

/**
 * POST /api/amministratore/negozi/cestina-batch
 *
 * Eliminazione MULTIPLA (soft delete) di negozi verso il Cestino — riservata
 * alla sessione admin (requireApiArea PRIMA di qualunque scrittura).
 *
 * Body: { "negozioIds": ["uuid1", "uuid2", ...] }
 *
 * Usa la STESSA logica del cestinamento singolo (cestinaNegoziAdmin → riusa
 * cestinaNegozio): imposta deleted_at/deleted_by, NON modifica altri dati del
 * negozio, NON cancella fisicamente. Esclude i negozi già nel Cestino e
 * restituisce un esito chiaro con conteggio successi/errori.
 */
export async function POST(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  let body: { negozioIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  const raw = Array.isArray(body?.negozioIds) ? body.negozioIds : [];
  if (raw.length === 0) {
    return apiError("VALIDATION_ERROR", "Nessun negozio selezionato.", 422);
  }
  if (raw.length > MAX_BATCH) {
    return apiError("VALIDATION_ERROR", `Seleziona al massimo ${MAX_BATCH} negozi.`, 422);
  }

  // Validazione UUID: gli id malformati non vanno MAI al DB (conteggiati
  // come errori, mai un fallimento silenzioso).
  const valido = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
  const validi = raw.filter(valido);
  const nonValidi = raw.filter((v) => !valido(v));

  // Info per il log attività (nome negozio) prima del cestinamento.
  const db = createAdminSupabaseClient();
  const { data: negozi } = await db
    .from("negozi")
    .select("id, nome")
    .in("id", validi);
  const infoById = new Map((negozi ?? []).map((n) => [String(n.id), n]));

  let esito;
  try {
    esito = await cestinaNegoziAdmin(validi, sessione.user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("TRASH_FAILED", message, 500);
  }

  // Log attività per ogni negozio effettivamente cestinato (best-effort,
  // stesso sistema del cestinamento singolo).
  for (const id of esito.successi) {
    const info = infoById.get(id) as { nome?: string | null } | undefined;
    await registraAttivitaAdmin({
      adminUserId: sessione.user.id,
      adminEmail: sessione.user.email ?? "",
      operationType: OPERATION_TYPES.NEGOZIO_CESTINATO,
      targetType: TARGET_TYPES.NEGOZIO,
      targetId: id,
      targetName: info?.nome ?? id,
      negozioId: id,
      negozioNome: info?.nome ?? null,
      result: "success",
    });
  }

  revalidatePath("/amministratore/attivita");
  revalidatePath("/amministratore/cestino");
  revalidatePath("/negozi");
  revalidatePath("/");

  const errori = [
    ...esito.errori.map((negozioId) => ({
      negozioId,
      motivo: "già nel Cestino o negozio non trovato",
    })),
    ...nonValidi.map((negozioId) => ({
      negozioId: String(negozioId),
      motivo: "UUID non valido",
    })),
  ];

  return apiOk({
    trashed: esito.successi.length,
    trashedIds: esito.successi,
    errori,
    totale: validi.length + nonValidi.length,
  });
}
