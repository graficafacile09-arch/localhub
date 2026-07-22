/**
 * LocalHub Brain — Session Memory
 *
 * Memoria di sessione in-process, senza database.
 * Mantiene le query recenti e le preferenze implicite per la durata
 * del processo Node.js (tipicamente una sessione server-side).
 *
 * Privacy by design:
 * - Nessun dato scritto su DB o disco
 * - La memoria si azzera al riavvio del processo
 * - Non richiede autenticazione dell'utente
 * - Identificazione tramite sessionId anonimo
 *
 * Questo modulo è attivo solo se BRAIN_MEMORY_ENABLED=true.
 *
 * @module lib/brain/memory/session-memory
 */

import type { MemoryEntry, MemoryContent } from "../types";

// ─── Costanti ────────────────────────────────────────────────────────────────

/** Numero massimo di voci per sessione (evita memory leak) */
const MAX_ENTRIES_PER_SESSION = 50;

/** Numero massimo di sessioni tenute in memoria */
const MAX_SESSIONS = 500;

/** TTL di una sessione in millisecondi (30 minuti) */
const SESSION_TTL_MS = 30 * 60 * 1000;

// ─── Store ────────────────────────────────────────────────────────────────────

interface SessionData {
  entries: MemoryEntry[];
  lastAccessedAt: number;
}

/** Store globale delle sessioni (in-process, non persistente) */
const sessionStore = new Map<string, SessionData>();

// ─── Utilità ──────────────────────────────────────────────────────────────────

function generateEntryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Rimuove le sessioni scadute per evitare memory leak nel processo.
 * Chiamato automaticamente ad ogni operazione di scrittura.
 */
function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [sessionId, data] of sessionStore.entries()) {
    if (now - data.lastAccessedAt > SESSION_TTL_MS) {
      sessionStore.delete(sessionId);
    }
  }

  // Se il numero di sessioni supera il limite, rimuove le più vecchie
  if (sessionStore.size > MAX_SESSIONS) {
    const sorted = Array.from(sessionStore.entries()).sort(
      ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt
    );
    const toRemove = sorted.slice(0, sessionStore.size - MAX_SESSIONS);
    for (const [id] of toRemove) {
      sessionStore.delete(id);
    }
  }
}

function getOrCreateSession(sessionId: string): SessionData {
  const existing = sessionStore.get(sessionId);
  if (existing) {
    existing.lastAccessedAt = Date.now();
    return existing;
  }

  const fresh: SessionData = { entries: [], lastAccessedAt: Date.now() };
  sessionStore.set(sessionId, fresh);
  return fresh;
}

// ─── API pubblica ────────────────────────────────────────────────────────────

/**
 * Aggiunge una voce di memoria per una sessione.
 *
 * @param sessionId - ID di sessione anonimo del client
 * @param content   - Contenuto della voce (query, click, preferenza)
 * @param userId    - ID utente opzionale (se autenticato)
 * @returns La voce creata
 */
export function addMemoryEntry(
  sessionId: string,
  content: MemoryContent,
  userId?: string
): MemoryEntry {
  pruneExpiredSessions();

  const session = getOrCreateSession(sessionId);

  const entry: MemoryEntry = {
    id: generateEntryId(),
    userId: userId ?? null,
    sessionId,
    type: "session",
    content,
    createdAt: new Date(),
  };

  session.entries.push(entry);

  // Mantiene solo gli ultimi N entries per sessione
  if (session.entries.length > MAX_ENTRIES_PER_SESSION) {
    session.entries = session.entries.slice(-MAX_ENTRIES_PER_SESSION);
  }

  return entry;
}

/**
 * Recupera le voci di memoria per una sessione.
 *
 * @param sessionId - ID di sessione
 * @param limit     - Numero massimo di voci da ritornare (default: 10)
 * @returns Array di voci, dalle più recenti
 */
export function getSessionMemory(
  sessionId: string,
  limit = 10
): MemoryEntry[] {
  const session = sessionStore.get(sessionId);
  if (!session) return [];

  session.lastAccessedAt = Date.now();

  // Ritorna le più recenti
  return session.entries.slice(-limit).reverse();
}

/**
 * Recupera le query recenti di una sessione come array di stringhe.
 * Comodo per arricchire UserContext.recentQueries.
 *
 * @param sessionId - ID di sessione
 * @param limit     - Numero massimo di query (default: 5)
 */
export function getRecentQueries(
  sessionId: string,
  limit = 5
): string[] {
  const entries = getSessionMemory(sessionId, limit * 2);
  return entries
    .filter((e) => e.content.type === "query")
    .map((e) => e.content.value)
    .slice(0, limit);
}

/**
 * Recupera le categorie preferite implicite di una sessione.
 * Basato sui click registrati in sessione.
 *
 * @param sessionId - ID di sessione
 * @param limit     - Numero massimo di categorie (default: 3)
 */
export function getPreferredCategories(
  sessionId: string,
  limit = 3
): string[] {
  const entries = getSessionMemory(sessionId, MAX_ENTRIES_PER_SESSION);
  const categories = entries
    .filter(
      (e) =>
        e.content.type === "click" &&
        typeof e.content.metadata?.categoria === "string"
    )
    .map((e) => e.content.metadata?.categoria as string);

  // Conta la frequenza
  const freq = new Map<string, number>();
  for (const cat of categories) {
    freq.set(cat, (freq.get(cat) ?? 0) + 1);
  }

  // Ordina per frequenza decrescente
  return Array.from(freq.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([cat]) => cat);
}

/**
 * Svuota la memoria di una sessione.
 * Chiamare quando l'utente richiede la cancellazione dei dati.
 *
 * @param sessionId - ID di sessione da cancellare
 */
export function clearSessionMemory(sessionId: string): void {
  sessionStore.delete(sessionId);
}

/**
 * Numero totale di sessioni attive in memoria (utile per monitoring).
 */
export function getActiveSessionCount(): number {
  return sessionStore.size;
}
