import { apiError, apiOk } from "@/lib/api/response";
import {
  creaSessioneStripePerOrdine,
  elaboraPagamentiScaduti,
} from "@/lib/pagamenti/sessioni";

/**
 * POST /api/pagamenti/sessioni
 *
 * Crea (o riusa) la sessione di pagamento Stripe per un ordine GIÀ
 * esistente in attesa di pagamento (payment_status = pending/failed).
 * Usato dal pulsante "Riprova pagamento" della pagina di conferma ordine
 * quando l'utente ha abbandonato Stripe senza completare.
 *
 * L'importo è SEMPRE letto dal DB (ordine.totale): nessun valore dal client.
 * Accesso pubblico come il checkout (UUID dell'ordine non indovinabile);
 * guardie server-side: ordine pagato/concluso → rifiutato.
 */
export async function POST(request: Request) {
  let body: { ordineId?: unknown };
  try {
    body = (await request.json()) as { ordineId?: unknown };
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const ordineId =
    typeof body.ordineId === "string" && body.ordineId.trim()
      ? body.ordineId.trim()
      : "";
  if (!ordineId) {
    return apiError("VALIDATION_ERROR", "Ordine non valido.", 422);
  }

  // Sweep best-effort prima di procedere (consistenza eventuale scadenze).
  await elaboraPagamentiScaduti().catch(() => {});

  const esito = await creaSessioneStripePerOrdine(ordineId);
  if (!esito.ok) {
    const status = esito.codice === "ORDINE_NON_TROVATO" ? 404 : 422;
    return apiError(esito.codice, esito.errore, status);
  }

  return apiOk({
    pagamento: {
      redirectUrl: esito.redirectUrl,
      sessioneId: esito.sessioneId,
      giaEsistente: esito.giaEsistente,
    },
  });
}
