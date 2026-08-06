/**
 * Verifica REALE della Partita IVA italiana tramite il servizio ufficiale
 * VIES (VAT Information Exchange System) della Commissione Europea.
 *
 * Endpoint ufficiale (documentazione: swagger_publicVAT.yaml, VOW EIS v1.21):
 *   POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
 *   body: { "countryCode": "IT", "vatNumber": "<11 cifre>" }
 *   risposta 200: { "valid": true|false, ... }
 *   errori:       { "actionSucceed": false, "errorWrappers": [{ "error", "message" }] }
 *
 * Questo modulo DEVE essere usato solo lato server (Route Handler): non
 * viene mai importato dal client, per non esporre logica di rete al browser.
 */

import { normalizzaPartitaIva } from "@/lib/partita-iva";

export type EsitoVerificaPartitaIva =
  | { stato: "valida" }
  | { stato: "non_valida" }
  | { stato: "non_verificabile" };

const VIES_URL =
  "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

const TIMEOUT_MS = 7000;

export async function verificaPartitaIvaConVies(
  value: string,
): Promise<EsitoVerificaPartitaIva> {
  const piva = normalizzaPartitaIva(value);

  let response: Response;
  try {
    response = await fetch(VIES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({ countryCode: "IT", vatNumber: piva }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Timeout / rete non raggiungibile: il venditore NON viene creato.
    return { stato: "non_verificabile" };
  }

  if (response.status === 200) {
    try {
      const data = await response.json();
      if (typeof data === "object" && data !== null) {
        if (data.valid === true) return { stato: "valida" };
        if (data.valid === false) return { stato: "non_valida" };
        // ActionError / Http codes that came as 200: servizio ko.
        if ((data as { actionSucceed?: boolean }).actionSucceed === false) {
          return { stato: "non_verificabile" };
        }
      }
      return { stato: "non_verificabile" };
    } catch {
      return { stato: "non_verificabile" };
    }
  }

  if (response.status >= 500) return { stato: "non_verificabile" };

  // 400 (input non valido) / 403: la Partita IVA non è riconosciuta.
  return { stato: "non_valida" };
}