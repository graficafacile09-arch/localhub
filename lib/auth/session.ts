import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getRoleForUser,
  redirectPerRuolo,
  ruoloSoddisfa,
  type RuoloUtente,
} from "@/lib/auth/roles";

export async function getCurrentUser() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user ?? null;
}

export async function requireCurrentUser(redirectTo = "/login") {
  const user = await getCurrentUser();

  if (!user) {
    redirect(redirectTo);
  }

  return user;
}

// ════════════════════════════════════════════════════════════════════
// Sistema ruoli — funzioni centralizzate.
// Ogni controllo dei permessi deve usare ESCLUSIVAMENTE queste funzioni.
// ════════════════════════════════════════════════════════════════════

export type UtenteConRuolo = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  role: RuoloUtente;
};

/** Utente corrente + ruolo (null se non loggato). */
export async function getCurrentRole(): Promise<UtenteConRuolo | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const role = await getRoleForUser(user.id);
  return { user, role };
}

/** True se l'utente loggato ha uno dei ruoli richiesti. */
export async function hasRole(
  richiesti: readonly RuoloUtente[]
): Promise<boolean> {
  const data = await getCurrentRole();
  return data ? ruoloSoddisfa(data.role, richiesti) : false;
}

/**
 * Richiede che l'utente loggato abbia uno dei ruoli richiesti.
 * - Non loggato → redirect a `redirectTo` (default /login).
 * - Loggato ma ruolo non consentito → redirect alla home del proprio ruolo.
 */
export async function requireRole(
  richiesti: readonly RuoloUtente[],
  redirectTo = "/login"
): Promise<UtenteConRuolo> {
  const data = await getCurrentRole();

  if (!data) {
    redirect(redirectTo);
  }

  if (!ruoloSoddisfa(data.role, richiesti)) {
    redirect(redirectPerRuolo(data.role));
  }

  return data;
}
