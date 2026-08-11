import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteImageFromStorage, uploadDataUrlToStorage } from "@/lib/supabase/storage";
import { getMerchantProductForStore } from "@/lib/merchant/data";

export type RuoloMediaProdotto = "primary" | "gallery" | "detail";

export type MediaProdotto = {
  id: string;
  product_id: string;
  storage_bucket: string | null;
  storage_path: string | null;
  public_url: string | null;
  role: RuoloMediaProdotto;
  position: number;
  created_at: string;
};

type MediaRow = {
  id: string;
  product_id: string;
  storage_bucket?: string | null;
  storage_path?: string | null;
  public_url?: string | null;
  role?: string | null;
  position?: number | null;
  created_at?: string | null;
};

function mapMedia(row: MediaRow): MediaProdotto {
  return {
    id: row.id,
    product_id: row.product_id,
    storage_bucket: row.storage_bucket ?? null,
    storage_path: row.storage_path ?? null,
    public_url: row.public_url ?? null,
    role: (row.role === "primary" || row.role === "gallery" || row.role === "detail" ? row.role : "gallery") as RuoloMediaProdotto,
    position: row.position ?? 0,
    created_at: row.created_at ?? "",
  };
}

const RUOLI_VALIDI: readonly RuoloMediaProdotto[] = ["primary", "gallery", "detail"];

export function isRuoloMediaValido(role: unknown): role is RuoloMediaProdotto {
  return typeof role === "string" && (RUOLI_VALIDI as readonly string[]).includes(role);
}

function isDataUrl(value: string): boolean {
  return /^data:image\/\w+;base64,/.test(value);
}

/**
 * Ricostruisce prodotti.immagine_principale a partire da product_media:
 * - se esiste un primary → usa il suo public_url;
 * - altrimenti promuove il primo media (position minore) a primary;
 * - se non resta nessun media → azzera SOLO se l'immagine attuale coincide
 *   con il media appena eliminato (urlEliminato), senza toccare un'eventuale
 *   immagine_principale impostata manualmente dal form.
 * Idempotente: aggiorna solo se il valore è cambiato.
 */
async function syncImmaginePrincipale(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  negozioId: string,
  productId: string,
  urlEliminato?: string | null
): Promise<void> {
  const { data: media } = await supabase
    .from("product_media")
    .select("id, public_url, role, position, created_at")
    .eq("product_id", String(productId))
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const lista = (media ?? []) as { id: string; public_url: string | null; role: string | null; position: number | null }[];
  const primary = lista.find((m) => m.role === "primary");
  let targetUrl: string | null | undefined = primary?.public_url ?? null;

  if (!primary && lista.length > 0) {
    const primo = lista[0];
    await supabase
      .from("product_media")
      .update({ role: "primary" })
      .eq("id", primo.id);
    targetUrl = primo.public_url ?? null;
  }

  const { data: prodotto } = await supabase
    .from("prodotti")
    .select("immagine_principale")
    .eq("id", productId)
    .eq("negozio_id", negozioId)
    .maybeSingle();

  const attuale = (prodotto as { immagine_principale?: string | null } | null)?.immagine_principale ?? null;

  let nuovo: string | null;
  if (targetUrl === undefined) {
    // Nessun media rimasto: azzera solo se l'attuale era il file eliminato.
    nuovo = urlEliminato && attuale === urlEliminato ? null : attuale;
  } else {
    nuovo = targetUrl;
  }

  if (attuale !== nuovo) {
    await supabase
      .from("prodotti")
      .update({ immagine_principale: nuovo })
      .eq("id", productId)
      .eq("negozio_id", negozioId);
  }
}

/**
 * Media pubblici di un prodotto (pagina /prodotto/[slug]).
 * RLS: "public product media read" consente SELECT a tutti.
 */
export async function getProductMediaPubbliche(productId: string): Promise<MediaProdotto[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("product_media")
    .select("id, product_id, storage_bucket, storage_path, public_url, role, position, created_at")
    .eq("product_id", String(productId))
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  return ((data ?? []) as MediaRow[]).map(mapMedia);
}

/**
 * Media di un prodotto, con verifica di proprietà merchant.
 * Rifiuta prodotto inesistente o appartenente ad altro negozio.
 */
export async function getProductMediaForStore(
  userId: string,
  negozioId: string,
  productId: string
): Promise<{ data: MediaProdotto[] | null; errorMessage: string | null }> {
  const productResult = await getMerchantProductForStore(userId, negozioId, productId);
  if (!productResult.data) {
    return { data: null, errorMessage: "Prodotto non trovato o non appartenente al negozio." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("product_media")
    .select("id, product_id, storage_bucket, storage_path, public_url, role, position, created_at")
    .eq("product_id", String(productId))
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return { data: null, errorMessage: error.message ?? "Impossibile recuperare i media." };
  return { data: ((data ?? []) as MediaRow[]).map(mapMedia), errorMessage: null };
}

export type AddMediaInput = {
  /** Data URL (base64) dell'immagine da caricare nello Storage. */
  dataUrl?: string;
  /** URL già pronto (es. immagine gestita altrove): viene salvato così com'è. */
  url?: string;
  role?: RuoloMediaProdotto;
  position?: number;
};

export async function addProductMediaForStore(
  userId: string,
  negozioId: string,
  productId: string,
  input: AddMediaInput
): Promise<{ data: MediaProdotto | null; errorMessage: string | null }> {
  const productResult = await getMerchantProductForStore(userId, negozioId, productId);
  if (!productResult.data) {
    return { data: null, errorMessage: "Prodotto non trovato o non appartenente al negozio." };
  }

  const dataUrl = input.dataUrl?.trim() ?? "";
  const url = input.url?.trim() ?? "";
  if (!dataUrl && !url) {
    return { data: null, errorMessage: "Nessuna immagine da aggiungere." };
  }

  const supabase = createAdminSupabaseClient();

  // Upload nello Storage (se data URL); altrimenti usa l'URL fornito.
  let publicUrl: string;
  let storageBucket: string | null = null;
  if (dataUrl) {
    if (!isDataUrl(dataUrl)) {
      return { data: null, errorMessage: "Formato immagine non valido." };
    }
    publicUrl = await uploadDataUrlToStorage(dataUrl);
    storageBucket = "product-images";
  } else {
    publicUrl = url;
  }

  // Position: se non fornita, in coda agli esistenti.
  let position = input.position;
  if (position === undefined) {
    const { count } = await supabase
      .from("product_media")
      .select("id", { head: true, count: "exact" })
      .eq("product_id", String(productId));
    position = typeof count === "number" ? count : 0;
  }

  // Un solo primary per prodotto: se role=primary viene richiesto esplicitamente
  // oppure non esiste ancora alcun primary, declassiamo i primary esistenti.
  const { data: esistenti } = await supabase
    .from("product_media")
    .select("id, role")
    .eq("product_id", String(productId));
  const haGiaPrimary = (esistenti ?? []).some((m) => m.role === "primary");
  const roleFinale: RuoloMediaProdotto =
    input.role === "primary" || (input.role === undefined && !haGiaPrimary && position === 0)
      ? "primary"
      : input.role && isRuoloMediaValido(input.role)
        ? input.role
        : "gallery";

  if (roleFinale === "primary") {
    await supabase
      .from("product_media")
      .update({ role: "gallery" })
      .eq("product_id", String(productId))
      .eq("role", "primary");
  }

  const { data: inserted, error } = await supabase
    .from("product_media")
    .insert({
      product_id: String(productId),
      storage_bucket: storageBucket,
      storage_path: storageBucket ? publicUrl.split(`/${storageBucket}/`).pop()?.split("?")[0] ?? null : null,
      public_url: publicUrl,
      role: roleFinale,
      position,
    })
    .select("*")
    .single();

  if (error) {
    // Errore di scrittura su product_media: rimuovi il file appena caricato.
    if (storageBucket) await deleteImageFromStorage(publicUrl, storageBucket);
    return { data: null, errorMessage: error.message ?? "Impossibile salvare il media." };
  }

  await syncImmaginePrincipale(supabase, negozioId, productId);

  return { data: mapMedia(inserted as MediaRow), errorMessage: null };
}

/**
 * Imposta un media come primary (declassa gli altri) e sincronizza
 * prodotti.immagine_principale.
 */
export async function setProductMediaPrimaryForStore(
  userId: string,
  negozioId: string,
  productId: string,
  mediaId: string
): Promise<{ data: MediaProdotto | null; errorMessage: string | null }> {
  return updateProductMediaForStore(userId, negozioId, productId, mediaId, { role: "primary" });
}

export type UpdateMediaInput = {
  role?: RuoloMediaProdotto;
  position?: number;
};

export async function updateProductMediaForStore(
  userId: string,
  negozioId: string,
  productId: string,
  mediaId: string,
  input: UpdateMediaInput
): Promise<{ data: MediaProdotto | null; errorMessage: string | null }> {
  const productResult = await getMerchantProductForStore(userId, negozioId, productId);
  if (!productResult.data) {
    return { data: null, errorMessage: "Prodotto non trovato o non appartenente al negozio." };
  }

  const supabase = createAdminSupabaseClient();

  const { data: esistente, error: findError } = await supabase
    .from("product_media")
    .select("id")
    .eq("id", mediaId)
    .eq("product_id", String(productId))
    .maybeSingle();

  if (findError || !esistente) {
    return { data: null, errorMessage: "Media non trovato per questo prodotto." };
  }

  const patch: Record<string, unknown> = {};
  if (input.role !== undefined) {
    if (!isRuoloMediaValido(input.role)) {
      return { data: null, errorMessage: "Ruolo media non valido." };
    }
    patch.role = input.role;
  }
  if (input.position !== undefined) patch.position = input.position;

  if (input.role === "primary") {
    await supabase
      .from("product_media")
      .update({ role: "gallery" })
      .eq("product_id", String(productId))
      .eq("role", "primary")
      .neq("id", mediaId);
  }

  const { data: updated, error } = await supabase
    .from("product_media")
    .update(patch)
    .eq("id", mediaId)
    .select("*")
    .single();

  if (error) {
    return { data: null, errorMessage: error.message ?? "Impossibile aggiornare il media." };
  }

  await syncImmaginePrincipale(supabase, negozioId, productId);

  return { data: mapMedia(updated as MediaRow), errorMessage: null };
}

/**
 * Elimina un media: rimuove il file dallo Storage (se gestito dall'app) e
 * la riga da product_media, poi risincronizza immagine_principale.
 */
export async function deleteProductMediaForStore(
  userId: string,
  negozioId: string,
  productId: string,
  mediaId: string
): Promise<{ data: { id: string } | null; errorMessage: string | null }> {
  const productResult = await getMerchantProductForStore(userId, negozioId, productId);
  if (!productResult.data) {
    return { data: null, errorMessage: "Prodotto non trovato o non appartenente al negozio." };
  }

  const supabase = createAdminSupabaseClient();

  const { data: esistente, error: findError } = await supabase
    .from("product_media")
    .select("id, storage_bucket, public_url")
    .eq("id", mediaId)
    .eq("product_id", String(productId))
    .maybeSingle();

  if (findError || !esistente) {
    return { data: null, errorMessage: "Media non trovato per questo prodotto." };
  }

  const row = esistente as MediaRow;
  const bucket = row.storage_bucket ?? "product-images";
  const url = row.public_url ?? null;

  // Prima la riga, poi il file: se il file non esiste più il record non resta orfano.
  const { error: deleteError } = await supabase
    .from("product_media")
    .delete()
    .eq("id", mediaId);

  if (deleteError) {
    return { data: null, errorMessage: deleteError.message ?? "Impossibile eliminare il media." };
  }

  if (url) {
    // Best-effort: un errore di storage non deve far fallire l'operazione.
    await deleteImageFromStorage(url, bucket).catch(() => undefined);
  }

  await syncImmaginePrincipale(supabase, negozioId, productId, url);

  return { data: { id: mediaId }, errorMessage: null };
}
