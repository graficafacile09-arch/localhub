import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { getCurrentRuoli, type UtenteConRuoli } from "@/lib/auth/session";
import { getAccountApprovalStatus } from "@/lib/auth/account-approval";
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
 * LAYOUT e ROUTE HANDLER API.
 *
 * Regole garantite:
 * - l'area è scelta SOLO al login e resta fissa fino al logout;
 * - un cookie mancante/invalido/non coerente con i ruoli viene risolto
 *   automaticamente all'area consentita dell'utente;
 * - nessuna richiesta API può uscire dall'area della sessione;
 * - nessuna API protetta può essere usata da un account non approvato.
 */

export type SessioneArea = UtenteConRuoli & {
  area: AreaAttiva;
  correzione: boolean;
};

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
 * Gate server-side AUTOREVOLE per tutte le API di area.
 *
 * L'approvazione viene verificata prima del controllo area: anche se qualcuno
 * riesce a bypassare il proxy/browser, una route handler non può concedere
 * accesso a un account pending/rejected.
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

  const approvalStatus = await getAccountApprovalStatus(sessione.user.id);
  if (approvalStatus !== "approved") {
    return {
      sessione: null,
      error: apiError(
        "ACCOUNT_NOT_APPROVED",
        approvalStatus === "rejected"
          ? "Il tuo account non è stato approvato dall'amministratore."
          : "Il tuo account è in attesa di approvazione da parte dell'amministratore.",
        403
      ),
    };
  }

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
