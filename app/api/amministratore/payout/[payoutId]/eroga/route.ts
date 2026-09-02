import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { aggiornaStatoPayoutAdmin } from "@/lib/amministratore/payout";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

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
  const { sessione, error } = await requireApiArea("admin");
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

  // Registra l'operazione amministrativa SOLO dopo il successo. Snapshot
  // minimo del payout (periodo/negozio/importo netto) letto dal DB, senza
  // dati di pagamento completi. Best-effort: un errore di log non fa
  // fallire la transizione di stato.
  try {
    const db = createAdminSupabaseClient();
    const { data: payout } = await db
      .from("payout")
      .select("*, negozi(nome)")
      .eq("id", payoutId)
      .single();
    const negozi = (payout?.negozi ?? null) as { nome?: string } | null;

    await registraAttivitaAdmin({
      adminUserId: sessione.user.id,
      adminEmail: sessione.user.email ?? "",
      operationType: OPERATION_TYPES.PAYOUT_STATO_MODIFICATO,
      targetType: TARGET_TYPES.PAYOUT,
      targetId: payoutId,
      targetName: payout?.periodo_da && payout?.periodo_a
        ? `Payout ${String(payout.periodo_da).slice(0, 10)} → ${String(payout.periodo_a).slice(0, 10)}`
        : payoutId,
      negozioId: payout?.negozio_id ?? null,
      negozioNome: negozi?.nome ?? null,
      result: "success",
      detail: {
        azione: azione,
        stato_precedente: payout?.stato ?? null,
        stato_nuovo: esito.stato,
        importo_netto: payout?.importo_netto ?? null,
        stripe_payout_id: typeof body.stripePayoutId === "string" ? body.stripePayoutId : null,
        stripe_payout_status: typeof body.stripePayoutStatus === "string" ? body.stripePayoutStatus : null,
        errore: typeof body.errore === "string" ? body.errore : null,
      },
    });
  } catch (err) {
    console.error(
      "[payout-admin] registrazione stato fallita:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return apiOk({ cambiato: esito.cambiato, stato: esito.stato });
}
