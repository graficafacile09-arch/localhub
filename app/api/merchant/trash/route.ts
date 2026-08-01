import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("negozi")
    .select("id, nome, categoria, descrizione, attivo, logo_url, deleted_at")
    .eq("owner_user_id", user.id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    return apiError("FETCH_FAILED", error.message ?? "Impossibile recuperare i negozi nel cestino.", 500);
  }

  return apiOk({ stores: data ?? [] });
}
