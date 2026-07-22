/**
 * LocalHub — API Route: /api/search
 *
 * Endpoint POST unificato per la ricerca.
 * Usa search-service.ts che gestisce Brain + fallback automaticamente.
 *
 * Request body:
 *   { query: string, sessionId?: string, userId?: string, useMemory?: boolean }
 *
 * Response body (200):
 *   SearchResult { negozi, risposta, source, intent, intentConfidence, queryExpanded, processingMs }
 *
 * Backward compatibility:
 *   - /api/ricerca-ai rimane invariato per i consumer esistenti
 *   - Questo endpoint è il nuovo standard per client-side search
 *
 * @module app/api/search/route
 */

import { NextResponse } from "next/server";
import { search } from "@/lib/search-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, sessionId, userId, useMemory } = body as {
      query?: string;
      sessionId?: string;
      userId?: string;
      useMemory?: boolean;
    };

    if (!query?.trim()) {
      return NextResponse.json(
        { error: "La query è vuota." },
        { status: 400 }
      );
    }

    const result = await search(query, { sessionId, userId, useMemory });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[/api/search] Errore:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Si è verificato un errore interno.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
