import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getRuoliUtente,
  PRIORITA_RUOLO,
  utenteHaRuoli,
  type RuoloUtente,
} from "@/lib/auth/roles";

export async function getCurrentUser() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createServerSupabaseClient();

  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      return null;
    }

    return data.user ?? null;
  } catch (error) {
    // Supabase Auth può lanciare AuthSessionMissingError quando il browser
    // non porta una sessione (o quando il refresh token è ormai invalido).
    // In entrambi i casi l'applicazione deve trattare la richiesta come anonima,
    // senza generare un errore server.
    const message = error instanceof Error ? error.message : String(error);
    const sessionMissing = /auth session missing|invalid refresh token|refresh token not found/i.test(message);

    if (!sessionMissing) {
      console.error("[auth] getCurrentUser failed:", error);
    }

    return null;
  }
}

export async function requireCurrentUser(redirectTo = "/login") {
  const user = await getCurrentUser();

  if (!user) {
    redirect(redirectTo);
  }

  return user;
}

// ════════════════════════════════════════════════════════════════════
// Utente corrente + ruoli (per informazione e per l'AREA ATTIVA).
// L'accesso alle aree NON deriva più dall'insieme dei ruoli: è deciso
// dall'AREA ATTIVA della sessione (cookie httpOnly lh_area, vedi
// lib/auth/area.ts). Queste funzioni restano utili per l'etichetta del
// menu, i fallback di area e le route API (verifica di ruolo).
// ════════════════════════════════════════════════════════════════════

export type UtenteConRuoli = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  /** Ruolo a priorità maggiore (per UI e fallback). */
  role: RuoloUtente;
  /** Tutti i ruoli posseduti (informativi). */
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
