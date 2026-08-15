import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { aggiornaStatoPayoutAdmin } from "@/lib/amministratore/payout";

/**
 * POST /api/amministratore/payout/[payoutId]/eroga
 *   Azioni di stato del payout (admin): body { azione: "in_erogazione" |
 *   "pagato" | "fallito", stripePayoutId?, stripePayoutStatus?, errore? }.
 *   Nessuna chiamata Stripe in V1: si registra SOLO il tracciamento interno.
 *   La transizione è validata dalla RPC (macchina a stati, idempotente).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ payoutId: string }> }
) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const { payoutId } = await context.params;

  let body: {
    azione?: unknown;
    stripePayoutId?: unknown;
    stripePayoutStatus?: unknown;
    errore?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  const azione = body.azione;
  if (azione !== "in_erogazione" && azione !== "pagato" && azione !== "fallito") {
    return apiError("VALIDATION_ERROR", "Azione non valida.", 422);
  }

  const esito = await aggiornaStatoPayoutAdmin(payoutId, azione, {
    stripePayoutId: typeof body.stripePayoutId === "string" ? body.stripePayoutId : null,
    stripePayoutStatus:
      typeof body.stripePayoutStatus === "string" ? body.stripePayoutStatus : null,
    errore: typeof body.errore === "string" ? body.errore : null,
  });
  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }
  return apiOk({ cambiato: esito.cambiato, stato: esito.stato });
}
