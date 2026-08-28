import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  setGuestMode,
  clearGuestMode,
  type GuestIntent,
} from "@/lib/auth/guest";

export const runtime = "nodejs";

/**
 * POST /api/auth/guest — UNICO punto di entrata/uscita dalla modalità ospite.
 *
 * Due modalità d'uso con lo STESSO contratto (intent):
 *
 * 1. NAVIGAZIONE NATIVA (form HTML method="post" — usato dal menu account):
 *    campi `intent=activate|exit` e opzionale `referer` (URL di provenienza).
 *    Risposta: 303 See Other verso la pagina di provenienza (pattern PRG),
 *    con Set-Cookie applicato AL REDIRECT: il browser segue il 303, ricarica
 *    la pagina e l'header riappare nello stato corretto. Nessun fetch,
 *    nessuno stato React: è una vera navigazione.
 *
 * 2. FETCH JSON (compat API): body `{ intent?, referer? }`.
 *    Risposta: JSON `{ redirectUrl }` con Set-Cookie sulla stessa risposta.
 *
 * SICUREZZA: il redirect è consentito SOLO verso lo stesso origin
 * (niente open redirect); l'utente GIÀ autenticato non riceve il cookie
 * (non gli serve la modalità ospite).
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  // ── Parse dell'intent e della destinazione ────────────────────────────
  let intent: GuestIntent = "activate";
  let candidato: string | null = null;

  if (isJson) {
    try {
      const body = (await request.json()) as { intent?: string; referer?: string };
      if (body.intent === "exit") intent = "exit";
      candidato = typeof body.referer === "string" ? body.referer : null;
    } catch {
      // body mancante/non valido → default: activate + fallback "/"
    }
  } else {
    try {
      const form = await request.formData();
      if (form.get("intent") === "exit") intent = "exit";
      const refererField = form.get("referer");
      candidato = typeof refererField === "string" && refererField ? refererField : null;
    } catch {
      // form senza campi → default: activate + fallback (Referer header o "/")
    }
  }

  // Fallback: header Referer della navigazione nativa (stesso origin con la
  // policy di default `strict-origin-when-cross-origin`).
  if (!candidato) candidato = request.headers.get("referer");

  // ── Destinazione: SOLO stesso origin (anti open-redirect) ─────────────
  const origin = new URL("/", request.url).origin;
  let destinazione = "/";
  if (candidato) {
    try {
      const url = new URL(candidato, origin);
      if (url.origin === origin) destinazione = url.pathname + url.search;
    } catch {
      // URL di provenienza non valido → fallback "/"
    }
  }

  // ── Utente già autenticato: la modalità ospite non serve ──────────────
  const utente = await getCurrentUser();
  if (utente) {
    if (isJson) {
      return NextResponse.json(
        { redirectUrl: "/" },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    return NextResponse.redirect(new URL("/", request.url), 303);
  }

  if (isJson) {
    const response = NextResponse.json(
      { redirectUrl: destinazione },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
    if (intent === "exit") {
      await clearGuestMode(response);
    } else {
      await setGuestMode(response);
    }
    return response;
  }

  // ── Navigazione nativa: 303 PRG con cookie AL REDIRECT ────────────────
  const response = NextResponse.redirect(new URL(destinazione, request.url), 303);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  if (intent === "exit") {
    await clearGuestMode(response);
  } else {
    await setGuestMode(response);
  }
  return response;
}

/**
 * DELETE /api/auth/guest
 * Disattiva la modalità guest (rimuove cookie lh_guest). Compat JSON API.
 */
export async function DELETE(request: Request) {
  const origin = new URL("/", request.url).origin;
  let redirectUrl = "/login?area=cliente";
  try {
    const body = (await request.json()) as { referer?: string };
    if (body.referer) {
      const url = new URL(body.referer, origin);
      if (url.origin === origin) redirectUrl = url.pathname + url.search;
    }
  } catch {
    // Ignora errori di parsing, usa default
  }

  const response = NextResponse.json(
    { redirectUrl },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
  await clearGuestMode(response);
  return response;
}
