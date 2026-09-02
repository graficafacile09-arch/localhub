import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { annullaPayoutAdmin } from "@/lib/amministratore/payout";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

/**
 * POST /api/amministratore/payout/[payoutId]/annulla
 *
 * Annulla un payout interno V1. Consentito SOLO da stato `calcolato`
 * (la RPC `payout_annulla` è idempotente e rifiuta payout già pagati).
 * Nessun pagamento Stripe reale viene creato o annullato in V1.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ payoutId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { payoutId } = await context.params;

  const esito = await annullaPayoutAdmin(payoutId);
  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }

  // Registra l'operazione amministrativa SOLO dopo il successo.
  // Snapshot minimo del payout (periodo/negozio/importo netto) letto dal
  // DB, senza dati di pagamento completi. Best-effort: un errore di log
  // non fa fallire l'annullamento.
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
      operationType: OPERATION_TYPES.PAYOUT_ANNULLATO,
      targetType: TARGET_TYPES.PAYOUT,
      targetId: payoutId,
      targetName: payout?.periodo_da && payout?.periodo_a
        ? `Payout ${String(payout.periodo_da).slice(0, 10)} → ${String(payout.periodo_a).slice(0, 10)}`
        : payoutId,
      negozioId: payout?.negozio_id ?? null,
      negozioNome: negozi?.nome ?? null,
      result: "success",
      detail: {
        stato_precedente: payout?.stato ?? null,
        importo_netto: payout?.importo_netto ?? null,
      },
    });
  } catch (err) {
    console.error(
      "[payout-admin] registrazione annullamento fallita:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return apiOk({ cambiato: esito.cambiato, stato: esito.stato });
}
