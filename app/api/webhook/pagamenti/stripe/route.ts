import { gestisciWebhookStripe } from "@/lib/pagamenti/webhook-stripe";

/**
 * POST /api/webhook/pagamenti/stripe
 *
 * Webhook Stripe (endpoint unico per TUTTI i negozi): la firma viene
 * verificata provando i signing secret delle configurazioni Stripe attive
 * (la firma identifica anche l'account mittente). Body RAW obbligatorio:
 * Stripe firma esattamente il payload ricevuto.
 *
 * Il webhook è la FONTE AUTOREVOLE del pagamento (mai il redirect):
 * - checkout.session.completed → ordine pagato + email conferma;
 * - checkout.session.expired → riserva stock con scadenza (ripristino);
 * - charge.refunded → rimborso totale/parziale.
 *
 * Risposte: 200 = processato o duplicato (idempotente); 400 = firma invalida.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const esito = await gestisciWebhookStripe(rawBody, request.headers);
  return new Response(esito.body, { status: esito.status });
}
