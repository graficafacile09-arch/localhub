import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Ruoli utente di LocalHub.
 * Il sistema è estensibile: per aggiungere un ruolo (editor, moderatore,
 * supporto, …) basta estendere questa unione e la relativa priorità.
 */
export type RuoloUtente = "customer" | "merchant" | "admin";

/** Tutti i ruoli conosciuti, in ordine di privilegio crescente. */
export const RUOLI_UTENTE: readonly RuoloUtente[] = [
  "customer",
  "merchant",
  "admin",
] as const;

/** Priorità dei ruoli: più alto = più privilegi (utile per scelte future). */
export const PRIORITA_RUOLO: Record<RuoloUtente, number> = {
  customer: 0,
  merchant: 1,
  admin: 2,
};

export function isRuoloUtente(value: string): value is RuoloUtente {
  return (RUOLI_UTENTE as readonly string[]).includes(value);
}

/** True se il ruolo dell'utente è uno di quelli richiesti. */
export function ruoloSoddisfa(
  ruolo: RuoloUtente,
  richiesti: readonly RuoloUtente[]
): boolean {
  return richiesti.includes(ruolo);
}

/** Destinazione predefinita dopo il login in base al ruolo. */
export function redirectPerRuolo(ruolo: RuoloUtente): string {
  switch (ruolo) {
    case "admin":
      return "/amministratore";
    case "merchant":
      return "/merchant";
    default:
      return "/";
  }
}

/**
 * Legge i ruoli di un utente dalla tabella user_roles.
 * - Più ruoli → viene usato quello a priorità maggiore.
 * - Nessun ruolo o tabella non disponibile → "customer" (default sicuro).
 * Usa l'admin client (bypassa RLS): può girare anche nel middleware (edge).
 */
export async function getRoleForUser(userId: string): Promise<RuoloUtente> {
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (error || !data || data.length === 0) {
      return "customer";
    }

    return data.reduce<RuoloUtente>((acc, riga) => {
      if (!isRuoloUtente(riga.role)) return acc;
      return PRIORITA_RUOLO[riga.role] > PRIORITA_RUOLO[acc] ? riga.role : acc;
    }, "customer");
  } catch {
    // Tabella assente o errori di connessione → default sicuro.
    return "customer";
  }
}

/** Numero di negozi attivi posseduti da un utente (per il menu admin). */
export async function contaNegoziUtente(userId: string): Promise<number> {
  try {
    const admin = createAdminSupabaseClient();
    const { count, error } = await admin
      .from("negozi")
      .select("id", { head: true, count: "exact" })
      .eq("owner_user_id", userId)
      .is("deleted_at", null);

    if (error || !count) return 0;
    return count;
  } catch {
    return 0;
  }
}
