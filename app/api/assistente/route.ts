/**
 * LocalHub — API Route: /api/assistente
 *
 * Nuovo endpoint dell'Assistente AI pubblico di InCittà.
 * Riceve la cronologia recente della conversazione e restituisce la risposta
 * intelligente (comprensione intento + retrieval + ragionamento).
 *
 * Request body:
 *   { messages: [{ role: "user" | "assistant", content: string }], sessionId?: string }
 *
 * Response (200):
 *   { risposta, negozi, prodotti, processingMs, source: "assistente" }
 *
 * NOTA: /api/search resta invariato (altri consumer); questo endpoint viene
 * usato ESCLUSIVAMENTE da AssistantChat.
 *
 * @module app/api/assistente/route
 */

import { NextResponse } from "next/server";
import { chatConAssistente, type MessaggioAssistente } from "@/lib/assistente";

export async function POST(request: Request) {
  let body: { messages?: unknown; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "Nessun messaggio." }, { status: 400 });
  }

  const messaggi: MessaggioAssistente[] = (body.messages as MessaggioAssistente[])
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .slice(-12);

  if (messaggi.length === 0) {
    return NextResponse.json({ error: "Nessun messaggio valido." }, { status: 400 });
  }

  try {
    const risultato = await chatConAssistente(messaggi);
    return NextResponse.json(risultato);
  } catch (error: unknown) {
    console.error("[/api/assistente] Errore:", error);
    const message =
      error instanceof Error ? error.message : "Si è verificato un errore interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
