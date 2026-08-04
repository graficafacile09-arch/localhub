import type { ClienteImpostazioni } from "./types";

/**
 * Servizio Impostazioni dell'Area Clienti.
 * Fase 1 — architettura: firme pronte, logica da collegare al database
 * nelle fasi successive (preferenze, notifiche, sicurezza).
 */

/** Recupera le impostazioni dell'account. */
export async function getImpostazioni(
  userId: string
): Promise<ClienteImpostazioni | null> {
  void userId;
  // Fase 5: query Supabase.
  return null;
}

/** Aggiorna le preferenze dell'account. */
export async function aggiornaImpostazioni(
  userId: string,
  dati: Partial<ClienteImpostazioni>
): Promise<ClienteImpostazioni | null> {
  void userId;
  void dati;
  // Fase 5: update Supabase.
  return null;
}
