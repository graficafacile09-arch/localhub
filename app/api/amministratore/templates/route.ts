import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  creaTemplateAdmin,
  getTutteTemplate,
} from "@/lib/amministratore/templates";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";

/**
 * Template di PIATTAFORMA — solo sessione admin.
 * GET  → elenco completo dei template.
 * POST → crea un template da un negozio sorgente.
 */
export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const templates = await getTutteTemplate();
    return apiOk({ templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}

export async function POST(request: NextRequest) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const body = await request.json();
  const sourceStoreId = body.sourceStoreId as string;
  const nome = (body.nome as string)?.trim();
  const descrizione = (body.descrizione as string)?.trim();
  const categoria = (body.categoria as string)?.trim();
  const options = body.options as Record<string, boolean>;

  if (!sourceStoreId) {
    return apiError("VALIDATION_ERROR", "ID del negozio sorgente mancante.", 422);
  }
  if (!nome) {
    return apiError("VALIDATION_ERROR", "Il nome del template è obbligatorio.", 422);
  }
  if (!options || !Object.values(options).some(Boolean)) {
    return apiError("VALIDATION_ERROR", "Seleziona almeno un elemento da includere.", 422);
  }

  try {
    const result = await creaTemplateAdmin(
      sessione.user.id,
      sourceStoreId,
      { nome, descrizione, categoria },
      options as never
    );

    // Registra attività
    await registraAttivitaAdmin({
      adminUserId: sessione.user.id,
      adminEmail: sessione.user.email ?? "",
      operationType: OPERATION_TYPES.TEMPLATE_CREATO,
      targetType: TARGET_TYPES.TEMPLATE,
      targetId: result.id,
      targetName: nome,
      negozioId: sourceStoreId,
      result: "success",
    });

    return apiOk({ templateId: result.id }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("CREATE_FAILED", message, 500);
  }
}
