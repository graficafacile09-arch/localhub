import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AccountApprovalStatus = "pending" | "approved" | "rejected";

/**
 * Stato AUTOREVOLE dell'approvazione account.
 *
 * Sicurezza: questa funzione è usata nei gate di accesso. In caso di errore
 * o di riga mancante NON deve concedere accesso: fail-closed.
 *
 * Le righe degli account esistenti sono state inizializzate come "approved"
 * dalla migrazione; ogni nuovo auth.users viene creato dal trigger come
 * "pending". Quindi una riga mancante indica uno stato non inizializzato e
 * va trattata come non approvato, non come approvato.
 */
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
      console.error(
        "[account-approval] Impossibile leggere lo stato di approvazione:",
        error?.message ?? "riga approvazione assente"
      );
      return "pending";
    }

    const stato = String(data.stato);
    return stato === "pending" || stato === "rejected" ? stato : "approved";
  } catch (error) {
    console.error(
      "[account-approval] Errore lettura approvazione:",
      error instanceof Error ? error.message : String(error)
    );
    return "pending";
  }
}
