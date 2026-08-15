import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  getPayoutAdmin,
  type FiltriPayoutAdmin,
} from "@/lib/amministratore/payout";

/**
 * GET /api/amministratore/payout
 *   Payout globali (tutti i negozi) con riepilogo aggregato, filtri e
 *   paginazione SERVER-SIDE (negozio_id, stato, data_da, data_a, pagina,
 *   per_pagina). Solo admin; RLS admin delimita l'accesso.
 */
export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const url = new URL(request.url);
  const pagina = url.searchParams.get("pagina");
  const perPagina = url.searchParams.get("per_pagina");

  const filtri: FiltriPayoutAdmin = {
    negozioId: url.searchParams.get("negozio_id") ?? undefined,
    stato: url.searchParams.get("stato") ?? undefined,
    dataDa: url.searchParams.get("data_da") ?? undefined,
    dataA: url.searchParams.get("data_a") ?? undefined,
    pagina: pagina ? Number(pagina) : undefined,
    perPagina: perPagina ? Number(perPagina) : undefined,
  };

  try {
    const risultato = await getPayoutAdmin(filtri);
    return apiOk(risultato);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
