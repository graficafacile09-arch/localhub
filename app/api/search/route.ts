/**
 * LocalHub — API Route: /api/search
 *
 * Endpoint POST unificato per la ricerca pubblica (Fase C: discovery e filtri).
 * Usa search-service.ts come unico entry point.
 *
 * Request body:
 *   {
 *     query: string,
 *     // Filtri Fase C (tutti opzionali)
 *     categoria?: string,
 *     sottocategoria?: string,
 *     marca?: string,
 *     colore?: string,
 *     prezzoMin?: number,
 *     prezzoMax?: number,
 *     soloDisponibili?: boolean,
 *     filtriCatalogo?: Record<string, string>,
 *     ordina?: "rilevanza" | "prezzo_asc" | "prezzo_desc" | "novita",
 *     pagina?: number,
 *     perPagina?: number,
 *     // Riservati (Brain), oggi ignorati
 *     sessionId?: string, userId?: string, useMemory?: boolean
 *   }
 *
 * Backward compatibility: { "query": "panificio" } funziona esattamente come prima.
 *
 * Response body (200):
 *   SearchResult { negozi, prodotti, total, risposta, source, intent, intentConfidence, queryExpanded, processingMs }
 *
 * @module app/api/search/route
 */

import { NextResponse } from "next/server";
import { search, type SearchOptions } from "@/lib/search-service";
import { isOrdinamentoProdottiPubblici } from "@/lib/negozi";

function parseNum(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return undefined;
}

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

    const options: SearchOptions = {};

    if (typeof body.categoria === "string" && body.categoria.trim()) {
      options.categoria = body.categoria.trim();
    }
    if (typeof body.sottocategoria === "string" && body.sottocategoria.trim()) {
      options.sottocategoria = body.sottocategoria.trim();
    }
    if (typeof body.marca === "string" && body.marca.trim()) {
      options.marca = body.marca.trim();
    }
    if (typeof body.colore === "string" && body.colore.trim()) {
      options.colore = body.colore.trim();
    }

    const prezzoMin = parseNum(body.prezzoMin);
    const prezzoMax = parseNum(body.prezzoMax);
    if (prezzoMin !== undefined && prezzoMin > 0) options.prezzoMin = prezzoMin;
    if (prezzoMax !== undefined && prezzoMax > 0) options.prezzoMax = prezzoMax;

    if (body.soloDisponibili === true) options.soloDisponibili = true;

    if (
      body.filtriCatalogo &&
      typeof body.filtriCatalogo === "object" &&
      !Array.isArray(body.filtriCatalogo) &&
      Object.keys(body.filtriCatalogo).length > 0
    ) {
      options.filtriCatalogo = body.filtriCatalogo as Record<string, string>;
    }

    if (isOrdinamentoProdottiPubblici(body.ordina)) {
      options.ordina = body.ordina;
    }

    const pagina = parseNum(body.pagina);
    const perPagina = parseNum(body.perPagina);
    if (pagina !== undefined && pagina > 0) options.pagina = Math.min(Math.floor(pagina), 1000);
    if (perPagina !== undefined && perPagina > 0) options.perPagina = Math.min(Math.floor(perPagina), 60);

    const result = await search(query, { ...options, sessionId, userId, useMemory });

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
