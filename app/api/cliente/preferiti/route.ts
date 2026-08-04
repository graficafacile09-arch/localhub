import { apiError, apiOk } from "@/lib/api/response";
import { getApiUtente } from "@/lib/auth/session";
import {
  aggiungiPreferito,
  getPreferitiUtente,
  rimuoviPreferito,
  rimuoviPreferitoPerRiferimento,
} from "@/lib/cliente/favorites";
import type { TipoPreferito } from "@/lib/cliente/types";

const TIPI: TipoPreferito[] = ["negozio", "prodotto"];

function validaTipo(value: unknown): TipoPreferito | null {
  if (typeof value === "string" && TIPI.includes(value as TipoPreferito)) {
    return value as TipoPreferito;
  }
  return null;
}

function validaRiferimentoId(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

/**
 * API Preferiti dell'Area Clienti — riservata agli utenti con ruolo customer.
 * GET    → elenco con filtri (tipo, q, ordine, limite, offset).
 * POST   → aggiunge un negozio/prodotto ai preferiti (snapshot da dati reali).
 * DELETE → rimuove per id oppure per riferimento reale (toggle del cuore).
 */
export async function GET(request: Request) {
  const { user, ok } = await getApiUtente(["customer"]);
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  if (!ok) return apiError("FORBIDDEN", "Accesso riservato ai clienti.", 403);

  const { searchParams } = new URL(request.url);
  const tipoRaw = searchParams.get("tipo");
  const tipo = tipoRaw && tipoRaw !== "tutti" ? validaTipo(tipoRaw) : undefined;
  const q = searchParams.get("q")?.trim() || undefined;
  const ordineRaw = searchParams.get("ordine");
  const ordine =
    ordineRaw === "nome" || ordineRaw === "recenti" ? ordineRaw : undefined;
  const limite = Number(searchParams.get("limite") ?? "50");
  const offset = Number(searchParams.get("offset") ?? "0");

  if (tipoRaw && tipoRaw !== "tutti" && !tipo) {
    return apiError("VALIDATION_ERROR", "Tipologia non valida.", 422);
  }

  const preferiti = await getPreferitiUtente(user.id, {
    tipo: tipo ?? "tutti",
    q,
    ordine,
    limite: Number.isFinite(limite) ? limite : undefined,
    offset: Number.isFinite(offset) ? offset : undefined,
  });

  return apiOk({ preferiti });
}

export async function POST(request: Request) {
  const { user, ok } = await getApiUtente(["customer"]);
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  if (!ok) return apiError("FORBIDDEN", "Accesso riservato ai clienti.", 403);

  const body = (await request.json()) as Record<string, unknown>;
  const tipo = validaTipo(body.tipo);
  const riferimentoId = validaRiferimentoId(body.riferimentoId);

  if (!tipo || !riferimentoId) {
    return apiError(
      "VALIDATION_ERROR",
      "Tipologia e riferimento sono obbligatori.",
      422
    );
  }

  const preferito = await aggiungiPreferito(user.id, { tipo, riferimentoId });

  if (!preferito) {
    return apiError(
      "NOT_FOUND",
      "Elemento non trovato: non è più disponibile sulla piattaforma.",
      404
    );
  }

  return apiOk({ preferito }, 201);
}

export async function DELETE(request: Request) {
  const { user, ok } = await getApiUtente(["customer"]);
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  if (!ok) return apiError("FORBIDDEN", "Accesso riservato ai clienti.", 403);

  const body = (await request.json()) as Record<string, unknown>;

  // Rimozione per id del preferito.
  if (typeof body.id === "string" && body.id.trim()) {
    const rimosso = await rimuoviPreferito(user.id, body.id.trim());
    return rimosso
      ? apiOk({ rimossi: 1 })
      : apiError("DELETE_FAILED", "Impossibile rimuovere il preferito.", 500);
  }

  // Rimozione per riferimento reale (toggle del cuore).
  const tipo = validaTipo(body.tipo);
  const riferimentoId = validaRiferimentoId(body.riferimentoId);
  if (!tipo || !riferimentoId) {
    return apiError(
      "VALIDATION_ERROR",
      "Indica l'id del preferito oppure tipo e riferimento.",
      422
    );
  }

  const rimosso = await rimuoviPreferitoPerRiferimento(
    user.id,
    tipo,
    riferimentoId
  );
  return rimosso
    ? apiOk({ rimossi: 1 })
    : apiError("DELETE_FAILED", "Impossibile rimuovere il preferito.", 500);
}
