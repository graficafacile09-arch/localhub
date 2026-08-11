/**
 * TEST FASE F1 — PAGAMENTI STRIPE (gateway + firma webhook, mock-based).
 *
 * In Node l'SDK stripe usa il client HTTP nativo (https.request), quindi il
 * test simula l'API con un server HTTP locale passato al gateway tramite
 * host/port (supporto nativo Stripe: `new Stripe(key, { host, port })`).
 * Nessuna chiamata di rete reale, nessun dato modificato.
 *
 * Copre:
 *   - creaSessione: URL corretto, metodo POST, importo in centesimi DAL
 *     CONTESTO (mai dal client), metadata ordine_id/negozio_id;
 *   - importo non valido / secret mancante → errori tipizzati;
 *   - statoPagamento da sessione (paid/pending/expired);
 *   - rimborso sul payment intent della sessione;
 *   - verificaFirma webhook: valida / alterata / secret errato / mancante;
 *   - macchina a stati (coerenza con la RPC aggiorna_payment_status).
 *
 * Uso: npx tsx scripts/test-pagamenti-f1.ts
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import {
  GatewayStripe,
  PagamentoGatewayError,
  verificaEventoStripe,
} from "@/lib/pagamenti/stripe";
import type { ContestoCheckout, CredenzialiGateway } from "@/lib/pagamenti/types";
import { canTransitionPayment, transitionPayment, isFinalPaymentStatus } from "@/lib/pagamenti/stati";

let passati = 0;
let falliti = 0;

function check(label: string, cond: boolean, dettaglio?: unknown) {
  if (cond) {
    passati++;
    console.log(`  ✅ ${label}`);
  } else {
    falliti++;
    console.log(`  ❌ ${label}${dettaglio !== undefined ? ` — ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

const CTX: ContestoCheckout = {
  ordineId: "11111111-1111-4111-8111-111111111111",
  negozioId: "22222222-2222-4222-8222-222222222222",
  numeroOrdine: "LH-000999",
  importo: 31.0, // sempre dal DB (ordine.totale)
  valuta: "EUR",
  metodo: "carta",
  returnUrl: "https://www.incitta.online/ordini/conferma/11111111-1111-4111-8111-111111111111",
  cancelUrl: "https://www.incitta.online/ordini/conferma/11111111-1111-4111-8111-111111111111",
};

const CRED: CredenzialiGateway = {
  secret: "sk_test_finto_123456",
  testMode: true,
};

/** Server HTTP locale che simula le route Stripe usate dal gateway. */
function avviaMockStripe() {
  const chiamate: Array<{ url: string; method: string; body: string }> = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += String(c)));
    req.on("end", () => {
      chiamate.push({ url: req.url ?? "", method: req.method ?? "GET", body });

      const rispondi = (data: unknown) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
      };

      if (req.method === "POST" && (req.url ?? "").startsWith("/v1/checkout/sessions")) {
        return rispondi({
          id: "cs_test_creata",
          url: "https://checkout.stripe.com/c/pay/cs_test_creata",
          status: "open",
          payment_status: "unpaid",
          expires_at: Math.floor(Date.now() / 1000) + 1800,
          client_reference_id: CTX.ordineId,
          metadata: { ordine_id: CTX.ordineId, negozio_id: CTX.negozioId },
        });
      }
      if (req.method === "GET" && (req.url ?? "").includes("/v1/checkout/sessions/cs_")) {
        return rispondi({
          id: "cs_test_creata",
          status: "complete",
          payment_status: "paid",
          payment_intent: "pi_test_123",
        });
      }
      if (req.method === "POST" && (req.url ?? "").includes("/v1/refunds")) {
        return rispondi({ id: "re_test_123", status: "succeeded" });
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{}");
    });
  });

  return new Promise<{ port: number; chiamate: typeof chiamate; chiudi: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as AddressInfo).port;
        resolve({
          port,
          chiamate,
          chiudi: () => new Promise((r) => server.close(() => r())),
        });
      });
    }
  );
}

async function main() {
  const mock = await avviaMockStripe();
  const gateway = new GatewayStripe({
    host: "127.0.0.1",
    port: mock.port,
    protocol: "http",
  });

  try {
    console.log("\n=== GATEWAY STRIPE — creaSessione ===\n");
    {
      const esito = await gateway.creaSessione(CTX, CRED);

      check("paymentId restituito", esito.paymentId === "cs_test_creata");
      check("redirectUrl restituito", esito.redirectUrl.includes("checkout.stripe.com"));
      check(
        "expiresAt futuro",
        Boolean(esito.expiresAt && esito.expiresAt.getTime() > Date.now())
      );

      const chiamata = mock.chiamate[0];
      const bodyDecodificato = decodeURIComponent(chiamata?.body ?? "");
      check("POST verso /v1/checkout/sessions", Boolean(chiamata?.method === "POST" && chiamata?.url.startsWith("/v1/checkout/sessions")));
      // Importo: SEMPRE dal DB (31.00 € → 3100 centesimi), mai dal client.
      check("importo in centesimi dal DB (3100)", bodyDecodificato.includes("unit_amount]=3100"));
      check("currency eur", bodyDecodificato.includes("currency]=eur"));
      check("metadata ordine_id", bodyDecodificato.includes(CTX.ordineId));
      check("metadata negozio_id", bodyDecodificato.includes(CTX.negozioId));
      check("client_reference_id ordine", bodyDecodificato.includes("client_reference_id"));
    }

    console.log("\n=== GATEWAY STRIPE — errori ===\n");
    {
      let err1: PagamentoGatewayError | null = null;
      try {
        await gateway.creaSessione({ ...CTX, importo: 0 }, CRED);
      } catch (e) {
        err1 = e as PagamentoGatewayError;
      }
      check("importo 0 → IMPORTO_NON_VALIDO", err1?.codice === "IMPORTO_NON_VALIDO");

      let err2: PagamentoGatewayError | null = null;
      try {
        await gateway.creaSessione(CTX, { testMode: true, secret: "" });
      } catch (e) {
        err2 = e as PagamentoGatewayError;
      }
      check("secret vuoto → STRIPE_NON_CONFIGURATO", err2?.codice === "STRIPE_NON_CONFIGURATO");
    }

    console.log("\n=== GATEWAY STRIPE — stato pagamento ===\n");
    {
      const stato = await gateway.statoPagamento("cs_test_creata", CRED);
      check("sessione completa+paid → 'paid'", stato === "paid");
    }

    console.log("\n=== GATEWAY STRIPE — rimborso ===\n");
    {
      const rimborso = await gateway.rimborsa("cs_test_creata", undefined, CRED);
      check("refundId restituito", rimborso.refundId === "re_test_123");
      const chiamataRimborso = mock.chiamate.find((c) => c.url.includes("/v1/refunds"));
      check(
        "refund sul payment_intent pi_test_123",
        Boolean(chiamataRimborso?.body.includes("payment_intent=pi_test_123"))
      );
    }

    console.log("\n=== WEBHOOK — firma (verificaEventoStripe) ===\n");
    {
      const payload = JSON.stringify({
        id: "evt_test_1",
        object: "event",
        type: "checkout.session.completed",
        data: { object: { id: "cs_test_creata", client_reference_id: CTX.ordineId } },
      });
      const header = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: "whsec_test_secret",
      });

      const valido = verificaEventoStripe(payload, header, "whsec_test_secret");
      check("firma valida → evento id", valido?.id === "evt_test_1");
      check("firma valida → eventType", valido?.type === "checkout.session.completed");
      check(
        "firma valida → paymentId",
        Boolean(valido && (valido.data.object as { id?: string }).id === "cs_test_creata")
      );

      const invalido = verificaEventoStripe(payload, header + "x", "whsec_test_secret");
      check("firma alterata → null", invalido === null);

      const segretoErrato = verificaEventoStripe(payload, header, "whsec_altro");
      check("webhook secret errato → null", segretoErrato === null);

      const senzaFirma = verificaEventoStripe(payload, "", "whsec_test_secret");
      check("signature mancante → null", senzaFirma === null);
    }
  } finally {
    await mock.chiudi();
  }

  console.log("\n=== MACCHINA A STATI (coerenza con la RPC) ===\n");
  {
    check("pending → paid consentita", canTransitionPayment("pending", "paid"));
    check("pending → expired consentita", canTransitionPayment("pending", "expired"));
    check("paid → refunded consentita", canTransitionPayment("paid", "refunded"));
    check(
      "paid → partially_refunded consentita",
      canTransitionPayment("paid", "partially_refunded")
    );
    check(
      "partially_refunded → refunded consentita",
      canTransitionPayment("partially_refunded", "refunded")
    );
    check("paid → pending NON consentita", !canTransitionPayment("paid", "pending"));
    check("refunded → paid NON consentita", !canTransitionPayment("refunded", "paid"));

    const idem = transitionPayment("paid", "paid");
    check("paid → paid idempotente (no-op)", Boolean(idem.ok && !idem.cambiato));

    const ok = transitionPayment("pending", "paid");
    check("transition pending→paid ok", Boolean(ok.ok && ok.stato === "paid"));

    check("expired è finale", isFinalPaymentStatus("expired"));
    check("paid NON è finale (rimborsabile)", !isFinalPaymentStatus("paid"));
  }

  console.log(`\nRISULTATO: ${passati} PASS / ${falliti} FAIL\n`);
  if (falliti > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione dei test:", e);
  process.exit(1);
});
