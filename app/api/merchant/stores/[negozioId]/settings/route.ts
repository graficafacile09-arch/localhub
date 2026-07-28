import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { canManageStore } from "@/lib/merchant/data";

const GALLERY_BUCKET = "store-images";

type StoreSettings = {
  nome?: string;
  descrizione?: string;
  categoria?: string;
  indirizzo?: string;
  telefono?: string;
  email?: string;
  sito_web?: string;
  immagine?: string;
  copertina?: string;
  orari?: Record<string, { chiuso: boolean; apertura1: string; chiusura1: string; apertura2: string; chiusura2: string }>;
  facebook?: string;
  instagram?: string;
  whatsapp?: string;
};

const SELECT_FIELDS =
  "id, nome, descrizione, categoria, indirizzo, telefono, email, sito_web, immagine, copertina, orari, facebook, instagram, whatsapp";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/;
const PHONE_MAX = 30;
const GALLERY_BUCKET_PREFIX = `/object/public/${GALLERY_BUCKET}/`;

function validate(body: StoreSettings): string | null {
  if ("nome" in body && (!body.nome || !body.nome.trim())) {
    return "Il nome del negozio è obbligatorio.";
  }
  if ("categoria" in body && (!body.categoria || !body.categoria.trim())) {
    return "La categoria è obbligatoria.";
  }
  if ("email" in body && body.email && !EMAIL_RE.test(body.email)) {
    return "Formato email non valido.";
  }
  if ("sito_web" in body && body.sito_web && !URL_RE.test(body.sito_web)) {
    return "Il sito web deve iniziare con http:// o https://.";
  }
  if ("telefono" in body && body.telefono && body.telefono.length > PHONE_MAX) {
    return `Il telefono non può superare ${PHONE_MAX} caratteri.`;
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
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  const { negozioId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const supabase = await createServerSupabaseClient();
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
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  const { negozioId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const body = (await request.json()) as StoreSettings;

  const validationError = validate(body);
  if (validationError) {
    return apiError("VALIDATION_ERROR", validationError, 422);
  }

  const payload: Record<string, unknown> = {};
  const allowedFields = [
    "nome", "descrizione", "categoria", "indirizzo", "telefono",
    "email", "sito_web", "immagine", "copertina",
    "orari", "facebook", "instagram", "whatsapp",
  ];

  for (const field of allowedFields) {
    if (field in body) {
      payload[field] = (body as Record<string, unknown>)[field];
    }
  }

  if (Object.keys(payload).length === 0) {
    return apiError("INVALID_BODY", "Nessun campo da aggiornare.", 422);
  }

  const supabase = createAdminSupabaseClient();

  const { data: oldRow } = await supabase
    .from("negozi")
    .select("immagine, copertina")
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
    const oldUrls = [oldRow.immagine, oldRow.copertina].filter(
      (u): u is string => !!u && typeof u === "string"
    );

    const newUrls = [
      (payload.immagine as string) ?? oldRow.immagine,
      (payload.copertina as string) ?? oldRow.copertina,
    ].filter((u): u is string => !!u && typeof u === "string");

    await deleteOrphanImages(oldUrls, newUrls);
  }

  return apiOk({ settings: data });
}
