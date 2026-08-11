import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  createVarianteForProduct,
  getMerchantProductForStore,
  getMerchantStoreForUser,
  getVariantiForProduct,
  negozioEsiste,
} from "@/lib/merchant/data";
import type { AttributiVariante, VarianteProdottoInput } from "@/lib/merchant/types";

/** Verifica negozio: 503 setup, 404 inesistente, 403 non di proprietà. */
async function verificaNegozio(userId: string, negozioId: string) {
  const storeResult = await getMerchantStoreForUser(userId, negozioId);

  if (storeResult.setupRequired) {
    return { error: apiError("SETUP_REQUIRED", storeResult.errorMessage ?? "Configurazione database non completata.", 503) };
  }

  if (!storeResult.data) {
    const esiste = await negozioEsiste(negozioId);
    return {
      error: esiste
        ? apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403)
        : apiError("NOT_FOUND", "Negozio non trovato.", 404),
    };
  }

  return { error: null };
}

/**
 * Validazione payload variante (lato merchant). quantita_riservata NON è
 * accettato: la riserva è gestita dal sistema e non è modificabile dal
 * venditore.
 */
function validateVariantePayload(raw: Record<string, unknown>): string | null {
  if ("quantitaRiservata" in raw) {
    return "La quantità riservata è gestita automaticamente dal sistema e non può essere modificata.";
  }

  const payload = raw as Partial<VarianteProdottoInput>;

  if (payload.nome !== undefined && payload.nome !== null && typeof payload.nome !== "string") {
    return "Formato nome variante non valido.";
  }

  if (payload.attributi !== undefined) {
    if (payload.attributi === null || typeof payload.attributi !== "object" || Array.isArray(payload.attributi)) {
      return "Gli attributi della variante devono essere un oggetto JSON.";
    }
    for (const [chiave, valore] of Object.entries(payload.attributi as AttributiVariante)) {
      if (typeof valore !== "string") {
        return `Valore attributo non valido per "${chiave}".`;
      }
    }
  }

  if (payload.prezzo !== undefined && payload.prezzo !== null) {
    if (typeof payload.prezzo !== "number" || Number.isNaN(payload.prezzo) || payload.prezzo < 0) {
      return "Inserisci un prezzo valido (0 o superiore).";
    }
  }

  if (payload.quantitaDisponibile !== undefined) {
    if (
      typeof payload.quantitaDisponibile !== "number" ||
      Number.isNaN(payload.quantitaDisponibile) ||
      !Number.isInteger(payload.quantitaDisponibile) ||
      payload.quantitaDisponibile < 0
    ) {
      return "Inserisci una quantità disponibile valida (numero intero 0 o superiore).";
    }
  }

  if (payload.immaginePrincipale !== undefined && payload.immaginePrincipale !== null && typeof payload.immaginePrincipale !== "string") {
    return "Formato immagine non valido.";
  }

  if (payload.attivo !== undefined && typeof payload.attivo !== "boolean") {
    return "Il campo attivo deve essere booleano.";
  }

  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string; productId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId, productId } = await context.params;

  const storeCheck = await verificaNegozio(user.id, negozioId);
  if (storeCheck.error) return storeCheck.error;

  const productResult = await getMerchantProductForStore(user.id, negozioId, productId);
  if (!productResult.data) {
    return apiError("NOT_FOUND", "Prodotto non trovato.", 404);
  }

  const result = await getVariantiForProduct(user.id, negozioId, productId);
  if (result.errorMessage) {
    if (result.code === "PRODUCT_NOT_FOUND") {
      return apiError("NOT_FOUND", "Prodotto non trovato.", 404);
    }
    return apiError("VARIANTS_FETCH_FAILED", result.errorMessage, 500);
  }

  return apiOk({ varianti: result.data });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string; productId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId, productId } = await context.params;

  const storeCheck = await verificaNegozio(user.id, negozioId);
  if (storeCheck.error) return storeCheck.error;

  const productResult = await getMerchantProductForStore(user.id, negozioId, productId);
  if (!productResult.data) {
    return apiError("NOT_FOUND", "Prodotto non trovato.", 404);
  }

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return apiError("INVALID_BODY", "Body JSON non valido.", 422);
  }

  const validationError = validateVariantePayload(raw);
  if (validationError) {
    return apiError("INVALID_BODY", validationError, 422);
  }

  const result = await createVarianteForProduct(user.id, negozioId, productId, raw as Partial<VarianteProdottoInput>);

  if (result.errorMessage) {
    if (result.code === "UNIQUE_CONFLICT") {
      return apiError("VARIANT_CONFLICT", "Esiste già una variante con gli stessi attributi per questo prodotto.", 409);
    }
    if (result.code === "AGGREGATION_MISMATCH") {
      return apiError("AGGREGATION_MISMATCH", result.errorMessage, 500);
    }
    if (result.code === "PRODUCT_NOT_FOUND") {
      return apiError("NOT_FOUND", "Prodotto non trovato.", 404);
    }
    return apiError("VARIANT_CREATE_FAILED", result.errorMessage, 500);
  }

  return apiOk({ variante: result.data!.variante, prodotto: result.data!.prodotto }, 201);
}
