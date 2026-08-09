import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getMerchantStoresForUser } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toSlug } from "@/lib/slug";
import { generaSlugUnivoco } from "@/lib/slug-server";

export async function GET() {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const storesResult = await getMerchantStoresForUser(user.id);

  if (storesResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storesResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  return apiOk({ stores: storesResult.data });
}

export async function POST(request: Request) {
  // Solo la sessione merchant può creare negozi.
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const body = await request.json();
  const nome = (body.nome as string)?.trim();
  const categoria = (body.categoria as string)?.trim();

  if (!nome) return apiError("VALIDATION_ERROR", "Il nome del negozio è obbligatorio.", 422);
  if (!categoria) return apiError("VALIDATION_ERROR", "La categoria è obbligatoria.", 422);

  const supabase = createAdminSupabaseClient();

  const slugBase = (body.slug as string)?.trim() || toSlug(nome);
  const slug = await generaSlugUnivoco("negozi", slugBase || "negozio");

  const { data, error } = await supabase
    .from("negozi")
    .insert({
      owner_user_id: user.id,
      nome,
      categoria,
      slug,
      citta: (body.citta as string)?.trim() || null,
      logo_url: (body.logo_url as string) || null,
      attivo: true,
    })
    .select("id")
    .single();

  if (error) {
    return apiError("CREATE_FAILED", error.message ?? "Impossibile creare il negozio.", 500);
  }

  return apiOk({ storeId: data.id });
}
