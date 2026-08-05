import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { getCurrentRuoli, type UtenteConRuoli } from "@/lib/auth/session";
import {
  AREA_COOKIE,
  areaCookieOptions,
  areaConsenteAccesso,
  risolviAreaAttiva,
  type AreaAttiva,
} from "@/lib/auth/area";

/**
 * AREA ATTIVA DI SESSIONE — helper centrale SERVER.
 *
 * Unico punto di accesso all'area attiva (cookie httpOnly lh_area) per
 * LAYOUT e ROUTE HANDLER API. Il proxy edge usa le stesse funzioni pure
 * di lib/auth/area.ts (risolviAreaAttiva/areaConsenteAccesso), quindi la
 * logica non è mai duplicata: cambia solo il trasporto (redirect vs JSON).
 *
 * Regole garantite:
 * - l'area è scelta SOLO al login e resta fissa fino al logout;
 * - un cookie mancante/invalido/non coerente con i ruoli viene risolto
 *   automaticamente all'area consentita dell'utente (e riscritto nelle
 *   route handler, dove la scrittura dei cookie è permessa);
 * - nessuna richiesta può uscire dall'area della sessione (403).
 */

export type SessioneArea = UtenteConRuoli & {
  /** Area attiva risolta della sessione (cookie valido o ripiego dai ruoli). */
  area: AreaAttiva;
  /** True se il cookie era mancante/invalido/non coerente (da riscrivere). */
  correzione: boolean;
};

/**
 * Legge l'area attiva della sessione (SOLA LETTURA: sicura in layout e
 * componenti server, dove i cookie non sono mutabili).
 * - null → utente non autenticato OPPURE senza alcuna area possibile.
 */
export async function getSessionArea(): Promise<SessioneArea | null> {
  const auth = await getCurrentRuoli();
  if (!auth) return null;

  const { user, role, ruoli } = auth;
  const cookieValue = (await cookies()).get(AREA_COOKIE)?.value;
  const { area, correzione } = risolviAreaAttiva(
    user.email ?? "",
    ruoli,
    cookieValue
  );

  if (!area) return null;
  return { user, role, ruoli, area, correzione };
}

export type EsitoAreaApi =
  | { sessione: SessioneArea; error: null }
  | { sessione: null; error: NextResponse };

/**
 * Verifica di accesso per le ROUTE HANDLER API: richiede che la sessione
 * sia autenticata E che la sua area attiva coincida con l'area richiesta
 * (con il ruolo corrispondente; per admin anche l'email autorizzata).
 * - 401 → non autenticato o senza area possibile;
 * - 403 → autenticato ma area di sessione diversa (es. sessione merchant
 *         che chiama un endpoint amministratore).
 * Inoltre riscrive automaticamente il cookie se era incoerente (qui la
 * scrittura dei cookie è consentita, a differenza dei layout).
 */
export async function requireApiArea(
  areaRichiesta: AreaAttiva
): Promise<EsitoAreaApi> {
  const sessione = await getSessionArea();
  if (!sessione) {
    return {
      sessione: null,
      error: apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401),
    };
  }

  // Cookie incoerente → rigenerato automaticamente con l'area corretta.
  if (sessione.correzione) {
    (await cookies()).set(AREA_COOKIE, sessione.area, areaCookieOptions());
  }

  if (
    !areaConsenteAccesso(
      sessione.user.email ?? "",
      sessione.ruoli,
      sessione.area,
      areaRichiesta
    )
  ) {
    return {
      sessione: null,
      error: apiError(
        "FORBIDDEN",
        "Questa sessione non è autorizzata per la risorsa richiesta.",
        403
      ),
    };
  }

  return { sessione, error: null };
}
