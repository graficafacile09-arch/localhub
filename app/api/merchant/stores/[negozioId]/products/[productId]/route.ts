import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { deleteMerchantProductForStore, getMerchantProductForStore, getMerchantStoreForUser, updateMerchantProductForStore } from "@/lib/merchant/data";
import { deleteImageFromStorage } from "@/lib/supabase/storage";
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
  context: { params: Promise<{ negozioId: string; productId: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  }

  const { negozioId, productId } = await context.params;
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storeResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  if (!storeResult.data) {
    return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);
  }

  const productResult = await getMerchantProductForStore(user.id, negozioId, productId);

  if (!productResult.data) {
    return apiError("NOT_FOUND", "Prodotto non trovato.", 404);
  }

  return apiOk({ product: productResult.data });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ negozioId: string; productId: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  }

  console.log("PUT USER ID", user.id);

  const { negozioId, productId } = await context.params;
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storeResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  if (!storeResult.data) {
    return apiError("FORBIDDEN", "Non puoi modificare prodotti per questo negozio.", 403);
  }

  const payload = (await request.json()) as Partial<MerchantProductInput>;
  const validationError = validateProductPayload(payload);

  if (validationError) {
    return apiError("INVALID_BODY", validationError, 422);
  }

  const oldProductResult = await getMerchantProductForStore(user.id, negozioId, productId);
  const oldImmagine = oldProductResult.data?.immagine_principale;

  const updateResult = await updateMerchantProductForStore(user.id, negozioId, productId, {
    nome: payload.nome!.trim(),
    descrizione: payload.descrizione!.trim(),
    categoria: payload.categoria!.trim(),
    marca: payload.marca?.trim(),
    colore: payload.colore?.trim(),
    materiale: payload.materiale?.trim(),
    paroleChiave: payload.paroleChiave ?? null,
    prezzo: payload.prezzo!,
    prezzoSuggerito: payload.prezzoSuggerito ?? null,
    quantitaDisponibile: payload.quantitaDisponibile ?? null,
    immaginePrincipale: payload.immaginePrincipale?.trim() ?? "",
    attivo: payload.attivo ?? true,
    originePubblicazione: payload.originePubblicazione ?? "manuale",
  });

  if (updateResult.setupRequired) {
    return apiError("SETUP_REQUIRED", updateResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  if (!updateResult.data) {
    return apiError("PRODUCT_UPDATE_FAILED", updateResult.errorMessage ?? "Impossibile aggiornare il prodotto.", 500);
  }

  if (oldImmagine && payload.immaginePrincipale?.startsWith("data:")) {
    await deleteImageFromStorage(oldImmagine);
  }

  return apiOk({ product: updateResult.data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ negozioId: string; productId: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  }

  const { negozioId, productId } = await context.params;
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storeResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  if (!storeResult.data) {
    return apiError("FORBIDDEN", "Non puoi eliminare prodotti per questo negozio.", 403);
  }

  const productResult = await getMerchantProductForStore(user.id, negozioId, productId);

  if (!productResult.data) {
    return apiError("NOT_FOUND", "Prodotto non trovato.", 404);
  }

  await deleteImageFromStorage(productResult.data.immagine_principale);

  const deleteResult = await deleteMerchantProductForStore(user.id, negozioId, productId);

  if (deleteResult.setupRequired) {
    return apiError("SETUP_REQUIRED", deleteResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  if (deleteResult.errorMessage) {
    return apiError("PRODUCT_DELETE_FAILED", deleteResult.errorMessage, 500);
  }

  return apiOk({ deleted: true });
}
