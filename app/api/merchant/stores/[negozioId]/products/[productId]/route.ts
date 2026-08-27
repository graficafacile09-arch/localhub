import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { deleteMerchantProductForStore, getMerchantProductForStore, getMerchantStoreForUser, patchMerchantProductForStore, updateMerchantProductForStore } from "@/lib/merchant/data";
import { deleteImageFromStorage } from "@/lib/supabase/storage";
import { notificaSeTornatoDisponibile } from "@/lib/prodotti-avvisami";
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
  // ── MOTORE TARIFFARIO: peso reale in grammi + tariffa corriere locale ──
  if (
    payload.pesoGrammi !== undefined &&
    payload.pesoGrammi !== null &&
    (typeof payload.pesoGrammi !== "number" || !Number.isInteger(payload.pesoGrammi) || payload.pesoGrammi < 0)
  ) {
    return "Inserisci un peso valido in grammi (numero intero ≥ 0).";
  }
  if (
    payload.costoSpedizioneLocale !== undefined &&
    payload.costoSpedizioneLocale !== null &&
    (typeof payload.costoSpedizioneLocale !== "number" || Number.isNaN(payload.costoSpedizioneLocale) || payload.costoSpedizioneLocale < 0)
  ) {
    return "Inserisci un costo del corriere locale valido (≥ 0).";
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
  if (payload.prodottoTipico !== undefined && typeof payload.prodottoTipico !== "boolean") {
    return "Il campo prodotto_tipico deve essere booleano.";
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
    prodottoTipico: payload.prodottoTipico ?? false,
    // Campi arricchiti (G1): inoltrati al data layer, che li persiste.
    descrizioneCompleta: payload.descrizioneCompleta,
    caratteristiche: payload.caratteristiche,
    pesoVolume: payload.pesoVolume,
    pesoGrammi: payload.pesoGrammi ?? null,
    costoSpedizioneLocale: payload.costoSpedizioneLocale ?? null,
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

  // Ritorno di disponibilità (0 → >0): genera le notifiche "avvisami".
  await notificaSeTornatoDisponibile(
    productId,
    oldProductResult.data?.quantita_disponibile,
    updateResult.data.quantita_disponibile
  );

  if (oldImmagine && payload.immaginePrincipale?.startsWith("data:")) {
    await deleteImageFromStorage(oldImmagine);
  }

  return apiOk({ product: updateResult.data });
}

/**
 * PATCH — aggiornamento PARZIALE rapido (modifica rapida quantità/attivo
 * dalla lista prodotti). Non richiede il payload completo del PUT.
 */
export async function PATCH(
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

  const body = (await request.json().catch(() => null)) as Partial<{
    quantitaDisponibile?: number | null;
    attivo?: boolean;
    immaginePrincipale?: string | null;
  }> | null;

  if (!body || typeof body !== "object") {
    return apiError("INVALID_BODY", "Body JSON non valido.", 422);
  }

  const productResult = await getMerchantProductForStore(user.id, negozioId, productId);

  if (!productResult.data) {
    return apiError("NOT_FOUND", "Prodotto non trovato.", 404);
  }

  const patch: {
    quantitaDisponibile?: number | null;
    attivo?: boolean;
    immaginePrincipale?: string;
  } = {};

  if (body.quantitaDisponibile !== undefined) {
    const q = body.quantitaDisponibile;
    if (q !== null && (typeof q !== "number" || Number.isNaN(q) || q < 0)) {
      return apiError("INVALID_BODY", "Inserisci una quantità valida (0 o superiore).", 422);
    }
    patch.quantitaDisponibile = q;
  }

  if (body.attivo !== undefined) {
    if (typeof body.attivo !== "boolean") {
      return apiError("INVALID_BODY", "Il campo attivo deve essere booleano.", 422);
    }
    patch.attivo = body.attivo;
  }

  // Aggiornamento della SOLA immagine (data URL o URL già persistito): usato
  // dall'editor immagine post-generazione del wizard AI.
  if (body.immaginePrincipale !== undefined) {
    if (typeof body.immaginePrincipale !== "string" || !body.immaginePrincipale.trim()) {
      return apiError("INVALID_BODY", "Immagine non valida.", 422);
    }
    patch.immaginePrincipale = body.immaginePrincipale.trim();
  }

  if (Object.keys(patch).length === 0) {
    return apiError("INVALID_BODY", "Nessun campo valido da aggiornare.", 422);
  }

  const patchResult = await patchMerchantProductForStore(user.id, negozioId, productId, patch);

  if (patchResult.setupRequired) {
    return apiError("SETUP_REQUIRED", patchResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  if (!patchResult.data) {
    return apiError("PRODUCT_UPDATE_FAILED", patchResult.errorMessage ?? "Impossibile aggiornare il prodotto.", 500);
  }

  // Ritorno di disponibilità (0 → >0): genera le notifiche "avvisami".
  if (patch.quantitaDisponibile !== undefined) {
    await notificaSeTornatoDisponibile(
      productId,
      productResult.data?.quantita_disponibile,
      patchResult.data.quantita_disponibile
    );
  }

  // Nuova immagine arrivata come data URL: la vecchia è stata sostituita,
  // rimuovila dallo storage (stesso pattern del PUT).
  if (
    patch.immaginePrincipale &&
    patch.immaginePrincipale.startsWith("data:") &&
    productResult.data.immagine_principale
  ) {
    await deleteImageFromStorage(productResult.data.immagine_principale);
  }

  return apiOk({ product: patchResult.data });
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
