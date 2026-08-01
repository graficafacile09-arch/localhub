import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { getTemplates, createTemplateFromStore } from "@/lib/merchant/template-store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  try {
    const templates = await getTemplates(user.id);
    return apiOk({ templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

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

  if (!options || Object.values(options).every(Boolean) === false) {
    // Actually we need to check that at least one is true
    if (!options || !Object.values(options).some(Boolean)) {
      return apiError("VALIDATION_ERROR", "Seleziona almeno un elemento da includere.", 422);
    }
  }

  try {
    const result = await createTemplateFromStore(
      user.id,
      sourceStoreId,
      { nome, descrizione, categoria },
      options as any
    );
    return apiOk({ templateId: result.id }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("CREATE_FAILED", message, 500);
  }
}
