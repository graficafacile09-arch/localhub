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

// ─── Rate limit in-memory per IP (guardia leggera anti-abuso) ───────────────
// L'endpoint è pubblico e ogni messaggio consuma token Groq (chiave con
// quota giornaliera): limitiamo le richieste per IP con una finestra
// scorrevole in memoria. Non usa DB né scan_log (legato all'auth merchant),
// e non richiede modifiche allo schema. Essendo per-istanza serverless è una
// prima difesa, non un limite assoluto.
const MAX_PER_MINUTO = 20;
const MAX_PER_ORA = 120;

const richiestePerIp = new Map<string, number[]>();

function rateLimitOk(ip: string): boolean {
  const ora = Date.now();
  const finestra = 3_600_000; // 1h

  // Pulizia occasionale per non far crescere la mappa all'infinito.
  if (richiestePerIp.size > 10_000) {
    for (const [chiave, arr] of richiestePerIp) {
      const vivi = arr.filter((t) => ora - t < finestra);
      if (vivi.length === 0) richiestePerIp.delete(chiave);
    }
  }

  const arr = (richiestePerIp.get(ip) ?? []).filter((t) => ora - t < finestra);
  arr.push(ora);
  richiestePerIp.set(ip, arr);

  if (arr.length > MAX_PER_ORA) return false;
  const ultimoMinuto = arr.filter((t) => ora - t < 60_000).length;
  return ultimoMinuto <= MAX_PER_MINUTO;
}

function ipRichiedente(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}

export async function POST(request: Request) {
  if (!rateLimitOk(ipRichiedente(request))) {
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
