import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { addProductMediaForStore, getProductMediaForStore, isRuoloMediaValido, type RuoloMediaProdotto } from "@/lib/prodotti-media";

/**
 * GET/POST /api/merchant/stores/[negozioId]/products/[productId]/media
 * Gestione della galleria multi-immagine di un prodotto.
 * Autenticazione: area merchant + proprietà del negozio (verificata nel service).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ negozioId: string; productId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;

  const { negozioId, productId } = await context.params;
  const result = await getProductMediaForStore(sessione.user.id, negozioId, productId);

  if (!result.data) {
    return apiError("not_found", result.errorMessage ?? "Media non disponibili.", 404);
  }

  return apiOk({ media: result.data });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string; productId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;

  const { negozioId, productId } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("invalid_body", "Corpo della richiesta non valido.", 400);
  }

  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!dataUrl && !url) {
    return apiError("invalid_body", "Specifica dataUrl o url dell'immagine.", 400);
  }

  let role: RuoloMediaProdotto | undefined;
  if (body.role !== undefined) {
    if (!isRuoloMediaValido(body.role)) {
      return apiError("invalid_body", "Ruolo media non valido.", 400);
    }
    role = body.role;
  }

  const position = body.position !== undefined && typeof body.position === "number" ? body.position : undefined;

  const result = await addProductMediaForStore(sessione.user.id, negozioId, productId, {
    dataUrl: dataUrl || undefined,
    url: url || undefined,
    role,
    position,
  });

  if (!result.data) {
    return apiError("create_failed", result.errorMessage ?? "Impossibile aggiungere l'immagine.", 400);
  }

  return apiOk({ media: result.data }, 201);
}
