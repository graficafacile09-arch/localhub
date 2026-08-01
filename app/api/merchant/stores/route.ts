import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { getMerchantStoresForUser } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  }

  const storesResult = await getMerchantStoresForUser(user.id);

  if (storesResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storesResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  return apiOk({ stores: storesResult.data });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  const body = await request.json();
  const nome = (body.nome as string)?.trim();
  const categoria = (body.categoria as string)?.trim();

  if (!nome) return apiError("VALIDATION_ERROR", "Il nome del negozio è obbligatorio.", 422);
  if (!categoria) return apiError("VALIDATION_ERROR", "La categoria è obbligatoria.", 422);

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("negozi")
    .insert({
      owner_user_id: user.id,
      nome,
      categoria,
      citta: (body.citta as string)?.trim() || null,
      logo_url: (body.logo_url as string) || null,
      attivo: false,
    })
    .select("id")
    .single();

  if (error) {
    return apiError("CREATE_FAILED", error.message ?? "Impossibile creare il negozio.", 500);
  }

  return apiOk({ storeId: data.id });
}
