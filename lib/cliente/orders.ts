import type { ClienteOrdine } from "./types";

/**
 * Servizio Ordini dell'Area Clienti.
 * Fase 1 — architettura: firme pronte, logica da collegare al database
 * nelle fasi successive (storico, dettaglio, stato ordini).
 */

/** Elenco degli ordini dell'utente (più recenti per primi). */
export async function getOrdiniUtente(userId: string): Promise<ClienteOrdine[]> {
  void userId;
  // Fase 4: query Supabase verso la tabella ordini.
  return [];
}

/** Dettaglio di un singolo ordine. */
export async function getOrdine(
  userId: string,
  ordineId: string
): Promise<ClienteOrdine | null> {
  void userId;
  void ordineId;
  // Fase 4: query Supabase con verifica proprietà.
  return null;
}
