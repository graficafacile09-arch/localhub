import { apiError, apiOk } from "@/lib/api/response";
import { getMetodiPagamentoPubbliciMulti } from "@/lib/pagamenti/metodi-pubblici";

/**
 * POST /api/cliente/ordini/carrello/metodi
 *
 * Restituisce i metodi di pagamento disponibili per TUTTI i negozi indicati
 * (intersezione), riusando la STESSA fonte autorevole del buy-now
 * (getMetodiPagamentoPubblici → getMetodiPagamentoPubbliciMulti). Usata dal
 * checkout carrello (client-side) per mostrare la STESSA disponibilità reale
 * dei metodi: carta/klarna compaiono SOLO se realmente configurabili per ogni
 * negozio del carrello, bonifico è sempre presente (metodo base).
 *
 * Endpoint di sola lettura: nessun ordine, nessuna sessione, nessuna scrittura.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const negoziRaw = body.negozi;
  if (!Array.isArray(negoziRaw)) {
    return apiError("VALIDATION_ERROR", "Elenco negozi non valido.", 422);
  }

  const negozi = (negoziRaw as unknown[])
    .map((n) => String(n ?? "").trim())
    .filter(Boolean)
    .slice(0, 50);

  const metodi = await getMetodiPagamentoPubbliciMulti(negozi);
  return apiOk({ metodi });
}
