import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { apiOk, apiError } from "@/lib/api/response";

export async function GET() {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("categorie")
    .select("*")
    .eq("attivo", true)
    .order("ordine", { ascending: true });

  if (error) {
    console.error("[/api/categories] Errore lettura categorie:", error);
    return apiError(
      "FETCH_FAILED",
      "Impossibile caricare le categorie. Riprova tra poco.",
      500
    );
  }

  return apiOk(data ?? []);
}
