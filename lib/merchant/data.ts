import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteImageFromStorage, uploadDataUrlToStorage } from "@/lib/supabase/storage";
import { generaSlugUnivoco } from "@/lib/slug-server";
import { getCurrentUser } from "@/lib/auth/session";
import { utenteAdminAutorizzato } from "@/lib/auth/roles";
import type {
  AttributiVariante,
  ConfigPaccoSpedizione,
  MerchantProduct,
  MerchantProductInput,
  MerchantQueryResult,
  MerchantRole,
  MerchantStoreSummary,
  MetodoSpedizioneNegozioInput,
  ProductQueryOptions,
  VarianteProdotto,
  VarianteProdottoInput,
} from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  peso_grammi?: number | null;
  costo_spedizione_locale?: number | null;
  parole_chiave?: string[] | null;
  filtri_catalogo?: Record<string, string> | null;
  prezzo?: number | string | null;
  prezzo_suggerito?: number | null;
  immagine_principale?: string | null;
  quantita_disponibile?: number | null;
  quantita_riservata?: number | null;
  ha_varianti?: boolean | null;
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

// Colonna usata per SELECT dei prodotti merchant (lista + patch parziale):
// costante condivisa per evitare drift tra le due query.
const SELECT_COLONNE_PRODOTTO =
  "id, negozio_id, nome, descrizione, descrizione_completa, categoria, sottocategoria, marca, colore, materiale, caratteristiche, peso_volume, peso_grammi, costo_spedizione_locale, parole_chiave, filtri_catalogo, prezzo, prezzo_suggerito, immagine_principale, quantita_disponibile, quantita_riservata, ha_varianti, stato_condizione, seo_title, seo_description, alt_text_immagine, attivo, origine_pubblicazione, created_at, updated_at";

// Colonne delle varianti prodotto (Fase E2).
const SELECT_COLONNE_VARIANTE =
  "id, prodotto_id, nome, attributi, prezzo, quantita_disponibile, quantita_riservata, immagine_principale, attivo, created_at, updated_at";

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
    peso_grammi: row.peso_grammi ?? null,
    costo_spedizione_locale: row.costo_spedizione_locale ?? null,
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
    quantita_riservata: row.quantita_riservata ?? null,
    ha_varianti: row.ha_varianti ?? false,
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
// Configurazione PACCO / SPEDIZIONE del negozio (V1: un pacco per ordine)
// =================================================================

const SELECT_CAMPI_PACCO =
  "id, pacco_peso_grammi, pacco_lunghezza_cm, pacco_larghezza_cm, pacco_altezza_cm, pacco_peso_max_grammi";

function mapConfigPacco(row: Record<string, unknown> | null | undefined): ConfigPaccoSpedizione {
  return {
    paccoPesoGrammi: (row?.pacco_peso_grammi as number | null) ?? null,
    paccoLunghezzaCm: (row?.pacco_lunghezza_cm as number | null) ?? null,
    paccoLarghezzaCm: (row?.pacco_larghezza_cm as number | null) ?? null,
    paccoAltezzaCm: (row?.pacco_altezza_cm as number | null) ?? null,
    paccoPesoMaxGrammi: (row?.pacco_peso_max_grammi as number | null) ?? null,
  };
}

/** Legge la configurazione pacco del negozio (null se non accessibile). */
export async function getConfigPaccoSpedizione(
  userId: string,
  negozioId: string
): Promise<ConfigPaccoSpedizione | null> {
  const puòGestire = await canManageStore(userId, negozioId);
  if (!puòGestire) return null;

  const supabase = await getDbForUser(userId);
  const { data, error } = await supabase
    .from("negozi")
    .select(SELECT_CAMPI_PACCO)
    .eq("id", negozioId)
    .maybeSingle();

  if (error || !data) return null;
  return mapConfigPacco(data as Record<string, unknown>);
}

/** Aggiorna la configurazione pacco del negozio (solo ownership verificata). */
export async function updateConfigPaccoSpedizione(
  userId: string,
  negozioId: string,
  input: ConfigPaccoSpedizione
): Promise<{ ok: boolean; data?: ConfigPaccoSpedizione | null; errore?: string }> {
  const puòGestire = await canManageStore(userId, negozioId);
  if (!puòGestire) return { ok: false, errore: "Non puoi gestire questo negozio." };

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("negozi")
    .update({
      pacco_peso_grammi: input.paccoPesoGrammi,
      pacco_lunghezza_cm: input.paccoLunghezzaCm,
      pacco_larghezza_cm: input.paccoLarghezzaCm,
      pacco_altezza_cm: input.paccoAltezzaCm,
      pacco_peso_max_grammi: input.paccoPesoMaxGrammi,
      updated_at: new Date().toISOString(),
    })
    .eq("id", negozioId)
    .select(SELECT_CAMPI_PACCO)
    .single();

  if (error) {
    return { ok: false, errore: error.message ?? "Impossibile salvare la configurazione." };
  }
  return { ok: true, data: mapConfigPacco(data as Record<string, unknown>) };
}

// =================================================================
// Metodi/servizi di spedizione ATTIVI per negozio
// =================================================================

/** Legge i servizi di spedizione configurati dal negozio (null se non accessibile). */
export async function getMetodiSpedizioneNegozio(
  userId: string,
  negozioId: string
): Promise<
  | Array<{
      carrier: string;
      servizio: string;
      attivo: boolean;
      spedizione_gratuita: boolean;
      ordine_mostra: number;
    }>
  | null
> {
  const puòGestire = await canManageStore(userId, negozioId);
  if (!puòGestire) return null;

  const supabase = await getDbForUser(userId);
  const { data, error } = await supabase
    .from("negozio_metodi_spedizione")
    .select("carrier, servizio, attivo, spedizione_gratuita, ordine_mostra")
    .eq("negozio_id", negozioId)
    .order("ordine_mostra", { ascending: true });

  if (error) return null;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    carrier: String(r.carrier),
    servizio: String(r.servizio),
    attivo: r.attivo === true,
    spedizione_gratuita: r.spedizione_gratuita === true,
    ordine_mostra: Number(r.ordine_mostra ?? 0),
  }));
}

/**
 * Upsert dei servizi di spedizione attivi del negozio (scrittura via
 * service_role, come il pattern negozio_metodi_pagamento). Fail-closed:
 * solo i servizi presenti nell'input vengono attivati/disattivati.
 */
export async function updateMetodiSpedizioneNegozio(
  userId: string,
  negozioId: string,
  metodi: MetodoSpedizioneNegozioInput[]
): Promise<{ ok: boolean; errore?: string }> {
  const puòGestire = await canManageStore(userId, negozioId);
  if (!puòGestire) return { ok: false, errore: "Non puoi gestire questo negozio." };

  const supabase = createAdminSupabaseClient();
  for (const m of metodi) {
    const { error } = await supabase.from("negozio_metodi_spedizione").upsert(
      {
        negozio_id: negozioId,
        carrier: m.carrier,
        servizio: m.servizio,
        attivo: m.attivo === true,
        spedizione_gratuita: m.spedizione_gratuita === true,
        ordine_mostra: m.ordine_mostra,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "negozio_id,carrier,servizio" }
    );
    if (error) {
      return {
        ok: false,
        errore: error.message ?? "Impossibile salvare i metodi di spedizione.",
      };
    }
  }
  return { ok: true };
}

// =================================================================
// utentePossiedeNegozio — l'utente è il PROPRIETARIO del negozio
// =================================================================
/**
 * True se l'utente è il PROPRIETARIO del negozio (negozi.owner_user_id).
 * Differisce da canManageStore: qui l'admin AUTORIZZATO NON viene mai
 * considerato proprietario (può gestire qualsiasi negozio, ma non è il
 * titolare). Usata per il blocco dell'auto-acquisto del venditore: un
 * venditore può acquistare dai negozi altrui, mai dal PROPRIO.
 */
export async function utentePossiedeNegozio(
  userId: string,
  negozioId: string
): Promise<boolean> {
  if (!userId || !negozioId) return false;
  const supabase = createAdminSupabaseClient();
  const { count, error } = await supabase
    .from("negozi")
    .select("id", { head: true, count: "exact" })
    .eq("id", negozioId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);
  if (error) return false;
  return Boolean(count && count > 0);
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
  negozioId: string,
  opts: ProductQueryOptions = {}
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

  // Backward compatibility: senza parametri la query è identica a prima
  // (tutti i prodotti, ordinati per created_at desc, senza paginazione).
  const termine = opts.q?.trim() ?? "";
  // Neutralizza wildcard ilike e caratteri speciali della sintassi .or()
  // di PostgREST (virgola separa i predicati; parentesi/percentuale/underscore
  // hanno significato), poi normalizza gli spazi.
  const pulito = termine ? termine.replace(/[%_(),]/g, " ").replace(/\s+/g, " ").trim() : "";
  const conFiltri =
    termine.length > 0 ||
    opts.stato !== undefined ||
    opts.ai === true ||
    opts.esaurito === true ||
    opts.ordina !== undefined ||
    opts.pagina !== undefined ||
    opts.perPagina !== undefined;

  let query = supabase
    .from("prodotti")
    .select(SELECT_COLONNE_PRODOTTO, conFiltri ? { count: "exact" } : undefined)
    .eq("negozio_id", negozioId);

  // ── Filtri ────────────────────────────────────────────────────────────
  if (opts.stato === "attivo") query = query.eq("attivo", true);
  else if (opts.stato === "bozza") query = query.eq("attivo", false);

  if (opts.ai) query = query.eq("origine_pubblicazione", "ai");

  // Esaurito = disponibilità reale <= 0. Oggi quantita_riservata è sempre 0
  // (colonna riservata al futuro flusso pagamenti/riserva stock), quindi il
  // filtro server-side coincide con quantita_disponibile <= 0 (il NULL resta
  // escluso: quantità non tracciata = disponibile).
  if (opts.esaurito) query = query.lte("quantita_disponibile", 0);

  if (pulito) {
    query = query.or(
      `nome.ilike.%${pulito}%,descrizione.ilike.%${pulito}%,categoria.ilike.%${pulito}%,sottocategoria.ilike.%${pulito}%,marca.ilike.%${pulito}%`
    );
  }

  // ── Ordinamento ───────────────────────────────────────────────────────
  switch (opts.ordina) {
    case "vecchi":
      query = query.order("created_at", { ascending: true });
      break;
    case "prezzo_asc":
      query = query.order("prezzo", { ascending: true });
      break;
    case "prezzo_desc":
      query = query.order("prezzo", { ascending: false });
      break;
    case "nome_asc":
      query = query.order("nome", { ascending: true });
      break;
    case "nome_desc":
      query = query.order("nome", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  // ── Paginazione (range inclusivo [from, to]) ──────────────────────────
  const perPagina = opts.perPagina && opts.perPagina > 0 ? opts.perPagina : undefined;
  const pagina = opts.pagina && opts.pagina > 0 ? opts.pagina : undefined;
  if (perPagina && pagina) {
    const from = (pagina - 1) * perPagina;
    query = query.range(from, from + perPagina - 1);
  }

  const { data, count, error } = await query;
  const total = typeof count === "number" ? count : undefined;

  // PostgREST risponde 416 (range non soddisfacibile) quando la pagina
  // richiesta supera l'ultima riga (es. ?pagina=99): restituiamo una pagina
  // vuota con il totale corretto invece di un errore, così il chiamante può
  // redirigere all'ultima pagina valida.
  if (error && perPagina && pagina && (error.code === "PGRST103" || /range/i.test(error.message ?? ""))) {
    let countQuery = supabase
      .from("prodotti")
      .select("id", { head: true, count: "exact" })
      .eq("negozio_id", negozioId);
    if (opts.stato === "attivo") countQuery = countQuery.eq("attivo", true);
    else if (opts.stato === "bozza") countQuery = countQuery.eq("attivo", false);
    if (opts.ai) countQuery = countQuery.eq("origine_pubblicazione", "ai");
    if (opts.esaurito) countQuery = countQuery.lte("quantita_disponibile", 0);
    if (pulito) {
      countQuery = countQuery.or(
        `nome.ilike.%${pulito}%,descrizione.ilike.%${pulito}%,categoria.ilike.%${pulito}%,sottocategoria.ilike.%${pulito}%,marca.ilike.%${pulito}%`
      );
    }
    const { count: totalCount } = await countQuery;
    return {
      data: [],
      setupRequired: false,
      errorMessage: null,
      total: typeof totalCount === "number" ? totalCount : 0,
    };
  }

  if (error && isSchemaError(error)) {
    // DB legacy senza le colonne arricchite: fallback minimale (senza filtri).
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
      total: total ?? (fallbackQuery.data ?? []).length,
    };
  }

  if (error) {
    return {
      data: [],
      setupRequired: false,
      errorMessage: error.message ?? "Impossibile recuperare i prodotti del negozio.",
    };
  }

  return {
    data: ((data ?? []) as ProdottoRow[]).map(mapProduct),
    setupRequired: false,
    errorMessage: null,
    total,
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
  if (input.pesoGrammi !== undefined) payload.peso_grammi = input.pesoGrammi;
  if (input.costoSpedizioneLocale !== undefined) payload.costo_spedizione_locale = input.costoSpedizioneLocale;
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
  if (input.pesoGrammi !== undefined) payload.peso_grammi = input.pesoGrammi;
  if (input.costoSpedizioneLocale !== undefined) payload.costo_spedizione_locale = input.costoSpedizioneLocale;
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

// =================================================================
// Operatività catalogo (Fase D) — patch rapida + azioni bulk
// =================================================================

/**
 * Aggiornamento PARZIALE di un singolo prodotto (solo i campi forniti).
 * Usato per la modifica rapida di quantità/attivo dalla lista prodotti.
 * Ownership verificata come per il resto del CRUD.
 */
export async function patchMerchantProductForStore(
  userId: string,
  negozioId: string,
  productId: string,
  patch: {
    quantitaDisponibile?: number | null;
    attivo?: boolean;
  }
): Promise<MerchantQueryResult<MerchantProduct | null>> {
  const storeResult = await getMerchantStoreForUser(userId, negozioId);

  if (storeResult.setupRequired || !storeResult.data) {
    return {
      data: null,
      setupRequired: storeResult.setupRequired,
      errorMessage: storeResult.errorMessage ?? "Negozio non disponibile per questo venditore.",
    };
  }

  const payload: Record<string, unknown> = {};
  if (patch.quantitaDisponibile !== undefined) payload.quantita_disponibile = patch.quantitaDisponibile;
  if (patch.attivo !== undefined) payload.attivo = patch.attivo;

  if (Object.keys(payload).length === 0) {
    return {
      data: null,
      setupRequired: false,
      errorMessage: "Nessun campo da aggiornare.",
    };
  }

  const supabase = await getDbForUser(userId);

  const { data, error } = await supabase
    .from("prodotti")
    .update(payload)
    .eq("id", productId)
    .eq("negozio_id", negozioId)
    .select(SELECT_COLONNE_PRODOTTO)
    .single();

  if (error) {
    return {
      data: null,
      setupRequired: false,
      errorMessage: error.message ?? "Impossibile aggiornare il prodotto.",
    };
  }

  return {
    data: mapProduct(data as ProdottoRow),
    setupRequired: false,
    errorMessage: null,
  };
}

/**
 * Aggiornamento BULK dei prodotti selezionati (attiva/disattiva, quantità).
 * Ownership: update limitato a negozio_id + id IN (ids): nessun accesso
 * cross-negozio possibile. Ritorna l'elenco degli id aggiornati.
 */
export async function bulkUpdateMerchantProductsForStore(
  userId: string,
  negozioId: string,
  ids: string[],
  patch: {
    attivo?: boolean;
    quantitaDisponibile?: number | null;
  }
): Promise<MerchantQueryResult<string[]>> {
  const storeResult = await getMerchantStoreForUser(userId, negozioId);

  if (storeResult.setupRequired || !storeResult.data) {
    return {
      data: [],
      setupRequired: storeResult.setupRequired,
      errorMessage: storeResult.errorMessage ?? "Negozio non disponibile per questo venditore.",
    };
  }

  if (ids.length === 0) {
    return { data: [], setupRequired: false, errorMessage: "Nessun prodotto selezionato." };
  }

  const payload: Record<string, unknown> = {};
  if (patch.attivo !== undefined) payload.attivo = patch.attivo;
  if (patch.quantitaDisponibile !== undefined) payload.quantita_disponibile = patch.quantitaDisponibile;

  if (Object.keys(payload).length === 0) {
    return { data: [], setupRequired: false, errorMessage: "Nessun campo da aggiornare." };
  }

  const supabase = await getDbForUser(userId);

  const { data, error } = await supabase
    .from("prodotti")
    .update(payload)
    .eq("negozio_id", negozioId)
    .in("id", ids)
    .select("id");

  if (error) {
    return {
      data: [],
      setupRequired: false,
      errorMessage: error.message ?? "Impossibile aggiornare i prodotti.",
    };
  }

  return {
    data: ((data ?? []) as { id: string }[]).map((r) => String(r.id)),
    setupRequired: false,
    errorMessage: null,
  };
}

/**
 * Eliminazione BULK dei prodotti selezionati (con controllo negozio).
 * Best-effort per le immagini nello Storage: un errore di storage NON
 * impedisce l'eliminazione della riga (stesso pattern del DELETE singolo).
 */
export async function bulkDeleteMerchantProductsForStore(
  userId: string,
  negozioId: string,
  ids: string[]
): Promise<MerchantQueryResult<{ eliminati: number }>> {
  const storeResult = await getMerchantStoreForUser(userId, negozioId);

  if (storeResult.setupRequired || !storeResult.data) {
    return {
      data: { eliminati: 0 },
      setupRequired: storeResult.setupRequired,
      errorMessage: storeResult.errorMessage ?? "Negozio non disponibile per questo venditore.",
    };
  }

  if (ids.length === 0) {
    return { data: { eliminati: 0 }, setupRequired: false, errorMessage: "Nessun prodotto selezionato." };
  }

  // Recupera le immagini da ripulire PRIMA del delete (solo di questo negozio).
  const supabase = createAdminSupabaseClient();
  const { data: daEliminare } = await supabase
    .from("prodotti")
    .select("immagine_principale")
    .eq("negozio_id", negozioId)
    .in("id", ids);

  const { count, error } = await supabase
    .from("prodotti")
    .delete()
    .eq("negozio_id", negozioId)
    .in("id", ids);

  if (error) {
    return {
      data: { eliminati: 0 },
      setupRequired: false,
      errorMessage: error.message ?? "Impossibile eliminare i prodotti.",
    };
  }

  // Best-effort: se la rimozione delle immagini fallisce il dato è già
  // eliminato; l'immagine orfana verrà ripulita da un passaggio successivo.
  if (!error && (daEliminare ?? []).length > 0) {
    await Promise.allSettled(
      (daEliminare ?? [])
        .map((r) => (r as { immagine_principale?: string | null }).immagine_principale)
        .filter(Boolean)
        .map((img) => deleteImageFromStorage(img as string))
    );
  }

  return {
    data: { eliminati: count ?? ids.length },
    setupRequired: false,
    errorMessage: null,
  };
}

// =================================================================
// Varianti prodotto (Fase E2) — CRUD merchant
// =================================================================
// La tabella public.prodotto_varianti e il trigger di aggregazione
// (aggiorna_prodotto_da_varianti, migration 20260821) gestiscono in modo
// atomico prezzo/stock del prodotto padre per i prodotti con ha_varianti.
// Queste funzioni NON aggiornano mai manualmente gli aggregati: il trigger
// lo fa. Dopo ogni mutazione l'aggregazione viene VERIFICATA rileggendo
// il prodotto (specchio fedele del trigger SQL).

type VarianteRow = {
  id: string;
  prodotto_id?: string | number | null;
  nome?: string | null;
  attributi?: AttributiVariante | null;
  prezzo?: number | string | null;
  quantita_disponibile?: number | null;
  quantita_riservata?: number | null;
  immagine_principale?: string | null;
  attivo?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function mapVariante(row: VarianteRow): VarianteProdotto {
  return {
    id: String(row.id),
    prodotto_id: String(row.prodotto_id ?? ""),
    nome: row.nome ?? null,
    attributi: row.attributi ?? {},
    prezzo:
      typeof row.prezzo === "number"
        ? row.prezzo
        : typeof row.prezzo === "string"
          ? Number(row.prezzo)
          : null,
    quantita_disponibile: Number(row.quantita_disponibile ?? 0),
    quantita_riservata: Number(row.quantita_riservata ?? 0),
    immagine_principale: row.immagine_principale ?? null,
    attivo: row.attivo ?? true,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

/**
 * Verifica SOLO l'esistenza di un negozio (senza ownership): serve alle
 * route per distinguere "negozio inesistente" (404) da "negozio di un
 * altro venditore" (403). L'accesso resta comunque bloccato da
 * getMerchantStoreForUser/is_merchant_for_store.
 */
export async function negozioEsiste(negozioId: string): Promise<boolean> {
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase.from("negozi").select("id").eq("id", negozioId).maybeSingle();
  return Boolean(data);
}

/** Aggregati attesi = specchio del trigger SQL E1 (solo varianti attive). */
async function aggregatiAttesiProdotto(
  supabase: SupabaseClient,
  productId: string
): Promise<{ minPrezzo: number | null; sommaQta: number; sommaRis: number }> {
  const { data } = await supabase
    .from("prodotto_varianti")
    .select("prezzo, quantita_disponibile, quantita_riservata, attivo")
    .eq("prodotto_id", productId);

  const attive = (data ?? []).filter((v) => v.attivo !== false);
  const prezzi = attive
    .map((v) => v.prezzo)
    .filter((p): p is number => typeof p === "number" && !Number.isNaN(p));
  const minPrezzo = prezzi.length > 0 ? Math.min(...prezzi) : null;
  const sommaQta = attive.reduce((acc, v) => acc + (Number(v.quantita_disponibile) || 0), 0);
  const sommaRis = attive.reduce((acc, v) => acc + (Number(v.quantita_riservata) || 0), 0);
  return { minPrezzo, sommaQta, sommaRis };
}

/**
 * Verifica che il trigger E1 abbia aggiornato il prodotto come atteso:
 *   prezzo              = MIN(prezzo) varianti attive, se nessuna attiva ha
 *                         un prezzo → resta il prezzo padre (prezzoPre);
 *   quantita_disponibile = SUM(qta) varianti attive (0 se nessuna attiva).
 * Ritorna anche il prodotto aggiornato (per la risposta API).
 */
async function verificaAggregazioneProdotto(
  supabase: SupabaseClient,
  productId: string,
  prezzoPre: number | null
): Promise<{ ok: boolean; prodotto: ProdottoRow | null }> {
  const attesi = await aggregatiAttesiProdotto(supabase, productId);

  const { data } = await supabase
    .from("prodotti")
    .select(SELECT_COLONNE_PRODOTTO)
    .eq("id", productId)
    .maybeSingle();

  if (!data) return { ok: false, prodotto: null };
  const prodotto = data as ProdottoRow;

  const prezzoReale =
    typeof prodotto.prezzo === "string"
      ? Number(prodotto.prezzo)
      : (prodotto.prezzo ?? null);
  const prezzoAtteso = attesi.minPrezzo !== null ? attesi.minPrezzo : prezzoPre;
  const prezzoOk =
    prezzoReale === null && prezzoAtteso === null
      ? true
      : prezzoReale !== null &&
        prezzoAtteso !== null &&
        Math.abs(prezzoReale - prezzoAtteso) < 0.005;

  // Il trigger scrive SEMPRE un numero sulle colonne stock dei prodotti con
  // varianti: un NULL qui significa che il trigger NON è scattato → mismatch
  // (evita falsi positivi quando la somma attesa è 0).
  const qtaReale = prodotto.quantita_disponibile;
  const qtaOk = typeof qtaReale === "number" && qtaReale === attesi.sommaQta;

  return { ok: prezzoOk && qtaOk, prodotto };
}

/**
 * Verifica di proprietà prodotto+negozio usata da TUTTE le funzioni varianti:
 * NON si fida mai di negozioId/productId inviati dal client per autorizzare.
 */
async function verificaProdottoGestibile(
  userId: string,
  negozioId: string,
  productId: string
): Promise<MerchantQueryResult<MerchantProduct | null>> {
  const storeResult = await getMerchantStoreForUser(userId, negozioId);

  if (storeResult.setupRequired || !storeResult.data) {
    return {
      data: null,
      setupRequired: storeResult.setupRequired,
      errorMessage: storeResult.errorMessage ?? "Negozio non disponibile per questo venditore.",
    };
  }

  const productResult = await getMerchantProductForStore(userId, negozioId, productId);
  if (!productResult.data) {
    return {
      data: null,
      setupRequired: false,
      errorMessage: "Prodotto non trovato.",
      code: "PRODUCT_NOT_FOUND",
    };
  }

  return {
    data: productResult.data,
    setupRequired: false,
    errorMessage: null,
  };
}

/**
 * Recupera le varianti di un prodotto del negozio (ordine stabile:
 * created_at asc + id asc).
 */
export async function getVariantiForProduct(
  userId: string,
  negozioId: string,
  productId: string
): Promise<MerchantQueryResult<VarianteProdotto[]>> {
  const ownership = await verificaProdottoGestibile(userId, negozioId, productId);
  if (ownership.errorMessage) {
    return {
      data: [],
      setupRequired: ownership.setupRequired,
      errorMessage: ownership.errorMessage,
      code: ownership.code,
    };
  }

  const supabase = await getDbForUser(userId);

  const { data, error } = await supabase
    .from("prodotto_varianti")
    .select(SELECT_COLONNE_VARIANTE)
    .eq("prodotto_id", productId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return {
      data: [],
      setupRequired: false,
      errorMessage: error.message ?? "Impossibile recuperare le varianti.",
    };
  }

  return {
    data: ((data ?? []) as VarianteRow[]).map(mapVariante),
    setupRequired: false,
    errorMessage: null,
  };
}

/**
 * Crea una variante. Dopo la prima variante valida attiva products.ha_varianti
 * (PRIMA dell'insert, così il trigger E1 aggrega correttamente). Gli aggregati
 * prezzo/stock NON sono aggiornati manualmente: il trigger li aggiorna e la
 * funzione li verifica.
 */
export async function createVarianteForProduct(
  userId: string,
  negozioId: string,
  productId: string,
  input: VarianteProdottoInput
): Promise<MerchantQueryResult<{ variante: VarianteProdotto; prodotto: MerchantProduct } | null>> {
  const ownership = await verificaProdottoGestibile(userId, negozioId, productId);
  if (ownership.errorMessage) {
    return { data: null, setupRequired: ownership.setupRequired, errorMessage: ownership.errorMessage, code: ownership.code };
  }
  const prezzoPre = ownership.data!.prezzo;

  const supabase = await getDbForUser(userId);

  // Conteggio varianti pre-esistenti: necessario per attivare il flag solo
  // alla prima variante e per compensarlo se l'insert fallisce.
  const { count: conteggioPre } = await supabase
    .from("prodotto_varianti")
    .select("id", { head: true, count: "exact" })
    .eq("prodotto_id", productId);
  const haGiaVarianti = typeof conteggioPre === "number" && conteggioPre > 0;

  // Il trigger E1 aggrega SOLO con ha_varianti=true (nota operativa E1):
  // attiva il flag PRIMA dell'insert. Se il flag è già attivo è un no-op.
  if (!haGiaVarianti) {
    const { error: flagError } = await supabase
      .from("prodotti")
      .update({ ha_varianti: true })
      .eq("id", productId)
      .eq("negozio_id", negozioId);
    if (flagError) {
      return { data: null, setupRequired: false, errorMessage: flagError.message ?? "Impossibile attivare le varianti." };
    }
  }

  const payload: Record<string, unknown> = {
    prodotto_id: productId,
    nome: input.nome?.trim() || null,
    attributi: input.attributi ?? {},
    prezzo: input.prezzo ?? null,
    quantita_disponibile: input.quantitaDisponibile ?? 0,
    immagine_principale: input.immaginePrincipale?.trim() || null,
    attivo: input.attivo ?? true,
  };

  const { data: inserted, error } = await supabase
    .from("prodotto_varianti")
    .insert(payload)
    .select(SELECT_COLONNE_VARIANTE)
    .single();

  if (error) {
    // Compensa il flag appena attivato SOLO se il prodotto è davvero senza
    // varianti (evita di disattivare in caso di concorrenza).
    if (!haGiaVarianti) {
      const { count: conteggioPost } = await supabase
        .from("prodotto_varianti")
        .select("id", { head: true, count: "exact" })
        .eq("prodotto_id", productId);
      if (typeof conteggioPost === "number" && conteggioPost === 0) {
        await supabase
          .from("prodotti")
          .update({ ha_varianti: false })
          .eq("id", productId)
          .eq("negozio_id", negozioId);
      }
    }
    return {
      data: null,
      setupRequired: false,
      errorMessage: error.message ?? "Impossibile creare la variante.",
      code: error.code === "23505" ? "UNIQUE_CONFLICT" : undefined,
    };
  }

  const verifica = await verificaAggregazioneProdotto(supabase, productId, prezzoPre);
  if (!verifica.ok || !verifica.prodotto) {
    return {
      data: null,
      setupRequired: false,
      errorMessage: "L'aggregazione del trigger non è allineata al prodotto. Riprova o contatta l'assistenza.",
      code: "AGGREGATION_MISMATCH",
    };
  }

  return {
    data: { variante: mapVariante(inserted as VarianteRow), prodotto: mapProduct(verifica.prodotto) },
    setupRequired: false,
    errorMessage: null,
  };
}

/**
 * Aggiornamento PARZIALE di una variante (nome, attributi, prezzo, quantità,
 * immagine, attivo). quantita_riservata NON è mai aggiornabile dal merchant.
 */
export async function updateVarianteForProduct(
  userId: string,
  negozioId: string,
  productId: string,
  varianteId: string,
  input: Partial<VarianteProdottoInput>
): Promise<MerchantQueryResult<{ variante: VarianteProdotto; prodotto: MerchantProduct } | null>> {
  const ownership = await verificaProdottoGestibile(userId, negozioId, productId);
  if (ownership.errorMessage) {
    return { data: null, setupRequired: ownership.setupRequired, errorMessage: ownership.errorMessage, code: ownership.code };
  }
  const prezzoPre = ownership.data!.prezzo;

  const supabase = await getDbForUser(userId);

  // La variante deve esistere E appartenere al prodotto: nessuna variante di
  // un altro prodotto è raggiungibile anche fornendo un varianteId esterno.
  const { data: esistente, error: errEsistente } = await supabase
    .from("prodotto_varianti")
    .select("id")
    .eq("id", varianteId)
    .eq("prodotto_id", productId)
    .maybeSingle();

  if (errEsistente) {
    return { data: null, setupRequired: false, errorMessage: errEsistente.message ?? "Impossibile verificare la variante." };
  }
  if (!esistente) {
    return { data: null, setupRequired: false, errorMessage: "Variante non trovata.", code: "VARIANT_NOT_FOUND" };
  }

  const payload: Record<string, unknown> = {};
  if (input.nome !== undefined) payload.nome = input.nome?.trim() || null;
  if (input.attributi !== undefined) payload.attributi = input.attributi;
  if (input.prezzo !== undefined) payload.prezzo = input.prezzo;
  if (input.quantitaDisponibile !== undefined) payload.quantita_disponibile = input.quantitaDisponibile;
  if (input.immaginePrincipale !== undefined) payload.immagine_principale = input.immaginePrincipale?.trim() || null;
  if (input.attivo !== undefined) payload.attivo = input.attivo;
  // quantita_riservata: gestita dal sistema, mai dal merchant.

  if (Object.keys(payload).length === 0) {
    return { data: null, setupRequired: false, errorMessage: "Nessun campo da aggiornare.", code: "NO_FIELDS" };
  }

  const { data: updated, error } = await supabase
    .from("prodotto_varianti")
    .update(payload)
    .eq("id", varianteId)
    .eq("prodotto_id", productId)
    .select(SELECT_COLONNE_VARIANTE)
    .single();

  if (error) {
    return {
      data: null,
      setupRequired: false,
      errorMessage: error.message ?? "Impossibile aggiornare la variante.",
      code: error.code === "23505" ? "UNIQUE_CONFLICT" : undefined,
    };
  }

  const verifica = await verificaAggregazioneProdotto(supabase, productId, prezzoPre);
  if (!verifica.ok || !verifica.prodotto) {
    return {
      data: null,
      setupRequired: false,
      errorMessage: "L'aggregazione del trigger non è allineata al prodotto. Riprova o contatta l'assistenza.",
      code: "AGGREGATION_MISMATCH",
    };
  }

  return {
    data: { variante: mapVariante(updated as VarianteRow), prodotto: mapProduct(verifica.prodotto) },
    setupRequired: false,
    errorMessage: null,
  };
}

/**
 * Elimina una variante (solo se appartiene al prodotto). Il trigger aggiorna
 * automaticamente prezzo/stock del padre. Se viene eliminata l'ULTIMA
 * variante, il prodotto torna al comportamento legacy: ha_varianti=false e
 * stock non tracciato (NULL = disponibile, come i prodotti legacy esistenti);
 * il prezzo NON viene alterato.
 */
export async function deleteVarianteForProduct(
  userId: string,
  negozioId: string,
  productId: string,
  varianteId: string
): Promise<MerchantQueryResult<{ prodotto: MerchantProduct } | null>> {
  const ownership = await verificaProdottoGestibile(userId, negozioId, productId);
  if (ownership.errorMessage) {
    return { data: null, setupRequired: ownership.setupRequired, errorMessage: ownership.errorMessage, code: ownership.code };
  }
  const prezzoPre = ownership.data!.prezzo;

  const supabase = await getDbForUser(userId);

  const { data: esistente, error: errEsistente } = await supabase
    .from("prodotto_varianti")
    .select("id")
    .eq("id", varianteId)
    .eq("prodotto_id", productId)
    .maybeSingle();

  if (errEsistente) {
    return { data: null, setupRequired: false, errorMessage: errEsistente.message ?? "Impossibile verificare la variante." };
  }
  if (!esistente) {
    return { data: null, setupRequired: false, errorMessage: "Variante non trovata.", code: "VARIANT_NOT_FOUND" };
  }

  const { error } = await supabase
    .from("prodotto_varianti")
    .delete()
    .eq("id", varianteId)
    .eq("prodotto_id", productId);

  if (error) {
    return { data: null, setupRequired: false, errorMessage: error.message ?? "Impossibile eliminare la variante." };
  }

  const { count } = await supabase
    .from("prodotto_varianti")
    .select("id", { head: true, count: "exact" })
    .eq("prodotto_id", productId);
  const restano = typeof count === "number" ? count : 0;

  if (restano === 0) {
    // Ultima variante eliminata: il prodotto torna al comportamento legacy
    // (flag disattivato, stock non tracciato). Il prezzo resta invariato.
    // NOTA DB: quantita_disponibile è nullable (NULL = non tracciato =
    // disponibile, come i prodotti legacy); quantita_riservata è NOT NULL
    // default 0 → resta 0.
    const { error: errLegacy } = await supabase
      .from("prodotti")
      .update({ ha_varianti: false, quantita_disponibile: null, quantita_riservata: 0 })
      .eq("id", productId)
      .eq("negozio_id", negozioId);
    if (errLegacy) {
      return { data: null, setupRequired: false, errorMessage: errLegacy.message ?? "Impossibile ripristinare il prodotto." };
    }
  } else {
    const verifica = await verificaAggregazioneProdotto(supabase, productId, prezzoPre);
    if (!verifica.ok || !verifica.prodotto) {
      return {
        data: null,
        setupRequired: false,
        errorMessage: "L'aggregazione del trigger non è allineata al prodotto. Riprova o contatta l'assistenza.",
        code: "AGGREGATION_MISMATCH",
      };
    }
    return { data: { prodotto: mapProduct(verifica.prodotto) }, setupRequired: false, errorMessage: null };
  }

  const { data: prodottoLegacy } = await supabase
    .from("prodotti")
    .select(SELECT_COLONNE_PRODOTTO)
    .eq("id", productId)
    .maybeSingle();

  return {
    data: { prodotto: mapProduct((prodottoLegacy ?? {}) as ProdottoRow) },
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
