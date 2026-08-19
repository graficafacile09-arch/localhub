import { gestisciWebhookScalapay } from "@/lib/pagamenti/webhook-scalapay";

/**
 * POST /api/webhook/pagamenti/scalapay
 *
 * Webhook Scalapay (endpoint unico per TUTTI i negozi): la firma viene
 * verificata provando le API key delle configurazioni Scalapay attive
 * (header `x-scalapay-hmac-v1` = HMAC-SHA256 di
 * `V1:{timestamp}:{JSON.stringify(payload)}`, header `x-scalapay-timestamp`).
 * Body RAW obbligatorio: Scalapay firma esattamente il payload ricevuto.
 *
 * Il webhook è la FONTE AUTOREVOLE del pagamento (mai il redirect):
 * - charged → ordine pagato (+ email conferma);
 * - authorized → auto-capture (POST /v2/payments/capture);
 * - refunded → rimborso;
 * - expired → riserva stock con scadenza (ripristino);
 * - cancelled → annullamento.
 *
 * Risposte: 200 = processato o duplicato (idempotente); 400 = firma
 * invalida/mancante (fail-closed, nessuna operazione DB); 500 = cattura
 * automatica fallita (retry).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const esito = await gestisciWebhookScalapay(rawBody, request.headers);
  return new Response(esito.body, { status: esito.status });
}
