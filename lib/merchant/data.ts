import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadDataUrlToStorage } from "@/lib/supabase/storage";
import { generaSlugUnivoco } from "@/lib/slug-server";
import { getCurrentUser } from "@/lib/auth/session";
import { utenteAdminAutorizzato } from "@/lib/auth/roles";
import type {
  MerchantProduct,
  MerchantProductInput,
  MerchantQueryResult,
  MerchantRole,
  MerchantStoreSummary,
} from "./types";

type QueryError = {
  code?: string;
  message?: string;
};

/**
 * True se l'utente è l'ADMIN AUTORIZZATO (email + ruolo admin).
 * Il solo ruolo admin senza l'email autorizzata NON concede poteri
 * amministrativi: blocca il bypass del gate via Area Commerciante.
 * Variante locale che legge l'email dalla sessione corrente.
 */
async function utenteAdminAutorizzatoCorrente(userId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  return utenteAdminAutorizzato(userId, user.email ?? "");
}

type NegozioRow = {
  id: string;
  nome?: string | null;
  categoria?: string | null;
  descrizione?: string | null;
  attivo?: boolean | null;
};

type ProdottoRow = {
  id: string | number;
  negozio_id?: string | number | null;
  nome?: string | null;
  descrizione?: string | null;
  descrizione_completa?: string | null;
  categoria?: string | null;
  sottocategoria?: string | null;
  marca?: string | null;
  colore?: string | null;
  materiale?: string | null;
  caratteristiche?: string[] | null;
  peso_volume?: string | null;
  parole_chiave?: string[] | null;
  filtri_catalogo?: Record<string, string> | null;
  prezzo?: number | string | null;
  prezzo_suggerito?: number | null;
  immagine_principale?: string | null;
  quantita_disponibile?: number | null;
  stato_condizione?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  alt_text_immagine?: string | null;
  attivo?: boolean | null;
  origine_pubblicazione?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

function isSchemaError(error: QueryError | null) {
  return Boolean(error?.code && SCHEMA_ERROR_CODES.has(error.code));
}

/**
 * Client Supabase corretto per l'utente: l'ADMIN AUTORIZZATO usa il client
 * admin (bypassa RLS) così può gestire QUALSIASI negozio della piattaforma;
 * i commercianti usano il client server (RLS li limita ai propri negozi).
 */
async function getDbForUser(userId: string) {
  if (await utenteAdminAutorizzatoCorrente(userId)) {
    return createAdminSupabaseClient();
  }
  return await createServerSupabaseClient();
}

// =================================================================
// Funzioni concentrate per la gestione dello store
// =================================================================
// Nota: attualmente la proprietà è determinata da negozi.owner_user_id.

function mapStore(row: NegozioRow): MerchantStoreSummary {
  return {
    id: String(row.id),
    nome: row.nome?.trim() || "Negozio senza nome",
    categoria: row.categoria ?? null,
    descrizione: row.descrizione ?? null,
    attivo: row.attivo ?? true,
    role: "owner" as MerchantRole,
  };
}

function parseStatoCondizione(value: string | null | undefined): MerchantProduct["stato_condizione"] {
  if (value === "usato" || value === "ricondizionato") return value;
  if (value === "nuovo") return "nuovo";
  return null;
}

function mapProduct(row: ProdottoRow): MerchantProduct {
  return {
    id: String(row.id),
    negozio_id: String(row.negozio_id ?? ""),
    nome: row.nome?.trim() || "Prodotto senza nome",
    descrizione: row.descrizione ?? null,
    descrizione_completa: row.descrizione_completa ?? null,
    categoria: row.categoria ?? null,
    sottocategoria: row.sottocategoria ?? null,
    marca: row.marca ?? null,
    colore: row.colore ?? null,
    materiale: row.materiale ?? null,
    caratteristiche: row.caratteristiche ?? null,
    peso_volume: row.peso_volume ?? null,
    parole_chiave: row.parole_chiave ?? null,
    filtri_catalogo: row.filtri_catalogo ?? null,
    prezzo:
      typeof row.prezzo === "number"
        ? row.prezzo
        : typeof row.prezzo === "string"
          ? Number(row.prezzo)
          : null,
    prezzo_suggerito: row.prezzo_suggerito ?? null,
    immagine_principale: row.immagine_principale ?? null,
    quantita_disponibile: row.quantita_disponibile ?? null,
    stato_condizione: parseStatoCondizione(row.stato_condizione),
    seo_title: row.seo_title ?? null,
    seo_description: row.seo_description ?? null,
    alt_text_immagine: row.alt_text_immagine ?? null,
    attivo: row.attivo ?? true,
    origine_pubblicazione: row.origine_pubblicazione ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

// =================================================================
// getMerchantStoresForUser — recupera i negozi di un utente
// Attualmente: query diretta su negozi.owner_user_id
// Nota: in futuro potrà essere estesa per supportare membri aggiuntivi
// =================================================================
export async function getMerchantStoresForUser(userId: string): Promise<MerchantQueryResult<MerchantStoreSummary[]>> {
  // Verifica del ruolo eseguita UNA volta: da qui si sceglie il client e il
  // filtro di proprietà (l'admin AUTORIZZATO vede TUTTI i negozi reali della
  // piattaforma, i commercianti solo i propri).
  const isAdmin = await utenteAdminAutorizzatoCorrente(userId);

  // Admin: TUTTI i negozi reali non eliminati, inclusi quelli con is_demo
  // (la lista "Gestione Negozi" li mostra, quindi devono essere modificabili).
  // Commerciante: solo i propri.
  let esito: {
    data: (MerchantStoreSummary & { slug: string | null })[] | null;
    error: { code?: string; message?: string } | null;
  };

  if (isAdmin) {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("negozi")
      .select("id, nome, categoria, descrizione, attivo, slug")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    esito = {
      data: (data ?? []) as (MerchantStoreSummary & { slug: string | null })[],
      error,
    };
  } else {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("negozi")
      .select("id, nome, categoria, descrizione, attivo")
      .is("deleted_at", null)
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: true });
    esito = {
      data: (data ?? []) as (MerchantStoreSummary & { slug: string | null })[],
      error,
    };
  }

  const { data: stores, error } = esito;
  const storesFiltrati = (stores ?? []) as NegozioRow[];

  if (error) {
    if (isSchemaError(error)) {
      return {
        data: [],
        setupRequired: true,
        errorMessage: "La configurazione del database per l'area amministratore non è completa. Contatta l'amministratore.",
      };
    }

    return {
      data: [],
      setupRequired: false,
      errorMessage: error.message ?? "Impossibile recuperare i negozi.",
    };
  }

  return {
    data: storesFiltrati.map(mapStore),
    setupRequired: false,
    errorMessage: null,
  };
}

// =================================================================
// getMerchantStoreForUser — recupera un singolo negozio se di proprietà
// =================================================================
export async function getMerchantStoreForUser(userId: string, negozioId: string) {
  const storesResult = await getMerchantStoresForUser(userId);
  const store = storesResult.data.find((item) => item.id === negozioId) ?? null;

  return {
    ...storesResult,
    data: store,
  };
}

// =================================================================
// canManageStore — verifica se l'utente può gestire un negozio
// =================================================================
export async function canManageStore(userId: string, negozioId: string): Promise<boolean> {
  // L'admin AUTORIZZATO può gestire QUALSIASI negozio della piattaforma.
  if (await utenteAdminAutorizzatoCorrente(userId)) return true;

  const supabase = await createServerSupabaseClient();
  const { count, error } = await supabase
    .from("negozi")
    .select("id", { head: true, count: "exact" })
    .eq("id", negozioId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error || !count || count === 0) return false;
  return true;
}

export async function getSlugNegozioGestibile(userId: string, negozioId: string): Promise<string | null> {
  const isAdmin = await utenteAdminAutorizzatoCorrente(userId);
  const supabase = isAdmin
    ? createAdminSupabaseClient()
    : await createServerSupabaseClient();

  const query = supabase
    .from("negozi")
    .select("slug")
    .eq("id", negozioId)
    .is("deleted_at", null);

  if (!isAdmin) {
    query.eq("owner_user_id", userId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error || !data) return null;
  const slug = (data as Record<string, unknown>).slug as string | null;
  return slug && slug.trim() ? slug.trim() : null;
}

// =================================================================
// Prodotti — CRUD
// =================================================================

export async function getMerchantProductsForStore(
  userId: string,
  negozioId: string
): Promise<MerchantQueryResult<MerchantProduct[]>> {
  const storeResult = await getMerchantStoreForUser(userId, negozioId);

  if (storeResult.setupRequired || !storeResult.data) {
    return {
      data: [],
      setupRequired: storeResult.setupRequired,
      errorMessage: storeResult.errorMessage,
    };
  }

  const supabase = await getDbForUser(userId);
  const query = await supabase
    .from("prodotti")
    .select(
      "id, negozio_id, nome, descrizione, descrizione_completa, categoria, sottocategoria, marca, colore, materiale, caratteristiche, peso_volume, parole_chiave, filtri_catalogo, prezzo, prezzo_suggerito, immagine_principale, quantita_disponibile, stato_condizione, seo_title, seo_description, alt_text_immagine, attivo, origine_pubblicazione, created_at, updated_at"
    )
    .eq("negozio_id", negozioId)
    .order("created_at", { ascending: false });

  if (query.error && isSchemaError(query.error)) {
    const fallbackQuery = await supabase
      .from("prodotti")
      .select("id, negozio_id, nome, descrizione, categoria, prezzo, immagine_principale")
      .eq("negozio_id", negozioId);

    if (fallbackQuery.error) {
      return {
        data: [],
        setupRequired: false,
        errorMessage: fallbackQuery.error.message ?? "Impossibile recuperare i prodotti del negozio.",
      };
    }

    return {
      data: ((fallbackQuery.data ?? []) as ProdottoRow[]).map(mapProduct),
      setupRequired: false,
      errorMessage: null,
    };
  }

  if (query.error) {
    return {
      data: [],
      setupRequired: false,
      errorMessage: query.error.message ?? "Impossibile recuperare i prodotti del negozio.",
    };
  }

  return {
    data: ((query.data ?? []) as ProdottoRow[]).map(mapProduct),
    setupRequired: false,
    errorMessage: null,
  };
}

export async function getMerchantProductForStore(userId: string, negozioId: string, productId: string) {
  const productsResult = await getMerchantProductsForStore(userId, negozioId);
  const found = productsResult.data.find((item) => item.id === productId) ?? null;

  return {
    ...productsResult,
    data: found,
  };
}

export async function createMerchantProductForStore(
  userId: string,
  negozioId: string,
  input: MerchantProductInput
): Promise<MerchantQueryResult<MerchantProduct | null>> {
  const storeResult = await getMerchantStoreForUser(userId, negozioId);

  if (storeResult.setupRequired || !storeResult.data) {
    return {
      data: null,
      setupRequired: storeResult.setupRequired,
      errorMessage: storeResult.errorMessage ?? "Negozio non disponibile per questo venditore.",
    };
  }

  const supabase = await getDbForUser(userId);

  const immagineFinale =
    input.immaginePrincipale.trim()
      ? await uploadDataUrlToStorage(input.immaginePrincipale.trim())
      : null;

  const payload: Record<string, unknown> = {
    negozio_id: negozioId,
    nome: input.nome.trim(),
    slug: await generaSlugUnivoco("prodotti", input.nome.trim()),
    descrizione: input.descrizione.trim(),
    categoria: input.categoria.trim(),
    sottocategoria: input.sottocategoria?.trim() || null,
    marca: input.marca?.trim() || null,
    colore: input.colore?.trim() || null,
    materiale: input.materiale?.trim() || null,
    parole_chiave: input.paroleChiave ?? null,
    prezzo: input.prezzo,
    prezzo_suggerito: input.prezzoSuggerito ?? null,
    immagine_principale: immagineFinale,
    quantita_disponibile: input.quantitaDisponibile ?? 1,
    stato_condizione: input.statoCondizione ?? null,
    attivo: input.attivo,
    origine_pubblicazione: input.originePubblicazione?.trim() || "manuale",
  };

  if (input.descrizioneCompleta !== undefined) payload.descrizione_completa = input.descrizioneCompleta.trim() || null;
  if (input.caratteristiche !== undefined) payload.caratteristiche = input.caratteristiche;
  if (input.pesoVolume !== undefined) payload.peso_volume = input.pesoVolume.trim() || null;
  if (input.filtriCatalogo !== undefined) payload.filtri_catalogo = input.filtriCatalogo;
  if (input.seoTitle !== undefined) payload.seo_title = input.seoTitle.trim() || null;
  if (input.seoDescription !== undefined) payload.seo_description = input.seoDescription.trim() || null;
  if (input.altTextImmagine !== undefined) payload.alt_text_immagine = input.altTextImmagine.trim() || null;

  const insertResult = await supabase.from("prodotti").insert(payload).select("*").single();

  if (insertResult.error && isSchemaError(insertResult.error)) {
    const fallbackResult = await supabase
      .from("prodotti")
      .insert({
        negozio_id: negozioId,
        nome: input.nome.trim(),
        slug: await generaSlugUnivoco("prodotti", input.nome.trim()),
        descrizione: input.descrizione.trim(),
        categoria: input.categoria.trim(),
        prezzo: input.prezzo,
      })
      .select("*")
      .single();

    if (fallbackResult.error) {
      return {
        data: null,
        setupRequired: false,
        errorMessage: fallbackResult.error.message ?? "Impossibile creare il prodotto.",
      };
    }

    return {
      data: mapProduct(fallbackResult.data as ProdottoRow),
      setupRequired: false,
      errorMessage: null,
    };
  }

  if (insertResult.error) {
    return {
      data: null,
      setupRequired: false,
      errorMessage: insertResult.error.message ?? "Impossibile creare il prodotto.",
    };
  }

  return {
    data: mapProduct(insertResult.data as ProdottoRow),
    setupRequired: false,
    errorMessage: null,
  };
}

export async function updateMerchantProductForStore(
  userId: string,
  negozioId: string,
  productId: string,
  input: MerchantProductInput
): Promise<MerchantQueryResult<MerchantProduct | null>> {
  const storeResult = await getMerchantStoreForUser(userId, negozioId);

  if (storeResult.setupRequired || !storeResult.data) {
    return {
      data: null,
      setupRequired: storeResult.setupRequired,
      errorMessage: storeResult.errorMessage ?? "Negozio non disponibile per questo venditore.",
    };
  }

  const supabase = await getDbForUser(userId);

  const immagineFinale =
    input.immaginePrincipale.trim()
      ? await uploadDataUrlToStorage(input.immaginePrincipale.trim())
      : null;

  const payload: Record<string, unknown> = {
    nome: input.nome.trim(),
    descrizione: input.descrizione.trim(),
    categoria: input.categoria.trim(),
    sottocategoria: input.sottocategoria?.trim() || null,
    marca: input.marca?.trim() || null,
    colore: input.colore?.trim() || null,
    materiale: input.materiale?.trim() || null,
    parole_chiave: input.paroleChiave ?? null,
    prezzo: input.prezzo,
    prezzo_suggerito: input.prezzoSuggerito ?? null,
    immagine_principale: immagineFinale,
    quantita_disponibile: input.quantitaDisponibile ?? 1,
    stato_condizione: input.statoCondizione ?? null,
    attivo: input.attivo,
    origine_pubblicazione: input.originePubblicazione?.trim() || "manuale",
  };

  if (input.descrizioneCompleta !== undefined) payload.descrizione_completa = input.descrizioneCompleta.trim() || null;
  if (input.caratteristiche !== undefined) payload.caratteristiche = input.caratteristiche;
  if (input.pesoVolume !== undefined) payload.peso_volume = input.pesoVolume.trim() || null;
  if (input.filtriCatalogo !== undefined) payload.filtri_catalogo = input.filtriCatalogo;
  if (input.seoTitle !== undefined) payload.seo_title = input.seoTitle.trim() || null;
  if (input.seoDescription !== undefined) payload.seo_description = input.seoDescription.trim() || null;
  if (input.altTextImmagine !== undefined) payload.alt_text_immagine = input.altTextImmagine.trim() || null;

  const updateResult = await supabase
    .from("prodotti")
    .update(payload)
    .eq("id", productId)
    .eq("negozio_id", negozioId)
    .select("*")
    .single();

  if (updateResult.error) {
    return {
      data: null,
      setupRequired: false,
      errorMessage: updateResult.error.message ?? "Impossibile aggiornare il prodotto.",
    };
  }

  return {
    data: mapProduct(updateResult.data as ProdottoRow),
    setupRequired: false,
    errorMessage: null,
  };
}

export async function deleteMerchantProductForStore(
  userId: string,
  negozioId: string,
  productId: string
): Promise<MerchantQueryResult<null>> {
  const storeResult = await getMerchantStoreForUser(userId, negozioId);

  if (storeResult.setupRequired || !storeResult.data) {
    return {
      data: null,
      setupRequired: storeResult.setupRequired,
      errorMessage: storeResult.errorMessage ?? "Negozio non disponibile per questo venditore.",
    };
  }

  const supabase = createAdminSupabaseClient();

  const { error } = await supabase
    .from("prodotti")
    .delete()
    .eq("id", productId)
    .eq("negozio_id", negozioId);

  if (error) {
    return {
      data: null,
      setupRequired: false,
      errorMessage: error.message ?? "Impossibile eliminare il prodotto.",
    };
  }

  return {
    data: null,
    setupRequired: false,
    errorMessage: null,
  };
}

export async function deleteMerchantStore(
  userId: string,
  negozioId: string
): Promise<MerchantQueryResult<null>> {
  const storeResult = await getMerchantStoreForUser(userId, negozioId);

  if (storeResult.setupRequired || !storeResult.data) {
    return {
      data: null,
      setupRequired: storeResult.setupRequired,
      errorMessage: storeResult.errorMessage ?? "Negozio non disponibile per questo venditore.",
    };
  }

  const supabase = createAdminSupabaseClient();

  // Soft delete: il negozio viene spostato nel Cestino (deleted_at).
  // Prodotti, media e immagini NON vengono eliminati.
  const { error } = await supabase
    .from("negozi")
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq("id", negozioId)
    .eq("owner_user_id", userId);

  if (error) {
    return {
      data: null,
      setupRequired: false,
      errorMessage: error.message ?? "Impossibile eliminare il negozio.",
    };
  }

  return {
    data: null,
    setupRequired: false,
    errorMessage: null,
  };
}
