import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

/**
 * MODALITÀ GUEST ESPLICITA (cookie httpOnly "lh_guest").
 *
 * La modalità guest viene attivata SOLO quando l'utente sceglie
 * esplicitamente "ACQUISTA SENZA ACCOUNT" dal menu account.
 *
 * Il cookie è httpOnly: il browser NON può leggerlo né modificarlo.
 * L'unico modo per entrare/uscire dalla modalità guest è la route
 * dedicata /api/auth/guest (POST con intent "activate" | "exit"),
 * che imposta/cancella il cookie lato server con QUESTI attributi.
 *
 * UNA SOLA LOGICA: qui vivono nome, valore, attributi e helpers.
 * La route API (app/api/auth/guest) è l'unico punto di scrittura.
 */

export const GUEST_COOKIE = "lh_guest";
export const GUEST_COOKIE_VALUE = "1";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 giorni

/** Intent esplicito della richiesta alla route /api/auth/guest. */
export type GuestIntent = "activate" | "exit";

/**
 * Attributi UNICI del cookie guest.
 * `secure` segue NODE_ENV: in produzione (HTTPS) è Secure; in sviluppo
 * su http://localhost NON deve esserci, altrimenti il browser rifiuta
 * il cookie e la modalità non si attiva mai.
 */
export function guestCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  };
}

/** Verifica se il cookie guest è presente e valido. */
export function isGuestMode(cookieValue: string | null | undefined): boolean {
  return cookieValue === GUEST_COOKIE_VALUE;
}

/** Legge lo stato guest dalla richiesta (SOLA LETTURA: sicura in layout e componenti server). */
export async function getGuestMode(): Promise<boolean> {
  const cookieValue = (await cookies()).get(GUEST_COOKIE)?.value;
  return isGuestMode(cookieValue);
}

/** Imposta il cookie guest su una NextResponse (scrittura: solo route handler / server actions). */
export async function setGuestMode(response: NextResponse): Promise<void> {
  response.cookies.set(GUEST_COOKIE, GUEST_COOKIE_VALUE, guestCookieOptions());
}

/** Rimuove il cookie guest (uscita dalla modalità ospite, login, logout). */
export async function clearGuestMode(response: NextResponse): Promise<void> {
  // Sovrascrittura esplicita con gli stessi attributi + maxAge=0:
  // il browser elimina il cookie in modo deterministico.
  response.cookies.set(GUEST_COOKIE, "", {
    ...guestCookieOptions(),
    maxAge: 0,
  });
}

/**
 * Verifica se l'utente può procedere all'acquisto:
 * - Utente autenticato → SEMPRE consentito
 * - Utente NON autenticato → SOLO se in modalità guest esplicita
 */
export function canPurchase(autenticato: boolean, guestMode: boolean): boolean {
  return autenticato || guestMode;
}
