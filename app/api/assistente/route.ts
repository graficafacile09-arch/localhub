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
import { checkRateLimit } from "@/lib/rate-limiter";

// ─── Rate limit CONDIVISO DB-backed per IP (guardia anti-abuso) ────────────
// L'endpoint è pubblico e ogni messaggio consuma token Gemini (chiave con
// quota giornaliera): limitiamo le richieste per IP con il meccanismo
// condiviso (contatore su scan_log via lib/rate-limiter.ts, `checkRateLimit`).
// Il contatore vive sul DB, non in memoria: è condiviso tra le istanze
// serverless e sopravvive ai cold start.
const MAX_PER_MINUTO = 20;
const MAX_PER_ORA = 120;

function ipRichiedente(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}

export async function POST(request: Request) {
  const rateCheck = await checkRateLimit(`assistente:${ipRichiedente(request)}`, {
    perMinute: MAX_PER_MINUTO,
    perHour: MAX_PER_ORA,
    reasonLabel: "messaggi",
    useSharedCounter: true,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error:
          "Troppe richieste in poco tempo. Riprova tra qualche minuto.",
      },
      { status: 429 }
    );
  }

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
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 800) }))
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
