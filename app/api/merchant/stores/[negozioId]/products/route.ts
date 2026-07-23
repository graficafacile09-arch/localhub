import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { createMerchantProductForStore, getMerchantProductsForStore, getMerchantStoreForUser } from "@/lib/merchant/data";
import type { MerchantProductInput } from "@/lib/merchant/types";

function validateProductPayload(payload: Partial<MerchantProductInput>) {
  if (!payload.nome?.trim()) {
    return "Il nome del prodotto è obbligatorio.";
  }

  if (!payload.descrizione?.trim()) {
    return "La descrizione del prodotto è obbligatoria.";
  }

  if (!payload.categoria?.trim()) {
    return "La categoria del prodotto è obbligatoria.";
  }

  if (typeof payload.prezzo !== "number" || Number.isNaN(payload.prezzo) || payload.prezzo < 0) {
    return "Inserisci un prezzo valido.";
  }

  if (
    payload.quantitaDisponibile !== null &&
    payload.quantitaDisponibile !== undefined &&
    (typeof payload.quantitaDisponibile !== "number" || Number.isNaN(payload.quantitaDisponibile) || payload.quantitaDisponibile < 0)
  ) {
    return "Inserisci una quantità disponibile valida.";
  }

  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  }

  const { negozioId } = await context.params;
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storeResult.errorMessage ?? "Merchant Foundation non configurata.", 503);
  }

  if (!storeResult.data) {
    return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);
  }

  const productsResult = await getMerchantProductsForStore(user.id, negozioId);

  if (productsResult.errorMessage) {
    return apiError("PRODUCTS_FETCH_FAILED", productsResult.errorMessage, 500);
  }

  return apiOk({ products: productsResult.data });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  }

  const { negozioId } = await context.params;
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storeResult.errorMessage ?? "Merchant Foundation non configurata.", 503);
  }

  if (!storeResult.data) {
    return apiError("FORBIDDEN", "Non puoi creare prodotti per questo negozio.", 403);
  }

  const payload = (await request.json()) as Partial<MerchantProductInput>;
  const validationError = validateProductPayload(payload);

  if (validationError) {
    return apiError("INVALID_BODY", validationError, 422);
  }

  const createResult = await createMerchantProductForStore(user.id, negozioId, {
    nome: payload.nome!.trim(),
    descrizione: payload.descrizione!.trim(),
    categoria: payload.categoria!.trim(),
    sottocategoria: payload.sottocategoria?.trim() || null,
    marca: payload.marca?.trim(),
    colore: payload.colore?.trim(),
    materiale: payload.materiale?.trim(),
    paroleChiave: payload.paroleChiave ?? null,
    prezzo: payload.prezzo!,
    prezzoSuggerito: payload.prezzoSuggerito ?? null,
    quantitaDisponibile: payload.quantitaDisponibile ?? null,
    statoCondizione: payload.statoCondizione ?? null,
    immaginePrincipale: payload.immaginePrincipale?.trim() ?? "",
    attivo: payload.attivo ?? true,
    originePubblicazione: payload.originePubblicazione ?? "manuale",
  });

  if (createResult.setupRequired) {
    return apiError("SETUP_REQUIRED", createResult.errorMessage ?? "Merchant Foundation non configurata.", 503);
  }

  if (!createResult.data) {
    return apiError("PRODUCT_CREATE_FAILED", createResult.errorMessage ?? "Impossibile creare il prodotto.", 500);
  }

  return apiOk({ product: createResult.data }, 201);
}
