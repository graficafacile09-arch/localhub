import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { utenteAdminAutorizzato } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { canManageStore } from "@/lib/merchant/data";
import { toSlug } from "@/lib/slug";
import { normalizzaOrari } from "@/lib/orari";
import type { Orari } from "@/types/negozio";

const GALLERY_BUCKET = "store-images";

type StoreSettings = {
  nome?: string;
  slug?: string;
  descrizione?: string;
  descrizione_completa?: string;
  categoria?: string;
  sottocategoria?: string;
  logo_url?: string;
  copertina_url?: string;
  galleria?: string[];
  telefono?: string;
  email_negozio?: string;
  whatsapp?: string;
  sito_web?: string;
  indirizzo?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  coordinate?: string;
  orari?: Record<string, { chiuso: boolean; apertura1: string; chiusura1: string; apertura2: string; chiusura2: string }>;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  attivo?: boolean;
  mostra_telefono?: boolean;
  mostra_indirizzo?: boolean;
  mostra_orari?: boolean;
  accetta_whatsapp?: boolean;
  in_evidenza?: boolean;
  /** Commissione per-negozio (0–10, %); null = globale. SOLO admin. */
  commissione_percentuale?: number | null;
  servizi?: string[];
  colori?: { primary: string; secondary: string; accent: string };
  parole_chiave?: string[];
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string[];
  data?: Record<string, unknown>;
  moduli_attivi?: string[];
};

const SELECT_FIELDS =
  "id, slug, nome, descrizione, descrizione_completa, categoria, sottocategoria, " +
  "logo_url, copertina_url, galleria, " +
  "telefono, email_negozio, whatsapp, sito_web, " +
  "indirizzo, citta, cap, provincia, coordinate, " +
  "orari, " +
  "facebook, instagram, tiktok, youtube, " +
  "attivo, mostra_telefono, mostra_indirizzo, mostra_orari, accetta_whatsapp, in_evidenza, " +
  "commissione_percentuale, " +
  "servizi, colori, parole_chiave, " +
  "seo_title, seo_description, seo_keywords, " +
  "data, moduli_attivi, version, " +
  "deleted_at, deleted_by, created_at, updated_at";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/;
const PHONE_MAX = 30;
const CAP_RE = /^\d{5}$/;
const COORDS_RE = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
const GALLERY_BUCKET_PREFIX = `/object/public/${GALLERY_BUCKET}/`;

function validate(body: StoreSettings): string | null {
  if ("nome" in body && (!body.nome || !body.nome.trim())) {
    return "Il nome del negozio è obbligatorio.";
  }
  if ("categoria" in body && (!body.categoria || !body.categoria.trim())) {
    return "La categoria è obbligatoria.";
  }
  if ("email_negozio" in body && body.email_negozio && !EMAIL_RE.test(body.email_negozio)) {
    return "Formato email non valido.";
  }
  if ("sito_web" in body && body.sito_web && !URL_RE.test(body.sito_web)) {
    return "Il sito web deve iniziare con http:// o https://.";
  }
  if ("telefono" in body && body.telefono && body.telefono.length > PHONE_MAX) {
    return `Il telefono non può superare ${PHONE_MAX} caratteri.`;
  }
  if ("cap" in body && body.cap && !CAP_RE.test(body.cap)) {
    return "Il CAP deve essere composto da 5 cifre.";
  }
  if ("coordinate" in body && body.coordinate && !COORDS_RE.test(body.coordinate)) {
    return "Formato coordinate non valido. Usa 'lat, lng' (es. 45.4642, 9.1900).";
  }
  if ("slug" in body && body.slug !== undefined) {
    const slug = toSlug(String(body.slug));
    if (!slug) return "Lo slug non può essere vuoto.";
    body.slug = slug;
  }
  return null;
}

function extractStoragePath(publicUrl: string): string | null {
  const idx = publicUrl.indexOf(GALLERY_BUCKET_PREFIX);
  if (idx === -1) return null;
  return publicUrl.slice(idx + GALLERY_BUCKET_PREFIX.length).split("?")[0];
}

async function deleteOrphanImages(oldUrls: string[], newUrls: string[]) {
  const removed = oldUrls.filter((u) => u && !newUrls.includes(u));
  if (removed.length === 0) return;

  const supabase = createAdminSupabaseClient();
  const paths = removed
    .map((u) => extractStoragePath(u))
    .filter((p): p is string => p !== null);

  if (paths.length > 0) {
    await supabase.storage.from(GALLERY_BUCKET).remove(paths);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  // L'admin AUTORIZZATO legge le impostazioni di QUALSIASI negozio (bypass RLS).
  const supabase =
    (await utenteAdminAutorizzato(user.id, user.email ?? ""))
      ? createAdminSupabaseClient()
      : await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("negozi")
    .select(SELECT_FIELDS)
    .eq("id", negozioId)
    .single();

  if (error) {
    return apiError("FETCH_FAILED", error.message ?? "Impossibile caricare le impostazioni.", 500);
  }

  return apiOk({ settings: data });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const body = (await request.json()) as StoreSettings;

  const validationError = validate(body);
  if (validationError) {
    return apiError("VALIDATION_ERROR", validationError, 422);
  }

  const payload: Record<string, unknown> = {};

  // ── Commissione piattaforma per-negozio (SOLO Area Amministratore) ────────
  // Gate SERVER-SIDE (mai fidarsi del client): se il body contiene la
  // proprietà e l'utente non è l'admin autorizzato → 403. Valori ammessi:
  // null (= commissione globale), oppure numero finito 0–10 con al massimo
  // 2 decimali (normalizzati prima del salvataggio). Stringa vuota → null.
  if ("commissione_percentuale" in body) {
    if (!(await utenteAdminAutorizzato(user.id, user.email ?? ""))) {
      return apiError(
        "FORBIDDEN",
        "Solo l'amministratore può modificare la commissione piattaforma del negozio.",
        403
      );
    }

    // unknown: il body arriva dal client, il tipo TS (number|null) non è
    // sufficiente per la validazione — ogni ramo deve essere controllato.
    const raw: unknown = body.commissione_percentuale;
    let normalizzata: number | null;
    if (raw === null) {
      normalizzata = null;
    } else if (typeof raw === "string") {
      const testo = raw.trim();
      if (testo === "") {
        normalizzata = null;
      } else {
        const n = Number(testo);
        if (!Number.isFinite(n)) {
          return apiError(
            "VALIDATION_ERROR",
            "Commissione piattaforma non valida: inserire un numero tra 0 e 10.",
            422
          );
        }
        normalizzata = n;
      }
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      normalizzata = raw;
    } else {
      return apiError(
        "VALIDATION_ERROR",
        "Commissione piattaforma non valida: inserire un numero tra 0 e 10.",
        422
      );
    }

    if (normalizzata !== null && (normalizzata < 0 || normalizzata > 10)) {
      return apiError(
        "VALIDATION_ERROR",
        "Commissione piattaforma non valida: consentito 0–10 (decimali fino a 2).",
        422
      );
    }
    if (normalizzata !== null) {
      normalizzata = Math.round(normalizzata * 100) / 100;
    }
    payload.commissione_percentuale = normalizzata;
  }

  const allowedFields = [
    "nome", "slug", "descrizione", "descrizione_completa", "categoria", "sottocategoria",
    "logo_url", "copertina_url", "galleria",
    "telefono", "email_negozio", "whatsapp", "sito_web",
    "indirizzo", "citta", "cap", "provincia", "coordinate",
    "orari",
    "facebook", "instagram", "tiktok", "youtube",
    "attivo", "mostra_telefono", "mostra_indirizzo", "mostra_orari",
    "accetta_whatsapp", "in_evidenza",
    "servizi", "colori", "parole_chiave",
    "seo_title", "seo_description", "seo_keywords",
    "data", "moduli_attivi",
  ];

  for (const field of allowedFields) {
    if (field in body) {
      payload[field] = (body as Record<string, unknown>)[field];
    }
  }

  // ── Normalizzazione orari (mai pass-through cieco) ───────────────────────
  // Gli orari vengono SEMPRE fatti passare da `normalizzaOrari` prima del
  // salvataggio: elimina fasce incomplete, ordina, fonde le sovrapposte,
  // scarta quelle contenute e mantiene il formato JSONB. Così il DB non
  // contiene MAI due fasce ambigue sullo stesso giorno (doppio livello di
  // sicurezza: UI + backend), anche se il client invia dati sporchi.
  if ("orari" in payload && payload.orari && typeof payload.orari === "object") {
    payload.orari = normalizzaOrari(payload.orari as Orari);
  }

  if (Object.keys(payload).length === 0) {
    return apiError("INVALID_BODY", "Nessun campo da aggiornare.", 422);
  }

  const supabase = createAdminSupabaseClient();

  // Unicità dello slug: se lo slug è cambiato, verifica che non esista già
  // su un altro negozio (l'indice UNIQUE parziale lo garantirebbe comunque,
  // ma restituiamo un errore chiaro al merchant).
  if ("slug" in payload && payload.slug) {
    const { count, error: countError } = await supabase
      .from("negozi")
      .select("id", { head: true, count: "exact" })
      .eq("slug", payload.slug as string)
      .neq("id", negozioId);
    if (countError) {
      return apiError("UPDATE_FAILED", countError.message ?? "Impossibile verificare lo slug.", 500);
    }
    if (count && count > 0) {
      return apiError("SLUG_TAKEN", "Questo slug è già utilizzato da un altro negozio.", 422);
    }
  }

  // Merge `data` into the existing jsonb instead of replacing it: modules
  // (offerte/eventi/ai) each PUT their own slice and must not wipe the others.
  if ("data" in payload && payload.data && typeof payload.data === "object") {
    const { data: oldRow } = await supabase
      .from("negozi")
      .select("data")
      .eq("id", negozioId)
      .single();
    const existing = (oldRow?.data ?? {}) as Record<string, unknown>;
    payload.data = { ...existing, ...(payload.data as Record<string, unknown>) };
  }

  const { data: oldRow } = await supabase
    .from("negozi")
    .select("logo_url, copertina_url")
    .eq("id", negozioId)
    .single();

  const { data, error } = await supabase
    .from("negozi")
    .update(payload)
    .eq("id", negozioId)
    .select(SELECT_FIELDS)
    .single();

  if (error) {
    return apiError("UPDATE_FAILED", error.message ?? "Impossibile aggiornare le impostazioni.", 500);
  }

  if (oldRow) {
    const oldUrls = [oldRow.logo_url, oldRow.copertina_url].filter(
      (u): u is string => !!u && typeof u === "string"
    );
    const newUrls = [
      (payload.logo_url as string) ?? oldRow.logo_url,
      (payload.copertina_url as string) ?? oldRow.copertina_url,
    ].filter((u): u is string => !!u && typeof u === "string");

    await deleteOrphanImages(oldUrls, newUrls);
  }

  const slugFinale = ((data as { slug?: string } | null)?.slug) ?? negozioId;
  revalidatePath(`/negozio/${slugFinale}`);
  revalidatePath(`/merchant/${negozioId}`);
  revalidatePath(`/negozi`);
  revalidatePath(`/`);
  revalidatePath(`/ricerca`);

  return apiOk({ settings: data });
}
