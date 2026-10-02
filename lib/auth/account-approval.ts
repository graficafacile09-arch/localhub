import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AccountApprovalStatus = "pending" | "approved" | "rejected";

export async function getAccountApprovalStatus(
  userId: string
): Promise<AccountApprovalStatus> {
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("account_approvazioni")
      .select("stato")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      // Fail-open for legacy/partial environments: the approval layer must
      // never break the existing authentication flow if its table is absent.
      return "approved";
    }

    const stato = String(data.stato);
    return stato === "pending" || stato === "rejected" ? stato : "approved";
  } catch {
    return "approved";
  }
}
