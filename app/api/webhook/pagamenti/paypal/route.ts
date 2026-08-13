import { gestisciWebhookPaypal } from "@/lib/pagamenti/webhook-paypal";

/**
 * POST /api/webhook/pagamenti/paypal
 *
 * Webhook PayPal (endpoint unico per TUTTI i negozi): la firma viene
 * verificata provando i webhook id delle configurazioni PayPal attive via
 * POST /v1/notifications/verify-webhook-signature (header
 * `PAYPAL-TRANSMISSION-*`). Body RAW obbligatorio: PayPal firma esattamente
 * il payload ricevuto.
 *
 * Il webhook è la FONTE AUTOREVOLE del pagamento (mai il redirect):
 * - PAYMENT.CAPTURE.COMPLETED → ordine pagato (+ email conferma);
 * - PAYMENT.CAPTURE.REFUNDED / REVERSED → rimborso;
 * - PAYMENT.CAPTURE.DENIED / FAILED / VOIDED / ORDER.CANCELLED → annullamento;
 * - eventi non riconosciuti → registrati ma ignorati.
 *
 * Risposte: 200 = processato o duplicato (idempotente); 400 = firma
 * invalida/mancante (fail-closed, nessuna operazione DB).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const esito = await gestisciWebhookPaypal(rawBody, request.headers);
  return new Response(esito.body, { status: esito.status });
}
