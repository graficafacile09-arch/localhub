import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  deleteProductMediaForStore,
  isRuoloMediaValido,
  updateProductMediaForStore,
} from "@/lib/prodotti-media";

/**
 * PATCH/DELETE /api/merchant/stores/[negozioId]/products/[productId]/media/[mediaId]
 * - PATCH: aggiorna ruolo (incluso "primary"), position, alt_text.
 * - DELETE: elimina media e file dallo Storage.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ negozioId: string; productId: string; mediaId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;

  const { negozioId, productId, mediaId } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("invalid_body", "Corpo della richiesta non valido.", 400);
  }

  let role: "primary" | "gallery" | "detail" | undefined;
  if (body.role !== undefined) {
    if (!isRuoloMediaValido(body.role)) {
      return apiError("invalid_body", "Ruolo media non valido.", 400);
    }
    role = body.role;
  }

  const position = body.position !== undefined && typeof body.position === "number" ? body.position : undefined;

  const result = await updateProductMediaForStore(sessione.user.id, negozioId, productId, mediaId, {
    role,
    position,
  });

  if (!result.data) {
    return apiError("update_failed", result.errorMessage ?? "Impossibile aggiornare il media.", 400);
  }

  return apiOk({ media: result.data });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ negozioId: string; productId: string; mediaId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;

  const { negozioId, productId, mediaId } = await context.params;

  const result = await deleteProductMediaForStore(sessione.user.id, negozioId, productId, mediaId);

  if (!result.data) {
    return apiError("delete_failed", result.errorMessage ?? "Impossibile eliminare il media.", 400);
  }

  return apiOk({ id: result.data.id });
}
