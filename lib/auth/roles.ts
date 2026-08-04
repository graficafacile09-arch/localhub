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
 * Tutti i ruoli assegnati a un utente nella tabella user_roles.
 * Un utente può avere più ruoli (es. "merchant" + "customer").
 * Usa l'admin client (bypassa RLS): può girare anche nel middleware (edge).
 */
export async function getRuoliUtente(userId: string): Promise<RuoloUtente[]> {
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((riga) => riga.role).filter(isRuoloUtente);
  } catch {
    // Tabella assente o errori di connessione → nessun ruolo esplicito.
    return [];
  }
}

/** True se l'utente possiede (tra i suoi ruoli) il ruolo "customer". */
export async function haRuoloCliente(userId: string): Promise<boolean> {
  const ruoli = await getRuoliUtente(userId);
  return ruoli.includes("customer");
}

/**
 * True se l'utente possiede ALMENO UNO dei ruoli richiesti (multi-role).
 * È la verifica corretta per l'ACCESSO ALLE AREE: un utente con più ruoli
 * (es. il webmaster admin+merchant+customer) supera i gate di ogni area a
 * cui corrisponde almeno uno dei suoi ruoli.
 */
export async function utenteHaRuoli(
  userId: string,
  richiesti: readonly RuoloUtente[]
): Promise<boolean> {
  if (richiesti.length === 0) return false;
  const ruoli = await getRuoliUtente(userId);
  return ruoliSoddisfano(ruoli, richiesti);
}

/**
 * True se l'insieme di ruoli posseduti include almeno uno dei richiesti.
 * Versione pura (senza DB) usata da middleware e controlli in memoria.
 */
export function ruoliSoddisfano(
  ruoliPosseduti: readonly RuoloUtente[],
  richiesti: readonly RuoloUtente[]
): boolean {
  if (richiesti.length === 0) return false;
  return ruoliPosseduti.some((ruolo) =>
    (richiesti as readonly RuoloUtente[]).includes(ruolo)
  );
}

/**
 * Legge i ruoli di un utente dalla tabella user_roles.
 * - Più ruoli → viene usato quello a priorità maggiore.
 * - Nessun ruolo o tabella non disponibile → "customer" (default sicuro).
 * Usa l'admin client (bypassa RLS): può girare anche nel middleware (edge).
 */
export async function getRoleForUser(userId: string): Promise<RuoloUtente> {
  const ruoli = await getRuoliUtente(userId);
  if (ruoli.length === 0) {
    return "customer";
  }
  return ruoli.reduce<RuoloUtente>(
    (acc, ruolo) =>
      PRIORITA_RUOLO[ruolo] > PRIORITA_RUOLO[acc] ? ruolo : acc,
    "customer"
  );
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
