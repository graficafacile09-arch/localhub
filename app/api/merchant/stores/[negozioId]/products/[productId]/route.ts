import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { deleteMerchantProductForStore, getMerchantProductForStore, getMerchantStoreForUser, updateMerchantProductForStore } from "@/lib/merchant/data";
import { deleteImageFromStorage } from "@/lib/supabase/storage";
import type { MerchantProductInput } from "@/lib/merchant/types";

const STATI_CONDIZIONE_VALIDI = ["nuovo", "usato", "ricondizionato"] as const;

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

  // ── Campi arricchiti (coerenti con MerchantProductInput/MerchantProductForm) ──
  if (payload.descrizioneCompleta !== undefined && typeof payload.descrizioneCompleta !== "string") {
    return "Formato descrizione completa non valido.";
  }
  if (payload.caratteristiche !== undefined && !Array.isArray(payload.caratteristiche)) {
    return "Formato caratteristiche non valido.";
  }
  if (payload.pesoVolume !== undefined && typeof payload.pesoVolume !== "string") {
    return "Formato peso/volume non valido.";
  }
  if (
    payload.filtriCatalogo !== undefined &&
    (payload.filtriCatalogo === null || typeof payload.filtriCatalogo !== "object" || Array.isArray(payload.filtriCatalogo))
  ) {
    return "Formato filtri catalogo non valido.";
  }
  if (payload.seoTitle !== undefined && typeof payload.seoTitle !== "string") {
    return "Formato SEO title non valido.";
  }
  if (payload.seoTitle && payload.seoTitle.length > 60) {
    return "Il SEO title non può superare 60 caratteri.";
  }
  if (payload.seoDescription !== undefined && typeof payload.seoDescription !== "string") {
    return "Formato meta description non valido.";
  }
  if (payload.seoDescription && payload.seoDescription.length > 160) {
    return "La meta description non può superare 160 caratteri.";
  }
  if (payload.altTextImmagine !== undefined && typeof payload.altTextImmagine !== "string") {
    return "Formato alt text non valido.";
  }
  if (payload.sottocategoria !== undefined && payload.sottocategoria !== null && typeof payload.sottocategoria !== "string") {
    return "Formato sottocategoria non valido.";
  }
  if (
    payload.statoCondizione !== undefined &&
    payload.statoCondizione !== null &&
    !STATI_CONDIZIONE_VALIDI.includes(payload.statoCondizione as (typeof STATI_CONDIZIONE_VALIDI)[number])
  ) {
    return "Stato condizione non valido.";
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
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

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
    // Campi arricchiti (G1): inoltrati al data layer, che li persiste.
    descrizioneCompleta: payload.descrizioneCompleta,
    caratteristiche: payload.caratteristiche,
    pesoVolume: payload.pesoVolume,
    filtriCatalogo: payload.filtriCatalogo,
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    altTextImmagine: payload.altTextImmagine,
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
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

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
