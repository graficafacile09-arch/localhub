import { gestisciWebhookKlarna } from "@/lib/pagamenti/webhook-klarna";

/**
 * POST /api/webhook/pagamenti/klarna
 *
 * Webhook Klarna (endpoint unico per TUTTI i negozi): la firma viene
 * verificata provando i webhook secret delle configurazioni Klarna attive
 * (header `Klarna-Signature` = Base64(HMAC-SHA256(body, shared secret))).
 * Body RAW obbligatorio: Klarna firma esattamente il payload ricevuto.
 *
 * Il webhook è la FONTE AUTOREVOLE del pagamento (mai il redirect):
 * - AUTHORIZED / CAPTURED / checkout.order_completed → ordine pagato;
 * - CANCELLED / CANCELED → annullamento;
 * - EXPIRED → riserva stock con scadenza (ripristino);
 * - REFUNDED → rimborso.
 *
 * Risposte: 200 = processato o duplicato (idempotente); 400 = firma
 * invalida/mancante (fail-closed, nessuna operazione DB).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const esito = await gestisciWebhookKlarna(rawBody, request.headers);
  return new Response(esito.body, { status: esito.status });
}
