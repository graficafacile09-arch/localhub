import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageStore } from "@/lib/merchant/data";
import { duplicateStore } from "@/lib/merchant/duplicate-store";
import type { DuplicateOptions, NewStoreInput } from "@/lib/merchant/duplicate-store";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ negozioId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  const { negozioId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const body = (await request.json()) as {
    newStore: NewStoreInput;
    options: DuplicateOptions;
  };

  if (!body.newStore?.nome?.trim()) {
    return apiError("VALIDATION_ERROR", "Il nome del nuovo negozio è obbligatorio.", 422);
  }
  if (!body.newStore?.slug?.trim()) {
    return apiError("VALIDATION_ERROR", "Lo slug è obbligatorio.", 422);
  }

  if (!body.options || Object.keys(body.options).length === 0) {
    return apiError("VALIDATION_ERROR", "Seleziona almeno un elemento da duplicare.", 422);
  }

  const hasSelection = Object.values(body.options).some(Boolean);
  if (!hasSelection) {
    return apiError("VALIDATION_ERROR", "Seleziona almeno un elemento da duplicare.", 422);
  }

  try {
    const result = await duplicateStore(user.id, negozioId, body.newStore, body.options);
    return apiOk({ storeId: result.id }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto durante la duplicazione.";
    return apiError("DUPLICATE_FAILED", message, 500);
  }
}
