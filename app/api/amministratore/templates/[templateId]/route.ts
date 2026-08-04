import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { utenteHaRuoli } from "@/lib/auth/roles";
import {
  aggiornaTemplateAdmin,
  eliminaTemplateAdmin,
  getTutteTemplate,
} from "@/lib/amministratore/templates";

/**
 * Template di PIATTAFORMA — solo amministratori.
 * GET    → dettaglio del template.
 * PATCH  → modifica nome/descrizione/categoria.
 * DELETE → eliminazione (i template di sistema sono protetti).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  if (!(await utenteHaRuoli(user.id, ["admin"]))) {
    return apiError("FORBIDDEN", "Accesso riservato agli amministratori.", 403);
  }

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
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  if (!(await utenteHaRuoli(user.id, ["admin"]))) {
    return apiError("FORBIDDEN", "Accesso riservato agli amministratori.", 403);
  }

  const { templateId } = await context.params;
  const body = await request.json();

  try {
    await aggiornaTemplateAdmin(templateId, {
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
  if (!(await utenteHaRuoli(user.id, ["admin"]))) {
    return apiError("FORBIDDEN", "Accesso riservato agli amministratori.", 403);
  }

  const { templateId } = await context.params;

  try {
    await eliminaTemplateAdmin(templateId);
    return apiOk({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("DELETE_FAILED", message, 500);
  }
}
