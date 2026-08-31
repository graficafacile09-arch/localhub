import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  getOrdiniAdmin,
  type FiltriOrdiniAdmin,
} from "@/lib/amministratore/ordini";

/**
 * GET /api/amministratore/ordini
 *
 * Elenco GLOBALE degli ordini (tutti i negozi), SOLO sessione admin.
 * Filtri e paginazione interamente SERVER-SIDE (admin client):
 *   q, stato, pagamento, stato_spedizione, negozio_id, modalita,
 *   data_da, data_a, pagina, per_pagina
 */
export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const url = new URL(request.url);
  const pagina = url.searchParams.get("pagina");
  const perPagina = url.searchParams.get("per_pagina");

  const filtri: FiltriOrdiniAdmin = {
    q: url.searchParams.get("q") ?? undefined,
    stato: url.searchParams.get("stato") ?? undefined,
    pagamento: url.searchParams.get("pagamento") ?? undefined,
    statoSpedizione: url.searchParams.get("stato_spedizione") ?? undefined,
    negozioId: url.searchParams.get("negozio_id") ?? undefined,
    modalita: url.searchParams.get("modalita") ?? undefined,
    dataDa: url.searchParams.get("data_da") ?? undefined,
    dataA: url.searchParams.get("data_a") ?? undefined,
    pagina: pagina ? Number(pagina) : undefined,
    perPagina: perPagina ? Number(perPagina) : undefined,
  };

  try {
    const risultato = await getOrdiniAdmin(filtri);
    return apiOk(risultato);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
