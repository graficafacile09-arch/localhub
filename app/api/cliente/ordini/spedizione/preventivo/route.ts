import { apiError, apiOk } from "@/lib/api/response";
import { getPreventivoSpedizione } from "@/lib/spedizioni/motore";

/**
 * POST /api/cliente/ordini/spedizione/preventivo (BUY-NOW)
 *
 * Preventivo spedizione server-side per un singolo prodotto. Il client invia
 * SOLO prodottoId + quantità: il peso e le tariffe vengono letti dal database
 * (mai un prezzo dal browser). Restituisce l'intero catalogo corrieri/servizi
 * con il prezzo calcolato e il flag `disponibile` reale.
 *
 * Endpoint di SOLA LETTURA: nessun ordine, nessuna sessione, nessuna scrittura.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const prodottoId =
    typeof body.prodottoId === "string" || typeof body.prodottoId === "number"
      ? String(body.prodottoId).trim()
      : "";
  if (!/^\d+$/.test(prodottoId)) {
    return apiError("VALIDATION_ERROR", "Prodotto non valido.", 422);
  }

  const quantita = Number(body.quantita);
  if (!Number.isInteger(quantita) || quantita < 1 || quantita > 99) {
    return apiError("VALIDATION_ERROR", "Quantità non valida (1-99).", 422);
  }

  const preventivo = await getPreventivoSpedizione([{ prodottoId, quantita }]);
  if (!preventivo.ok) {
    return apiError(preventivo.codice ?? "SPEDIZIONE_UNAVAILABLE", preventivo.messaggio ?? "Impossibile calcolare la spedizione.", 422);
  }

  return apiOk(preventivo);
}
