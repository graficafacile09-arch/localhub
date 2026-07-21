import { createServerSupabaseClient } from "@/lib/supabase/server";
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

type MerchantMembershipRow = {
  negozio_id: string;
  role: MerchantRole;
  is_active: boolean;
};

type NegozioRow = {
  id: string | number;
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
  categoria?: string | null;
  sottocategoria?: string | null;
  marca?: string | null;
  colore?: string | null;
  materiale?: string | null;
  parole_chiave?: string[] | null;
  prezzo?: number | string | null;
  prezzo_suggerito?: number | null;
  immagine_principale?: string | null;
  quantita_disponibile?: number | null;
  stato_condizione?: string | null;
  attivo?: boolean | null;
  origine_pubblicazione?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "PGRST204"]);

function isSchemaError(error: QueryError | null) {
  return Boolean(error?.code && SCHEMA_ERROR_CODES.has(error.code));
}

function mapStore(row: NegozioRow, role: MerchantRole): MerchantStoreSummary {
  return {
    id: String(row.id),
    nome: row.nome?.trim() || "Negozio senza nome",
    categoria: row.categoria ?? null,
    descrizione: row.descrizione ?? null,
    attivo: row.attivo ?? true,
    role,
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
    categoria: row.categoria ?? null,
    sottocategoria: row.sottocategoria ?? null,
    marca: row.marca ?? null,
    colore: row.colore ?? null,
    materiale: row.materiale ?? null,
    parole_chiave: row.parole_chiave ?? null,
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
    attivo: row.attivo ?? true,
    origine_pubblicazione: row.origine_pubblicazione ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export async function getMerchantStoresForUser(userId: string): Promise<MerchantQueryResult<MerchantStoreSummary[]>> {
  const supabase = await createServerSupabaseClient();
  const { data: memberships, error: membershipsError } = await supabase
    .from("merchant_memberships")
    .select("negozio_id, role, is_active")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (membershipsError) {
    if (isSchemaError(membershipsError)) {
      return {
        data: [],
        setupRequired: true,
        errorMessage: "La Merchant Foundation non è ancora configurata nel database.",
      };
    }

    return {
      data: [],
      setupRequired: false,
      errorMessage: membershipsError.message ?? "Impossibile recuperare i negozi del merchant.",
    };
  }

  const righeMembership = (memberships ?? []) as MerchantMembershipRow[];

  if (righeMembership.length === 0) {
    return {
      data: [],
      setupRequired: false,
      errorMessage: null,
    };
  }

  const ids = righeMembership.map((membership) => membership.negozio_id);
  const { data: stores, error: storesError } = await supabase
    .from("negozi")
    .select("id, nome, categoria, descrizione, attivo")
    .in("id", ids);

  if (storesError) {
    return {
      data: [],
      setupRequired: false,
      errorMessage: storesError.message ?? "Impossibile recuperare i dati dei negozi.",
    };
  }

  const roleByStoreId = new Map(righeMembership.map((membership) => [membership.negozio_id, membership.role]));

  const normalized = ((stores ?? []) as NegozioRow[])
    .map((store) => mapStore(store, roleByStoreId.get(String(store.id)) ?? "manager"))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));

  return {
    data: normalized,
    setupRequired: false,
    errorMessage: null,
  };
}

export async function getMerchantStoreForUser(userId: string, negozioId: string) {
  const storesResult = await getMerchantStoresForUser(userId);
  const store = storesResult.data.find((item) => item.id === negozioId) ?? null;

  return {
    ...storesResult,
    data: store,
  };
}

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

  const supabase = await createServerSupabaseClient();
  const query = await supabase
    .from("prodotti")
    .select(
      "id, negozio_id, nome, descrizione, categoria, sottocategoria, marca, colore, materiale, parole_chiave, prezzo, prezzo_suggerito, immagine_principale, quantita_disponibile, stato_condizione, attivo, origine_pubblicazione, created_at, updated_at"
    )
    .eq("negozio_id", negozioId)
    .order("created_at", { ascending: false });

  if (query.error && isSchemaError(query.error)) {
    const fallbackQuery = await supabase
      .from("prodotti")
      .select("id, negozio_id, nome, descrizione, categoria, prezzo")
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

  return {
    ...productsResult,
    data: productsResult.data.find((item) => item.id === productId) ?? null,
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
      errorMessage: storeResult.errorMessage ?? "Negozio non disponibile per questo merchant.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const payload = {
    negozio_id: negozioId,
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
    immagine_principale: input.immaginePrincipale.trim() || null,
    quantita_disponibile: input.quantitaDisponibile ?? 1,
    stato_condizione: input.statoCondizione ?? null,
    attivo: input.attivo,
    origine_pubblicazione: input.originePubblicazione?.trim() || "manuale",
  };

  const insertResult = await supabase.from("prodotti").insert(payload).select("*").single();

  if (insertResult.error && isSchemaError(insertResult.error)) {
    const fallbackResult = await supabase
      .from("prodotti")
      .insert({
        negozio_id: negozioId,
        nome: input.nome.trim(),
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
      errorMessage: storeResult.errorMessage ?? "Negozio non disponibile per questo merchant.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const payload = {
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
    immagine_principale: input.immaginePrincipale.trim() || null,
    quantita_disponibile: input.quantitaDisponibile ?? 1,
    stato_condizione: input.statoCondizione ?? null,
    attivo: input.attivo,
    origine_pubblicazione: input.originePubblicazione?.trim() || storeResult.data.origine_pubblicazione,
  };

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
