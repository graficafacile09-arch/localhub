import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  getIncassiAdmin,
  type FiltriIncassiAdmin,
} from "@/lib/amministratore/incassi";

/**
 * GET /api/amministratore/incassi
 *
 * Rendicontazione GLOBALE degli incassi (tutti i negozi), SOLO sessione
 * admin. Riepilogo (GMV, incassato, commissioni, rimborsi, netto venditori,
 * conteggi) + elenco paginato con dettaglio economico per ordine. Filtri
 * SERVER-SIDE: data_da, data_a, negozio_id, provider, pagamento, stato,
 * pagina, per_pagina. Nessun importo/commissione accettato dal client come
 * valore autorevole: tutto è calcolato server-side dagli snapshot ordine.
 */
export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const url = new URL(request.url);
  const pagina = url.searchParams.get("pagina");
  const perPagina = url.searchParams.get("per_pagina");

  const filtri: FiltriIncassiAdmin = {
    dataDa: url.searchParams.get("data_da") ?? undefined,
    dataA: url.searchParams.get("data_a") ?? undefined,
    negozioId: url.searchParams.get("negozio_id") ?? undefined,
    provider: url.searchParams.get("provider") ?? undefined,
    pagamento: url.searchParams.get("pagamento") ?? undefined,
    stato: url.searchParams.get("stato") ?? undefined,
    pagina: pagina ? Number(pagina) : undefined,
    perPagina: perPagina ? Number(perPagina) : undefined,
  };

  try {
    const risultato = await getIncassiAdmin(filtri);
    return apiOk(risultato);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
