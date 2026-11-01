/**
 * Pino — Orchestratore principale.
 *
 * Le richieste informative sono gestite da Gemini Function Calling:
 * 1. Gemini interpreta la conversazione e sceglie uno strumento dichiarato;
 * 2. Node.js esegue il retrieval tramite i servizi InCittà autorizzati;
 * 3. Gemini formula la risposta usando il risultato effettivo dello strumento.
 *
 * Le risposte relazionali semplici restano locali e non consumano chiamate AI.
 */

import { chatConFunctionCalling } from "./function-calling";
import { rispostaIdentitaPino } from "./identity";
import { rispostaSalutoPino, rispostaRelazionalePino } from "./greetings";
import { rilevaLinguaConversazionePino } from "./understanding";

// ─── Tipi pubblici ───────────────────────────────────────────────────────────

export type MessaggioAssistente = {
  role: "user" | "assistant";
  content: string;
};

export interface RispostaAssistente {
  risposta: string;
  negozi: import("@/lib/ricerca-ai").NegozioRicerca[];
  prodotti: import("@/lib/ricerca-ai").ProdottoRicerca[];
  processingMs: number;
  source: "assistente";
  intent?: string;
  followUp?: string;
}

// ─── Normalizzazione cronologia ──────────────────────────────────────────────

function normalizzaMessaggi(messages: MessaggioAssistente[]): MessaggioAssistente[] {
  return (messages ?? [])
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 800) }))
    .slice(-12);
}

/** Estrae i nomi già mostrati per evitare duplicati nelle richieste "fammi vedere altro". */
export function nomiGiaMostrati(storico: MessaggioAssistente[]): string[] {
  const nomi = new Set<string>();
  for (const messaggio of storico.filter((m) => m.role === "assistant")) {
    const testo = messaggio.content ?? "";
    const regex = /^-\\s+\\*\\*([^*]+)\\*\\*/gim;
    for (const match of testo.matchAll(regex)) {
      const nome = (match[1] ?? "").trim();
      if (nome) nomi.add(nome.toLowerCase());
    }
  }
  return Array.from(nomi);
}

// ─── API interna Pino ────────────────────────────────────────────────────────

export async function chatConAssistente(
  messages: MessaggioAssistente[]
): Promise<RispostaAssistente> {
  const inizio = Date.now();
  const storico = normalizzaMessaggi(messages);
  const ultimo = storico[storico.length - 1];
  const domanda = (ultimo && ultimo.role === "user" ? ultimo.content : "").slice(0, 800);
  const lingua = rilevaLinguaConversazionePino(storico);

  const rispostaDiretta =
    rispostaIdentitaPino(domanda) ??
    rispostaRelazionalePino(domanda, lingua) ??
    rispostaSalutoPino(domanda);

  if (rispostaDiretta) {
    return {
      risposta: rispostaDiretta,
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
    };
  }

  return chatConFunctionCalling(storico, inizio);
}
