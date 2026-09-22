import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  calcolaPayoutAdmin,
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

/**
 * POST /api/amministratore/payout
 * Body: { negozioId, periodoDa, periodoA }.
 * Calcolo interno idempotente; nessun pagamento reale viene creato.
 */
export async function POST(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  let body: { negozioId?: unknown; periodoDa?: unknown; periodoA?: unknown };
  try {
    body = (await request.json()) as { negozioId?: unknown; periodoDa?: unknown; periodoA?: unknown };
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  const negozioId = typeof body.negozioId === "string" ? body.negozioId.trim() : "";
  const periodoDa = typeof body.periodoDa === "string" ? body.periodoDa.trim() : "";
  const periodoA = typeof body.periodoA === "string" ? body.periodoA.trim() : "";
  if (!negozioId || !/^\\d{4}-\\d{2}-\\d{2}$/.test(periodoDa) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(periodoA)) {
    return apiError("VALIDATION_ERROR", "Negozio o periodo non valido.", 422);
  }
  if (periodoDa > periodoA) {
    return apiError("PERIODO_NON_VALIDO", "Il periodo iniziale non può essere successivo al periodo finale.", 422);
  }

  try {
    const esito = await calcolaPayoutAdmin(negozioId, periodoDa, periodoA, sessione.user.id);
    if (!esito.ok) return apiError(esito.codice, esito.messaggio, esito.status);
    return apiOk({ payout: esito.payout, giaEsistente: esito.giaEsistente });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("SAVE_FAILED", message, 500);
  }
}
