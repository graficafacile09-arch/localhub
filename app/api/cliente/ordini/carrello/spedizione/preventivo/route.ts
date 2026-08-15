import { apiError, apiOk } from "@/lib/api/response";
import { getPreventivoSpedizione } from "@/lib/spedizioni/motore";

/**
 * POST /api/cliente/ordini/carrello/spedizione/preventivo (CHECKOUT CARRELLO)
 *
 * Preventivo spedizione server-side per il carrello. Il client invia SOLO le
 * righe (prodottoId + quantità): peso e tariffe vengono letti dal database.
 * Il prezzo di ogni opzione è la SOMMA dei costi per negozio (ogni negozio del
 * carrello genera un ordine/consegna separato). Restituisce il catalogo
 * corrieri/servizi con `disponibile` = intersezione tra tutti i negozi.
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

  const righeRaw = body.righe;
  if (!Array.isArray(righeRaw) || righeRaw.length < 1 || righeRaw.length > 50) {
    return apiError("VALIDATION_ERROR", "Il carrello deve contenere da 1 a 50 prodotti.", 422);
  }

  const righe: { prodottoId: string; quantita: number }[] = [];
  for (let i = 0; i < righeRaw.length; i++) {
    const r = (righeRaw[i] ?? {}) as Record<string, unknown>;
    const prodottoId =
      typeof r.prodottoId === "string" || typeof r.prodottoId === "number"
        ? String(r.prodottoId).trim()
        : "";
    if (!/^\d+$/.test(prodottoId)) {
      return apiError("VALIDATION_ERROR", `Prodotto non valido (riga ${i + 1}).`, 422);
    }
    const quantita = Number(r.quantita);
    if (!Number.isInteger(quantita) || quantita < 1 || quantita > 99) {
      return apiError("VALIDATION_ERROR", `Quantità non valida (1-99) per la riga ${i + 1}.`, 422);
    }
    righe.push({ prodottoId, quantita });
  }

  const preventivo = await getPreventivoSpedizione(righe);
  if (!preventivo.ok) {
    return apiError(preventivo.codice ?? "SPEDIZIONE_UNAVAILABLE", preventivo.messaggio ?? "Impossibile calcolare la spedizione.", 422);
  }

  return apiOk(preventivo);
}
