import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { cestinaOrdiniAdmin } from "@/lib/amministratore/ordini";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BATCH = 100;

/**
 * POST /api/amministratore/ordini/cestina-batch
 *
 * Eliminazione MULTIPLA (soft delete) di ordini verso il Cestino — riservata
 * alla sessione admin (requireApiArea PRIMA di qualunque scrittura).
 *
 * Body: { "ordineIds": ["uuid1", "uuid2", ...] }
 *
 * Usa la STESSA logica del cestinamento singolo (cestinaOrdiniAdmin → riusa
 * cestinaOrdineAdmin): imposta deleted_at/deleted_by, NON modifica stato,
 * stock o altri dati, NON cancella fisicamente. Esclude gli ordini già nel
 * Cestino e restituisce un esito chiaro con conteggio successi/errori.
 */
export async function POST(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  let body: { ordineIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  const raw = Array.isArray(body?.ordineIds) ? body.ordineIds : [];
  if (raw.length === 0) {
    return apiError("VALIDATION_ERROR", "Nessun ordine selezionato.", 422);
  }
  if (raw.length > MAX_BATCH) {
    return apiError("VALIDATION_ERROR", `Seleziona al massimo ${MAX_BATCH} ordini.`, 422);
  }

  // Validazione UUID: gli id malformati non vanno MAI al DB (conteggiati
  // come errori, mai un fallimento silenzioso).
  const valido = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
  const validi = raw.filter(valido);
  const nonValidi = raw.filter((v) => !valido(v));

  // Info per il log attività (numero/negozio) prima del cestinamento.
  const db = createAdminSupabaseClient();
  const { data: ordini } = await db
    .from("ordini")
    .select("id, numero, negozio_nome, negozio_id")
    .in("id", validi);
  const infoById = new Map((ordini ?? []).map((o) => [String(o.id), o]));

  let esito;
  try {
    esito = await cestinaOrdiniAdmin(validi, sessione.user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("TRASH_FAILED", message, 500);
  }

  // Log attività per ogni ordine effettivamente cestinato (best-effort,
  // stesso sistema del cestinamento singolo).
  for (const id of esito.successi) {
    const info = infoById.get(id) as
      | { numero?: string; negozio_nome?: string | null; negozio_id?: string | null }
      | undefined;
    await registraAttivitaAdmin({
      adminUserId: sessione.user.id,
      adminEmail: sessione.user.email ?? "",
      operationType: OPERATION_TYPES.ORDINE_CESTINATO,
      targetType: TARGET_TYPES.ORDINE,
      targetId: id,
      targetName: info?.numero ?? id,
      negozioId: String(info?.negozio_id ?? "") || null,
      negozioNome: info?.negozio_nome ?? null,
      result: "success",
    });
  }

  revalidatePath("/amministratore/ordini");
  revalidatePath("/amministratore/cestino");

  const errori = [
    ...esito.errori.map((ordineId) => ({
      ordineId,
      motivo: "già nel Cestino o ordine non trovato",
    })),
    ...nonValidi.map((ordineId) => ({
      ordineId: String(ordineId),
      motivo: "UUID non valido",
    })),
  ];

  return apiOk({
    trashed: esito.successi.length,
    errori,
    totale: validi.length + nonValidi.length,
  });
}
