/**
 * LocalHub Brain — Memory
 *
 * Gestisce la memoria contestuale tra le sessioni degli utenti.
 * Permette a Brain di personalizzare i risultati in base alla
 * cronologia delle interazioni, senza richiedere registrazione obbligatoria.
 *
 * Due livelli di memoria:
 * - Session Memory:   durata processo Node.js, identificativo anonimo, nessun DB ✓
 * - Long-term Memory: persistente su Supabase, solo per utenti registrati (TODO)
 *
 * Privacy by design:
 * - Tutto è opt-in (BRAIN_MEMORY_ENABLED=true)
 * - Gli utenti anonimi usano solo session memory (mai salvata nel DB)
 * - La memoria è cancellabile con clearSessionMemory()
 * - Nessun dato personale obbligatorio
 *
 * @module lib/brain/memory
 */

export {
  addMemoryEntry,
  getSessionMemory,
  getRecentQueries,
  getPreferredCategories,
  clearSessionMemory,
  getActiveSessionCount,
} from "./session-memory";
