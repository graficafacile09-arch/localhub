import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { getTemplateById, updateTemplate, deleteTemplate } from "@/lib/merchant/template-store";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  const { templateId } = await context.params;

  try {
    const data = await getTemplateById(templateId);
    return apiOk({ template: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  const { templateId } = await context.params;
  const body = await request.json();

  try {
    await updateTemplate(templateId, user.id, {
      nome: body.nome,
      descrizione: body.descrizione,
      categoria: body.categoria,
    });
    return apiOk({ updated: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("UPDATE_FAILED", message, 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  const { templateId } = await context.params;

  try {
    await deleteTemplate(templateId, user.id);
    return apiOk({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("DELETE_FAILED", message, 500);
  }
}
