import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  calcolaPayoutVenditore,
  getPayoutVenditore,
  getRiepilogoPayoutVenditore,
} from "@/lib/merchant/payout";

/**
 * GET /api/merchant/stores/[negozioId]/payout
 *   Storico payout + riepilogo (saldo disponibile, totale erogato).
 *
 * POST /api/merchant/stores/[negozioId]/payout
 *   Body: { periodoDa, periodoA } → calcola il payout del periodo (RPC
 *   service-role, idempotente). Nessun importo/commissione dal client:
 *   tutto è calcolato server-side dagli snapshot ordine.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;

  try {
    const [storico, riepilogo] = await Promise.all([
      getPayoutVenditore(user.id, negozioId),
      getRiepilogoPayoutVenditore(user.id, negozioId),
    ]);
    return apiOk({ payout: storico, riepilogo });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;

  let body: { periodoDa?: unknown; periodoA?: unknown };
  try {
    body = (await request.json()) as { periodoDa?: unknown; periodoA?: unknown };
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  const periodoDa = typeof body.periodoDa === "string" ? body.periodoDa.trim() : "";
  const periodoA = typeof body.periodoA === "string" ? body.periodoA.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodoDa) || !/^\d{4}-\d{2}-\d{2}$/.test(periodoA)) {
    return apiError("VALIDATION_ERROR", "Periodo non valido (formato YYYY-MM-DD).", 422);
  }

  const esito = await calcolaPayoutVenditore(user.id, negozioId, periodoDa, periodoA);
  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }
  return apiOk({ payout: esito.payout, giaEsistente: esito.giaEsistente });
}
