/**
 * LocalHub Brain — Reasoning Step: Synthesize
 *
 * Genera la risposta finale in linguaggio naturale utilizzando l'LLM.
 * Combina il contesto della query, l'intento classificato, il piano decisionale
 * e i candidati rankati per produrre una risposta comprensibile all'utente.
 *
 * Questo step viene eseguito alla fine della pipeline Brain per presentare
 * i risultati in modo naturale e conversazionale.
 *
 * Se l'LLM non è disponibile, ritorna un fallback generato localmente.
 *
 * @module lib/brain/reasoning/steps/synthesize
 */

import { getBrainLLMProvider } from "../../providers";
import type { LLMMessage } from "../../providers/base";
import type { BrainContext } from "../../types";

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei un assistente per un motore di ricerca locale italiano chiamato LocalHub.
Il tuo compito è generare risposte naturali e conversazionali basate sui risultati di ricerca.

Regole:
- Rispondi in italiano, in modo conciso e naturale.
- Se ci sono risultati, presentali in modo chiaro.
- Se non ci sono risultati, suggerisci alternative.
- Massimo 3-4 frasi.
- Non inventare informazioni non presenti nei dati.
- Usa un tono amichevole e professionale.`;

/**
 * Costruisce il prompt user per la sintesi della risposta.
 */
function buildSynthesizePrompt(context: BrainContext): string {
  const { query, intent, decisionPlan, candidates } = context;

  let prompt = `Query utente: "${query}"\n`;

  // Aggiungi informazioni sull'intento
  if (intent) {
    prompt += `Intento rilevato: ${intent.type} (confidenza: ${intent.confidence}%)\n`;
    if (intent.extractedEntities.length > 0) {
      prompt += `Entità estratte: ${intent.extractedEntities.join(", ")}\n`;
    }
  }

  // Aggiungi informazioni sul piano
  if (decisionPlan) {
    prompt += `Strategia di ricerca: ${decisionPlan.strategy}\n`;
  }

  // Aggiungi i candidati (top 5)
  const topCandidates = candidates.slice(0, 5);
  if (topCandidates.length === 0) {
    prompt += `\nNessun risultato trovato.\n`;
  } else {
    prompt += `\nRisultati trovati (${candidates.length} totali, mostrando i primi ${topCandidates.length}):\n`;
    topCandidates.forEach((candidate, i) => {
      const data = candidate.data;
      const nome = (data.nome as string) || `Negozio ${candidate.id}`;
      const categoria = data.categoria ? ` (${data.categoria})` : "";
      const score = candidate.combinedScore.toFixed(2);
      prompt += `${i + 1}. ${nome}${categoria} - relevance: ${score}\n`;
    });
  }

  prompt += `\nGenera una risposta naturale per l'utente basandoti su questi dati.`;

  return prompt;
}

// ─── Fallback locale ──────────────────────────────────────────────────────────

/**
 * Genera una risposta di fallback senza LLM.
 * Produce un testo semplice basato sui candidati disponibili.
 */
function generateFallbackResponse(context: BrainContext): string {
  const { query, candidates } = context;

  if (candidates.length === 0) {
    return `Mi dispiace, non ho trovato risultati per "${query}". Prova a riformulare la ricerca o a usare termini più generali.`;
  }

  const topCandidates = candidates.slice(0, 3);
  const names = topCandidates.map(c => {
    const data = c.data;
    return (data.nome as string) || `Negozio ${c.id}`;
  });

  if (candidates.length === 1) {
    return `Ho trovato: ${names[0]}.`;
  }

  if (candidates.length === 2) {
    return `Ho trovato 2 risultati: ${names[0]} e ${names[1]}.`;
  }

  if (candidates.length <= 3) {
    return `Ho trovato ${candidates.length} risultati: ${names.join(", ")}.`;
  }

  // Più di 3 candidati
  const rest = candidates.length - 3;
  return `Ho trovato ${candidates.length} risultati per "${query}". I primi tre sono: ${names.join(", ")}${rest > 0 ? ` e altri ${rest}` : ""}.`;
}

// ─── Funzione principale ──────────────────────────────────────────────────────

/**
 * Genera la risposta finale in linguaggio naturale.
 *
 * Usa l'LLM per produrre una risposta contestuale e conversazionale.
 * In caso di errore o LLM non disponibile, ritorna un fallback locale.
 *
 * @param context - Il contesto Brain completo
 * @returns La risposta in linguaggio naturale
 */
export async function synthesizeResponse(context: BrainContext): Promise<string> {
  try {
    const provider = getBrainLLMProvider("groq");

    const messages: LLMMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildSynthesizePrompt(context) },
    ];

    const result = await provider.complete(messages, {
      temperature: 0.7, // moderata creatività per tono naturale
      maxTokens: 150,   // sufficiente per 3-4 frasi
    });

    return result.text.trim();
  } catch (error) {
    // Degradazione graceful: se l'LLM fallisce, usa il fallback locale
    console.warn(`[synthesizeResponse] LLM fallback attivo:`, error);
    return generateFallbackResponse(context);
  }
}
