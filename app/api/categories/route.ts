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
    return apiError("FETCH_FAILED", error.message, 500);
  }

  return apiOk(data ?? []);
}
