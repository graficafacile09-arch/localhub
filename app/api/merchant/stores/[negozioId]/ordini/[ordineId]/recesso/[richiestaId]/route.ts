import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rimborsaOrdine, MAX_MOTIVO_RIMBORSO } from "@/lib/pagamenti/rimborsi";
import { randomUUID } from "node:crypto";

const AZIONI = new Set([
  "presa_in_carico",
  "istruzioni_reso",
  "reso_ricevuto",
  "rimborso_avviato",
  "rimborsata",
  "chiusa",
  "rifiuta",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string; richiestaId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;

  const { negozioId, ordineId, richiestaId } = await context.params;

  let body: { azione?: unknown; nota?: unknown; importoRimborsato?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  if (typeof body.azione !== "string" || !AZIONI.has(body.azione)) {
    return apiError("VALIDATION_ERROR", "Azione non valida.", 422);
  }

  const nota = typeof body.nota === "string" ? body.nota.trim().slice(0, 1500) : null;
  const importo = body.importoRimborsato == null || body.importoRimborsato === ""
    ? null
    : Number(body.importoRimborsato);

  if (importo !== null && (!Number.isFinite(importo) || importo <= 0)) {
    return apiError("VALIDATION_ERROR", "Importo rimborsato non valido.", 422);
  }

  if (body.azione === "rimborsata") {
    if (importo === null) {
      return apiError("IMPORTO_RIMBORSO_MANCANTE", "Indica l'importo da rimborsare.", 422);
    }
    const esitoRimborso = await rimborsaOrdine({
      ordineId,
      importo,
      motivo: nota?.slice(0, MAX_MOTIVO_RIMBORSO) ?? null,
      userId: sessione.user.id,
      idempotencyKey: request.headers.get("Idempotency-Key")?.trim() || randomUUID(),
    });
    if (!esitoRimborso.ok) {
      return apiError(esitoRimborso.codice, esitoRimborso.errore, esitoRimborso.status);
    }
    if (esitoRimborso.pending) {
      return apiOk({
        pratica: null,
        negozioId,
        ordineId,
        richiestaId,
        aggiornata: false,
        rimborso: { pending: true, refundId: esitoRimborso.refundId },
        message: "Il rimborso è in riconciliazione. La pratica resta nello stato attuale.",
      }, 202);
    }
    importo = esitoRimborso.importoRimborsato;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error: rpcError } = await supabase.rpc("gestisci_richiesta_recesso", {
    p_richiesta_id: richiestaId,
    p_azione: body.azione,
    p_nota: nota,
    p_importo_rimborsato: importo,
  });

  if (rpcError) {
    console.error("[api-recesso] RPC:", rpcError.message);
    return apiError("SAVE_FAILED", "Impossibile aggiornare la pratica.", 500);
  }

  if (!data?.ok) {
    const status = data?.codice === "NOT_FOUND" ? 404 : data?.codice === "UNAUTHORIZED" ? 401 : 422;
    return apiError(data?.codice || "SAVE_FAILED", data?.messaggio || "Impossibile aggiornare la pratica.", status);
  }

  const url = new URL(request.url);
  void sessione.user.id;
  return apiOk({
    pratica: data,
    negozioId,
    ordineId,
    richiestaId,
    aggiornata: true,
    origin: url.origin,
    rimborso: body.azione === "rimborsata" ? { pending: false, importoRimborsato: importo } : null,
  });
}
