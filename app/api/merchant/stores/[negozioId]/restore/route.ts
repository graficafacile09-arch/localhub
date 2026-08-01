import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  const { negozioId } = await context.params;

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("negozi")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", negozioId)
    .eq("owner_user_id", user.id)
    .not("deleted_at", "is", null)
    .select("id");

  if (error) {
    return apiError("RESTORE_FAILED", error.message ?? "Impossibile ripristinare il negozio.", 500);
  }

  if (!data || data.length === 0) {
    return apiError("FORBIDDEN", "Negozio non trovato nel cestino.", 404);
  }

  revalidatePath("/merchant");
  revalidatePath("/negozi");
  revalidatePath(`/negozio/${negozioId}`);
  revalidatePath("/");

  return apiOk({ restored: true, storeId: negozioId });
}
