import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getRoleForUser,
  getRuoliUtente,
  PRIORITA_RUOLO,
  redirectPerRuolo,
  ruoloSoddisfa,
  ruoliSoddisfano,
  utenteHaRuoli,
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

// ════════════════════════════════════════════════════════════════════
// Controlli MULTI-RUOLO — l'accesso alle aree è verificato sull'INSIEME
// dei ruoli posseduti, non sul singolo ruolo a priorità maggiore.
// Un utente con più ruoli (es. webmaster admin+merchant+customer) può
// entrare in tutte le aree corrispondenti a uno dei suoi ruoli.
// ════════════════════════════════════════════════════════════════════

export type UtenteConRuoli = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  /** Ruolo a priorità maggiore (per UI e redirect predefiniti). */
  role: RuoloUtente;
  /** Tutti i ruoli posseduti (verifica accesso aree). */
  ruoli: RuoloUtente[];
};

/** Utente corrente + ruolo principale + TUTTI i ruoli posseduti. */
export async function getCurrentRuoli(): Promise<UtenteConRuoli | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const ruoli = await getRuoliUtente(user.id);
  const role =
    ruoli.length === 0
      ? "customer"
      : ruoli.reduce<RuoloUtente>((acc, ruolo) =>
          PRIORITA_RUOLO[ruolo] > PRIORITA_RUOLO[acc] ? ruolo : acc,
          "customer"
        );

  return { user, role, ruoli };
}

/**
 * Richiede che l'utente loggato possieda ALMENO UNO dei ruoli richiesti
 * (verifica sull'insieme dei ruoli). Usato dai layout delle aree.
 * - Non loggato → redirect a `redirectTo` (default /login).
 * - Nessun ruolo compatibile → redirect alla home del ruolo principale.
 */
export async function requireRuoli(
  richiesti: readonly RuoloUtente[],
  redirectTo = "/login"
): Promise<UtenteConRuoli> {
  const data = await getCurrentRuoli();

  if (!data) {
    redirect(redirectTo);
  }

  if (!ruoliSoddisfano(data.ruoli, richiesti)) {
    redirect(redirectPerRuolo(data.role));
  }

  return data;
}

/**
 * Utente corrente + verifica ruoli per le ROUTE HANDLER API.
 * Restituisce { user, ok }: l'handler decide 401 (non autenticato) o
 * 403 (autenticato ma ruolo non consentito). Verifica sull'INSIEME dei
 * ruoli posseduti (multi-role).
 */
export async function getApiUtente(
  richiesti: readonly RuoloUtente[]
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> | null; ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { user: null, ok: false };
  const ok = await utenteHaRuoli(user.id, richiesti);
  return { user, ok };
}
