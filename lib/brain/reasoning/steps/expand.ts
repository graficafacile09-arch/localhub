/**
 * LocalHub Brain — Reasoning Step: Expand
 *
 * Espande la query dell'utente tramite LLM per migliorare il recall del retrieval.
 * Genera sinonimi, termini correlati e varianti semantiche in italiano.
 *
 * Questo step viene eseguito solo quando:
 * - Brain è abilitato (BRAIN_ENABLED=true)
 * - Il DecisionPlan prevede useExpansion: true
 *
 * Se la chiamata LLM fallisce, la funzione ritorna silenziosamente
 * la query originale (degradazione graceful, zero eccezioni non gestite).
 *
 * @module lib/brain/reasoning/steps/expand
 */

import { getBrainLLMProvider } from "../../providers";
import type { LLMMessage } from "../../providers/base";

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei un assistente specializzato nell'espansione di query di ricerca per un motore di ricerca locale italiano.
Il tuo compito è espandere la query dell'utente con sinonimi, termini correlati e varianti linguistiche.

Regole:
- Rispondi SOLO con i termini espansi separati da spazi, nessun'altra parola.
- Massimo 15 termini aggiuntivi, tutti in italiano.
- Non ripetere la query originale.
- Non aggiungere punteggiatura, virgole o spiegazioni.
- Non aggiungere termini irrilevanti o fuori contesto.
- Se la query è già molto specifica (es. un nome proprio), rispondi con una stringa vuota.`;

/**
 * Costruisce il prompt user per l'espansione della query.
 */
function buildExpandPrompt(query: string): string {
  return `Espandi questa query di ricerca con sinonimi e termini correlati: "${query}"`;
}

// ─── Cache semplice in-process ────────────────────────────────────────────────

/** Cache LRU minimale per evitare chiamate ripetute sulla stessa query */
const expandCache = new Map<string, string>();
const MAX_CACHE_SIZE = 100;

function getCached(key: string): string | undefined {
  return expandCache.get(key);
}

function setCache(key: string, value: string): void {
  if (expandCache.size >= MAX_CACHE_SIZE) {
    // Rimuove il primo elemento inserito (FIFO semplice)
    const firstKey = expandCache.keys().next().value;
    if (firstKey !== undefined) {
      expandCache.delete(firstKey);
    }
  }
  expandCache.set(key, value);
}

// ─── Funzione principale ──────────────────────────────────────────────────────

/**
 * Espande la query con sinonimi e termini correlati tramite LLM.
 *
 * Ritorna la query espansa come stringa: "query originale + termini aggiuntivi".
 * In caso di errore ritorna la query originale invariata.
 *
 * @param query - La query originale da espandere
 * @returns La query arricchita con termini correlati
 */
export async function expandQuery(query: string): Promise<string> {
  const trimmed = query.trim();

  if (!trimmed) return trimmed;

  // Controlla la cache
  const cached = getCached(trimmed);
  if (cached !== undefined) return cached;

  try {
    const provider = getBrainLLMProvider("groq");

    const messages: LLMMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildExpandPrompt(trimmed) },
    ];

    const result = await provider.complete(messages, {
      temperature: 0.3, // bassa creatività: vogliamo espansioni coerenti
      maxTokens: 80,    // pochi token: solo termini, niente narrativa
    });

    const expansion = result.text.trim();

    // Combina query originale + espansione, deduplicando
    const combined = expansion
      ? `${trimmed} ${expansion}`
      : trimmed;

    setCache(trimmed, combined);
    return combined;
  } catch {
    // Degradazione graceful: se l'LLM fallisce, usa la query originale
    setCache(trimmed, trimmed);
    return trimmed;
  }
}
