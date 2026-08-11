import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createMerchantProductForStore, getMerchantProductsForStore, getMerchantStoreForUser } from "@/lib/merchant/data";
import type { MerchantProductInput, OrdinamentoProdotti } from "@/lib/merchant/types";

const STATI_CONDIZIONE_VALIDI = ["nuovo", "usato", "ricondizionato"] as const;
const ORDINAMENTI_VALIDI: OrdinamentoProdotti[] = [
  "recenti",
  "vecchi",
  "prezzo_asc",
  "prezzo_desc",
  "nome_asc",
  "nome_desc",
];

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
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storeResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  if (!storeResult.data) {
    return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);
  }

  // Filtri/ordinamento/paginazione opzionali via query string (G2 + Fase D).
  const url = new URL(request.url);
  const stato = url.searchParams.get("stato") === "attivo" || url.searchParams.get("stato") === "bozza"
    ? (url.searchParams.get("stato") as "attivo" | "bozza")
    : undefined;
  const esaurito = url.searchParams.get("esaurito") === "1" || url.searchParams.get("esaurito") === "true";
  const ordinaRaw = url.searchParams.get("ordina") ?? "";
  const ordina = ORDINAMENTI_VALIDI.includes(ordinaRaw as OrdinamentoProdotti)
    ? (ordinaRaw as OrdinamentoProdotti)
    : undefined;
  const pagina = Number(url.searchParams.get("pagina") ?? 0) || undefined;
  const perPagina = Number(url.searchParams.get("perPagina") ?? 0) || undefined;

  const productsResult = await getMerchantProductsForStore(user.id, negozioId, {
    q: url.searchParams.get("q")?.trim() || undefined,
    stato,
    ai: url.searchParams.get("ai") === "1" ? true : undefined,
    esaurito: esaurito || undefined,
    ordina,
    pagina,
    perPagina,
  });

  if (productsResult.errorMessage) {
    return apiError("PRODUCTS_FETCH_FAILED", productsResult.errorMessage, 500);
  }

  return apiOk({
    products: productsResult.data,
    total: productsResult.total ?? productsResult.data.length,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storeResult.errorMessage ?? "Configurazione database non completata.", 503);
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
    // Campi arricchiti (G1): inoltrati al data layer, che li persiste.
    descrizioneCompleta: payload.descrizioneCompleta,
    caratteristiche: payload.caratteristiche,
    pesoVolume: payload.pesoVolume,
    filtriCatalogo: payload.filtriCatalogo,
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    altTextImmagine: payload.altTextImmagine,
  });

  if (createResult.setupRequired) {
    return apiError("SETUP_REQUIRED", createResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  if (!createResult.data) {
    return apiError("PRODUCT_CREATE_FAILED", createResult.errorMessage ?? "Impossibile creare il prodotto.", 500);
  }

  return apiOk({ product: createResult.data }, 201);
}
