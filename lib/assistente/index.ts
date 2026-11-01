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
import type { PinoIntent } from "./intent";
import type { FollowUpTipo } from "./conversazione";
import type { NegozioRicerca, ProdottoRicerca } from "@/lib/ricerca-ai";

// ─── Tipi pubblici ───────────────────────────────────────────────────────────

export type MessaggioAssistente = {
  role: "user" | "assistant";
  content: string;
};

export interface RispostaAssistente {
  risposta: string;
  negozi: NegozioRicerca[];
  prodotti: ProdottoRicerca[];
  processingMs: number;
  source: "assistente";
  intent?: PinoIntent;
  followUp?: FollowUpTipo;
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

function rispostaPiattaformaPino(domanda: string): string | null {
  const q = domanda.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
  const pattern = /che cos['’]?e incitta|cos['’]?e incitta|come funziona|cos['’]?e il sito|what is incitta|how does incitta work|what is this site/;
  if (!pattern.test(q)) return null;
  return /\\b(what|how)\\b/i.test(q)
    ? "InCittà is the local platform for your city. It brings together local businesses, products and prices, offers and promotions, events and useful information. You can search for businesses, compare products, check opening hours and contact local shops."
    : "InCittà è la piattaforma locale della tua città: raccoglie le attività commerciali del territorio con i loro negozi, prodotti e prezzi, offerte e promozioni, eventi e manifestazioni. Puoi cercare attività, confrontare prodotti, vedere orari e contatti e contattare i negozi direttamente.";
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
    rispostaPiattaformaPino(domanda) ??
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
