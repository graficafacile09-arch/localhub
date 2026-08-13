/**
 * TEST GATEWAY PAYPAL — HTTP PayPal MOCKATO (nessun server dev, nessun DB).
 *
 * Verifica `GatewayPaypal` (lib/pagamenti/gateway-paypal.ts) isolatamente:
 * l'unico layer simulato è l'HTTP di PayPal (server locale). Le credenziali
 * arrivano da CredenzialiGateway (proiezione di getConfigProviderNegozio) e
 * il test verifica che siano usate correttamente (OAuth2 client-credentials,
 * Bearer token, verify-webhook-signature).
 *
 *   1. OAuth2 access token (Basic auth clientId:secret);
 *   2. creazione sessione (order id + approve link) con intent CAPTURE;
 *   3. purchase_unit: items + breakdown + custom_id = ordineId;
 *   4. firma webhook valida → identità evento (verify-webhook-signature);
 *   5. firma webhook invalida / header mancanti / webhook id errato → null;
 *   6. stato pagamento (COMPLETED→paid, APPROVED→authorized, VOIDED→canceled);
 *   7. cattura (capture id);
 *   8. rimborso (risolve capture id → refund);
 *   9. errori API PayPal tipizzati, senza leak di credenziali;
 *  10. provider = 'paypal' + interfaccia PaymentGateway completa.
 *
 * Uso: npx tsx scripts/test-gateway-paypal.ts
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { GatewayPaypal, PaypalGatewayError } from "../lib/pagamenti/gateway-paypal";
import type {
  ContestoCheckout,
  CredenzialiGateway,
  PaymentGateway,
} from "../lib/pagamenti/types";

let passati = 0;
let falliti = 0;
const fallitiNomi: string[] = [];

function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    fallitiNomi.push(nome);
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

// ── Credenziali di test (come le riceverebbe getConfigProviderNegozio) ─────
const CLIENT_ID = "AfPaypalClientIdTest";
const SECRET = "EPaypalSecretTest";
const WEBHOOK_ID = "webhook_id_paypal_test";

const CRED: CredenzialiGateway = {
  clientId: CLIENT_ID,
  secret: SECRET,
  webhookSecret: WEBHOOK_ID,
  testMode: true,
};
const CRED_SENZA_WEBHOOK: CredenzialiGateway = { ...CRED, webhookSecret: "" };

const AUTH_ATTESA = `Basic ${Buffer.from(`${CLIENT_ID}:${SECRET}`, "utf8").toString("base64")}`;
const TOKEN = "A21AApaypal_access_token_test";

// ── Contesto checkout (importi dal server, mai dal client) ─────────────────
const ORDINE_ID = "11111111-1111-4111-8111-111111111111";
const ctx: ContestoCheckout = {
  ordineId: ORDINE_ID,
  negozioId: "22222222-2222-4222-8222-222222222222",
  numeroOrdine: "LH-TEST-PAYPAL",
  importo: 31.9,
  valuta: "EUR",
  metodo: "paypal",
  returnUrl: `https://app.test/ordini/conferma/${ORDINE_ID}`,
  cancelUrl: `https://app.test/ordini/conferma/${ORDINE_ID}?esito=annullato`,
  righe: [
    { nome: "Pane", quantita: 2, prezzoUnitario: 10, variante: null },
    { nome: "Pizza", quantita: 1, prezzoUnitario: 6, variante: "Variante M" },
  ],
  costoSpedizione: 5.9,
};

type ChiamataCatturata = { method: string; url: string; headers: Record<string, string>; body: unknown };

function avviaMockPaypal() {
  const chiamate: ChiamataCatturata[] = [];
  const ordini = new Map<string, { status: string }>();
  let contatore = 0;

  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += String(c)));
    req.on("end", () => {
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {}
      chiamate.push({
        method: req.method ?? "GET",
        url: req.url ?? "",
        headers: req.headers as Record<string, string>,
        body,
      });

      const rispondi = (status: number, payload?: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(payload !== undefined ? JSON.stringify(payload) : "");
      };

      // ── POST /v1/oauth2/token ────────────────────────────────────────
      if (req.method === "POST" && req.url === "/v1/oauth2/token") {
        const auth = String(req.headers["authorization"] ?? "");
        if (auth !== AUTH_ATTESA) {
          return rispondi(401, { name: "AUTHENTICATION_FAILURE", message: "Invalid client credentials" });
        }
        return rispondi(200, { access_token: TOKEN, token_type: "Bearer", expires_in: 32400 });
      }

      // ── POST /v2/checkout/orders ─────────────────────────────────────
      if (req.method === "POST" && req.url === "/v2/checkout/orders") {
        if (String(req.headers["authorization"] ?? "") !== `Bearer ${TOKEN}`) {
          return rispondi(401, { name: "AUTHENTICATION_FAILURE", message: "Invalid token" });
        }
        contatore++;
        const orderId = `PAYPAL_ORDER_${contatore}`;
        ordini.set(orderId, { status: "CREATED" });
        return rispondi(200, {
          id: orderId,
          status: "CREATED",
          links: [
            { href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`, rel: "self" },
            { href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`, rel: "approve" },
          ],
        });
      }

      // ── POST /v1/notifications/verify-webhook-signature ───────────────
      if (req.method === "POST" && req.url === "/v1/notifications/verify-webhook-signature") {
        if (String(req.headers["authorization"] ?? "") !== `Bearer ${TOKEN}`) {
          return rispondi(401, { name: "AUTHENTICATION_FAILURE" });
        }
        const b = (body ?? {}) as { webhook_id?: string };
        if (b.webhook_id !== WEBHOOK_ID) {
          return rispondi(200, { verification_status: "FAILURE" });
        }
        return rispondi(200, { verification_status: "SUCCESS" });
      }

      // ── GET /v2/checkout/orders/{id} ─────────────────────────────────
      const mGet = req.url?.match(/^\/v2\/checkout\/orders\/([^/]+)$/);
      if (req.method === "GET" && mGet) {
        const stato = ordini.get(mGet[1]);
        if (!stato) {
          return rispondi(404, { name: "RESOURCE_NOT_FOUND", message: "Order not found" });
        }
        return rispondi(200, {
          id: mGet[1],
          status: stato.status,
          purchase_units: [{ payments: { captures: [{ id: `CAPTURE_${mGet[1]}` }] } }],
        });
      }

      // ── POST /v2/checkout/orders/{id}/capture ────────────────────────
      const mCapture = req.url?.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/);
      if (req.method === "POST" && mCapture) {
        const stato = ordini.get(mCapture[1]);
        if (!stato) {
          return rispondi(404, { name: "RESOURCE_NOT_FOUND" });
        }
        stato.status = "COMPLETED";
        return rispondi(200, {
          id: mCapture[1],
          status: "COMPLETED",
          purchase_units: [{ payments: { captures: [{ id: `CAPTURE_${mCapture[1]}` }] } }],
        });
      }

      // ── POST /v2/payments/captures/{id}/refund ───────────────────────
      const mRefund = req.url?.match(/^\/v2\/payments\/captures\/([^/]+)\/refund$/);
      if (req.method === "POST" && mRefund) {
        return rispondi(200, { id: `REFUND_${mRefund[1]}`, status: "COMPLETED" });
      }

      rispondi(404, { name: "RESOURCE_NOT_FOUND", message: [] });
    });
  });

  return new Promise<{
    port: number;
    chiamate: typeof chiamate;
    chiudi: () => Promise<void>;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        chiamate,
        chiudi: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function main() {
  let mock: Awaited<ReturnType<typeof avviaMockPaypal>> | null = null;
  try {
    mock = await avviaMockPaypal();
    const gateway = new GatewayPaypal({ baseUrl: `http://127.0.0.1:${mock.port}` });

    // ── 1+2+3: creazione sessione ──────────────────────────────────────
    console.log("\n[T1-3] Creazione sessione PayPal (OAuth2 + order CAPTURE + purchase_unit)");
    const sessione = await gateway.creaSessione(ctx, CRED);
    check("1. sessione creata: paymentId + redirectUrl", Boolean(sessione.paymentId) && Boolean(sessione.redirectUrl), sessione);
    check("1b. paymentId = PAYPAL_ORDER_*", sessione.paymentId.startsWith("PAYPAL_ORDER_"), sessione.paymentId);
    check("2. redirectUrl = hosted checkout PayPal (approve link)", String(sessione.redirectUrl).startsWith("https://www.sandbox.paypal.com/checkoutnow?"), sessione.redirectUrl);

    const chiamataToken = mock.chiamate.find((c) => c.url === "/v1/oauth2/token");
    check("3a. OAuth2: Basic auth clientId:secret", chiamataToken?.headers["authorization"] === AUTH_ATTESA, chiamataToken?.headers);
    const chiamataOrder = mock.chiamate.find((c) => c.url === "/v2/checkout/orders");
    check("3b. create order: Bearer token dall'OAuth2", chiamataOrder?.headers["authorization"] === `Bearer ${TOKEN}`, chiamataOrder?.headers);
    const bodyOrder = (chiamataOrder?.body ?? {}) as Record<string, unknown>;
    check("3c. intent = CAPTURE", bodyOrder.intent === "CAPTURE", bodyOrder.intent);
    const units = (bodyOrder.purchase_units ?? []) as Array<Record<string, unknown>>;
    const unit = units[0];
    check("3d. custom_id = ordineId (reference interno)", unit?.custom_id === ORDINE_ID, unit?.custom_id);
    check("3e. importo totale decimale EUR (31.90)", (unit?.amount as Record<string, unknown>)?.value === "31.90", unit?.amount);
    const items = (unit?.items ?? []) as Array<Record<string, unknown>>;
    check("3f. 2 items + breakdown item_total/shipping", items.length === 2 && Boolean((unit?.amount as Record<string, unknown>)?.breakdown), unit?.amount);

    // ── 4+5: verifica firma webhook ────────────────────────────────────
    console.log("\n[T4-5] Verifica firma webhook (verify-webhook-signature, fail-closed)");
    const payloadWebhook = JSON.stringify({
      id: "WH-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPTURE_X",
        amount: { value: "31.90" },
        supplementary_data: { related_ids: { order_id: sessione.paymentId } },
      },
    });
    const headersWebhook = new Headers({
      "paypal-transmission-id": "t1",
      "paypal-transmission-time": new Date().toISOString(),
      "paypal-transmission-sig": "sig",
      "paypal-cert-url": "https://api-m.sandbox.paypal.com/cert",
      "paypal-auth-algo": "SHA256withRSA",
    });
    const verificato = await gateway.verificaFirma(payloadWebhook, headersWebhook, CRED);
    check("4. firma valida → eventId/eventType/paymentId(order_id)", verificato?.eventId === "WH-1" && verificato?.eventType === "PAYMENT.CAPTURE.COMPLETED" && verificato?.paymentId === sessione.paymentId, verificato);
    const chiamataVerify = mock.chiamate.find((c) => c.url === "/v1/notifications/verify-webhook-signature");
    check("4b. verify: webhook_id dalle credenziali", (chiamataVerify?.body as Record<string, unknown>)?.webhook_id === WEBHOOK_ID, chiamataVerify?.body);

    const senzaHeader = await gateway.verificaFirma(payloadWebhook, new Headers(), CRED);
    check("5a. header mancanti → null", senzaHeader === null, senzaHeader);
    const webhookErrato = await gateway.verificaFirma(payloadWebhook, headersWebhook, CRED_SENZA_WEBHOOK);
    check("5b. webhook id assente → null (fail-closed)", webhookErrato === null, webhookErrato);

    // ── 6: stato pagamento ──────────────────────────────────────────────
    console.log("\n[T6] Stato pagamento (mapping status → PaymentStatus)");
    check("6a. CREATED → pending", (await gateway.statoPagamento(sessione.paymentId, CRED)) === "pending");

    // ── 7: cattura ──────────────────────────────────────────────────────
    console.log("\n[T7] Cattura");
    const cattura = await gateway.cattura(sessione.paymentId, undefined, CRED);
    check("7a. cattura restituisce transactionId (capture id)", Boolean(cattura.transactionId) && cattura.transactionId === `CAPTURE_${sessione.paymentId}`, cattura);
    check("7b. dopo cattura → COMPLETED → paid", (await gateway.statoPagamento(sessione.paymentId, CRED)) === "paid");

    // ── 8: rimborso ─────────────────────────────────────────────────────
    console.log("\n[T8] Rimborso");
    const rimborso = await gateway.rimborsa(sessione.paymentId, 5.0, CRED);
    check("8a. rimborso parziale: POST /captures/{id}/refund", Boolean(rimborso.refundId) && rimborso.refundId === `REFUND_CAPTURE_${sessione.paymentId}`, rimborso);
    const chiamataRefund = mock.chiamate.find((c) => c.url?.endsWith("/refund"));
    const refundAmount = (chiamataRefund?.body as { amount?: { value?: unknown } } | null)?.amount?.value;
    check("8b. refund con amount 5.00 EUR", refundAmount === "5.00", chiamataRefund?.body);

    // ── 9: errori tipizzati, senza leak di credenziali ──────────────────
    console.log("\n[T9] Errori API PayPal (tipizzati, fail-closed, senza leak)");
    let codiceNonConf = "";
    try {
      await gateway.creaSessione(ctx, { ...CRED, clientId: "", secret: "" });
    } catch (e) {
      if (e instanceof PaypalGatewayError) codiceNonConf = e.codice;
    }
    check("9a. credenziali assenti → PAYPAL_NON_CONFIGURATO", codiceNonConf === "PAYPAL_NON_CONFIGURATO", codiceNonConf);

    let codice401 = "";
    let messaggio401 = "";
    try {
      await new GatewayPaypal({ baseUrl: `http://127.0.0.1:${mock.port}` }).creaSessione(ctx, { ...CRED, secret: "sbagliata" });
    } catch (e) {
      if (e instanceof PaypalGatewayError) {
        codice401 = e.codice;
        messaggio401 = e.message;
      }
    }
    check("9b. credenziali errate → PAYPAL_CREDENZIALI_NON_VALIDE", codice401 === "PAYPAL_CREDENZIALI_NON_VALIDE", codice401);
    check("9c. nessun leak del secret nel messaggio", !messaggio401.includes(SECRET) && !messaggio401.includes("sbagliata"), messaggio401);

    // ── 10: interfaccia + provider ──────────────────────────────────────
    console.log("\n[T10] Interfaccia PaymentGateway");
    const metodi: (keyof PaymentGateway)[] = ["creaSessione", "verificaFirma", "statoPagamento", "cattura", "annulla", "rimborsa"];
    check("10a. provider = 'paypal'", gateway.provider === "paypal", gateway.provider);
    check("10b. interfaccia PaymentGateway completa (6 metodi)", metodi.every((m) => typeof gateway[m] === "function"), metodi.map((m) => typeof gateway[m]));

    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`GATEWAY PAYPAL TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    if (mock) await mock.chiudi().catch(() => {});
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
