import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  aggiornaTemplateAdmin,
  eliminaTemplateAdmin,
  getTutteTemplate,
} from "@/lib/amministratore/templates";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";

/**
 * Template di PIATTAFORMA — solo sessione admin.
 * GET    → dettaglio del template.
 * PATCH  → modifica nome/descrizione/categoria.
 * DELETE → eliminazione (i template di sistema sono protetti).
 */

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const { templateId } = await context.params;

  try {
    const templates = await getTutteTemplate();
    const template = templates.find((t) => t.id === templateId) ?? null;
    if (!template) {
      return apiError("NOT_FOUND", "Template non trovato.", 404);
    }
    return apiOk({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { templateId } = await context.params;
  const body = await request.json();

  // Recupera nome template prima della modifica per il log
  const db = createAdminSupabaseClient();
  const { data: esistente } = await db
    .from("templates")
    .select("nome")
    .eq("id", templateId)
    .single();

  try {
    await aggiornaTemplateAdmin(templateId, {
      nome: body.nome,
      descrizione: body.descrizione,
      categoria: body.categoria,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("UPDATE_FAILED", message, 500);
  }

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.TEMPLATE_MODIFICATO,
    targetType: TARGET_TYPES.TEMPLATE,
    targetId: templateId,
    targetName: esistente?.nome ?? templateId,
    result: "success",
    detail: { campi: Object.keys(body).join(", ") },
  });

  return apiOk({ updated: true });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { templateId } = await context.params;

  // Recupera nome template prima dell'eliminazione per il log
  const db = createAdminSupabaseClient();
  const { data: esistente } = await db
    .from("templates")
    .select("nome")
    .eq("id", templateId)
    .single();

  try {
    await eliminaTemplateAdmin(templateId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("DELETE_FAILED", message, 500);
  }

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.TEMPLATE_ELIMINATO,
    targetType: TARGET_TYPES.TEMPLATE,
    targetId: templateId,
    targetName: esistente?.nome ?? templateId,
    result: "success",
  });

  return apiOk({ deleted: true });
}