/**
 * TEST GATEWAY KLARNA — HTTP Klarna MOCKATO (nessun server dev, nessun DB).
 *
 * Verifica `GatewayKlarna` (lib/pagamenti/gateway-klarna.ts) isolatamente:
 * l'unico layer simulato è l'HTTP di Klarna (server locale). Credenziali
 * reali del negozio NON servono: le credenziali arrivano da
 * CredenzialiGateway (proiezione di getConfigProviderNegozio) e il test
 * verifica che siano usate correttamente (Basic auth, firma webhook).
 *
 *   1. creazione sessione (order_id + redirect_url);
 *   2. line item multipli + variante + spedizione;
 *   3. importo totale corretto in minor units (Σ righe = order_amount);
 *   4. idempotency key deterministica dall'ordine;
 *   5. credenziali prese dalla config (Basic auth, mai hardcoded);
 *   6. risposta/redirect restituita;
 *   7. firma webhook valida → identità evento;
 *   8. firma webhook invalida / assente / secret diverso → fail-closed null;
 *   9. stato pagamento (authorized/paid/canceled/expired/refunded);
 *  10. capture (importo fornito + autorizzazione residua);
 *  11. cancel;
 *  12. refund (parziale + residuo);
 *  13. errori API Klarna tipizzati, senza leak di credenziali;
 *  14. nessuna regressione Stripe (GatewayStripe intatto).
 *
 * Uso: npx tsx scripts/test-gateway-klarna.ts
 */
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { GatewayKlarna, KlarnaGatewayError } from "../lib/pagamenti/gateway-klarna";
import { GatewayStripe } from "../lib/pagamenti/stripe";
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
const USERNAME = "api_username_test";
const PASSWORD = "api_password_test";
const WH_SECRET = "whsec_klarna_test";

const CRED: CredenzialiGateway = {
  clientId: USERNAME,
  secret: PASSWORD,
  webhookSecret: WH_SECRET,
  testMode: true,
};

const CRED_ERRATA: CredenzialiGateway = { ...CRED, secret: "password_sbagliata" };
const CRED_SENZA_WEBHOOK: CredenzialiGateway = { ...CRED, webhookSecret: "" };

const AUTH_ATTESA = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`, "utf8").toString("base64")}`;

// ── Contesto checkout (importi dal server, mai dal client) ─────────────────
const ORDINE_ID = "11111111-1111-4111-8111-111111111111";
const ctx: ContestoCheckout = {
  ordineId: ORDINE_ID,
  negozioId: "22222222-2222-4222-8222-222222222222",
  numeroOrdine: "LH-TEST-KLARNA",
  importo: 31.9, // 10×2 + 6 + 5.9 spedizione
  valuta: "EUR",
  metodo: "klarna",
  returnUrl: `https://app.test/ordini/conferma/${ORDINE_ID}`,
  cancelUrl: `https://app.test/ordini/conferma/${ORDINE_ID}?esito=annullato`,
  righe: [
    { nome: "Pane", quantita: 2, prezzoUnitario: 10, variante: null },
    { nome: "Pizza", quantita: 1, prezzoUnitario: 6, variante: "Variante M" },
  ],
  costoSpedizione: 5.9,
};

const TOTALE_MINOR = 3190; // 31,90 € in centesimi

// ── Mock HTTP Klarna ────────────────────────────────────────────────────────
type StatoOrdineKlarna = {
  order_status: string;
  order_amount: number;
  remaining_authorized_amount: number;
  refunded_amount: number;
};

type ChiamataCatturata = { method: string; url: string; headers: Record<string, string>; body: unknown };

function avviaMockKlarna() {
  const chiamate: ChiamataCatturata[] = [];
  const ordini = new Map<string, StatoOrdineKlarna>();
  let contatore = 0;
  // Se true, il mock rifiuta le credenziali (401).
  let authErrata = false;

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

      const auth = String(req.headers["authorization"] ?? "");
      const rispondi = (status: number, payload?: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(payload !== undefined ? JSON.stringify(payload) : "");
      };

      if (authErrata && req.url !== "/checkout/v3/orders" && auth !== AUTH_ATTESA) {
        // Auth errata → 401 (valida per TUTTE le API tranne la creazione
        // sessione, che ha un test dedicato per il 401).
        return rispondi(401, {
          error_code: "AUTH_FAILED",
          error_messages: ["Invalid credentials"],
          correlation_id: "corr-401",
        });
      }

      // ── POST /checkout/v3/orders ──────────────────────────────────────
      if (req.method === "POST" && req.url === "/checkout/v3/orders") {
        if (auth !== AUTH_ATTESA) {
          return rispondi(401, {
            error_code: "AUTH_FAILED",
            error_messages: ["Invalid credentials"],
            correlation_id: "corr-401",
          });
        }
        const order = body as {
          order_amount: number;
          order_lines: { total_amount: number }[];
        };
        const sommaRighe = (order.order_lines ?? []).reduce((s, l) => s + l.total_amount, 0);
        if (Number(order.order_amount) !== sommaRighe) {
          return rispondi(400, {
            error_code: "ORDER_LINES_AMOUNT_MISMATCH",
            error_messages: ["The order amount must match the sum of order lines"],
            correlation_id: "corr-400",
          });
        }
        contatore++;
        const orderId = `klarna_ord_${contatore}`;
        ordini.set(orderId, {
          order_status: "checkout_incomplete",
          order_amount: Number(order.order_amount),
          remaining_authorized_amount: Number(order.order_amount),
          refunded_amount: 0,
        });
        return rispondi(200, {
          order_id: orderId,
          redirect_url: `https://checkout.klarna.com/${orderId}`,
          status: "checkout_incomplete",
        });
      }

      // ── GET /ordermanagement/v1/orders/{id} ───────────────────────────
      const mGet = req.url?.match(/^\/ordermanagement\/v1\/orders\/([^/]+)$/);
      if (req.method === "GET" && mGet) {
        const stato = ordini.get(mGet[1]);
        if (!stato) {
          return rispondi(404, {
            error_code: "ORDER_NOT_FOUND",
            error_messages: ["Order not found"],
            correlation_id: "corr-404",
          });
        }
        return rispondi(200, stato);
      }

      // ── POST /ordermanagement/v1/orders/{id}/captures|cancel|refunds ──
      const mPost = req.url?.match(/^\/ordermanagement\/v1\/orders\/([^/]+)\/(captures|cancel|refunds)$/);
      if (req.method === "POST" && mPost) {
        const ordine = ordini.get(mPost[1]);
        if (!ordine) {
          return rispondi(404, {
            error_code: "ORDER_NOT_FOUND",
            error_messages: ["Order not found"],
            correlation_id: "corr-404",
          });
        }
        if (mPost[2] === "captures") {
          const captured = Number((body as { captured_amount?: number })?.captured_amount ?? 0);
          ordine.order_status = captured >= ordine.order_amount ? "CAPTURED" : "PART_CAPTURED";
          ordine.remaining_authorized_amount = Math.max(
            0,
            ordine.remaining_authorized_amount - captured
          );
          // HTTP 204: NESSUNA body (il gateway tollera il fallback su paymentId).
          res.writeHead(204);
          return res.end();
        }
        if (mPost[2] === "refunds") {
          const refunded = Number((body as { refunded_amount?: number })?.refunded_amount ?? 0);
          ordine.refunded_amount += refunded;
          ordine.order_status =
            ordine.refunded_amount >= ordine.order_amount ? "CLOSED" : ordine.order_status;
          res.writeHead(204);
          return res.end();
        }
        // cancel
        ordine.order_status = "CANCELLED";
        res.writeHead(204);
        return res.end();
      }

      rispondi(404, { error_code: "NOT_FOUND", error_messages: [] });
    });
  });

  return new Promise<{
    port: number;
    chiamate: typeof chiamate;
    ordini: typeof ordini;
    setAuthErrata: (v: boolean) => void;
    chiudi: () => Promise<void>;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        chiamate,
        ordini,
        setAuthErrata: (v) => {
          authErrata = v;
        },
        chiudi: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function parseBody(body: unknown): Record<string, unknown> {
  return (body ?? {}) as Record<string, unknown>;
}

async function main() {
  let mock: Awaited<ReturnType<typeof avviaMockKlarna>> | null = null;
  try {
    mock = await avviaMockKlarna();
    const gateway = new GatewayKlarna({ baseUrl: `http://127.0.0.1:${mock.port}` });

    // ── 1+2+3+4+5+6: creazione sessione ─────────────────────────────────
    console.log("\n[T1-6] Creazione sessione Klarna (line item + variante + spedizione)");
    const sessione = await gateway.creaSessione(ctx, CRED);
    check("1. sessione creata: paymentId + redirectUrl", Boolean(sessione.paymentId) && Boolean(sessione.redirectUrl), sessione);
    check("1b. paymentId formato klarna_ord_*", /^klarna_ord_\d+$/.test(sessione.paymentId), sessione.paymentId);
    check("6. redirectUrl = checkout hosted Klarna", String(sessione.redirectUrl).startsWith("https://checkout.klarna.com/"), sessione.redirectUrl);

    const ultima = mock.chiamate[mock.chiamate.length - 1];
    const body = parseBody(ultima.body);
    const lines = (body.order_lines ?? []) as Array<Record<string, unknown>>;
    check("2. 3 order_lines (2 prodotti + spedizione)", lines.length === 3, lines);
    const rigaPane = lines.find((l) => String(l.name) === "Pane");
    check("2b. Pane: 1000 centesimi ×2", rigaPane?.unit_price === 1000 && rigaPane?.quantity === 2, rigaPane);
    const rigaPizza = lines.find((l) => String(l.name).includes("Pizza"));
    check("2c. Pizza variante M: 600 centesimi ×1 e variante nel nome", rigaPizza?.unit_price === 600 && rigaPizza?.quantity === 1 && String(rigaPizza?.name).includes("Variante M"), rigaPizza);
    const rigaSped = lines.find((l) => String(l.name) === "Spedizione");
    check("2d. Spedizione: 590 centesimi ×1", rigaSped?.unit_price === 590 && rigaSped?.quantity === 1, rigaSped);
    const sommaRighe = lines.reduce((s, l) => s + Number(l.total_amount), 0);
    check("3. order_amount = 3190 (Σ righe, minor units)", Number(body.order_amount) === TOTALE_MINOR && sommaRighe === TOTALE_MINOR, { order_amount: body.order_amount, sommaRighe });
    check("3b. valuta EUR dal contesto", body.purchase_currency === "EUR", body.purchase_currency);

    const headersUltima = ultima.headers as Record<string, string>;
    check("4. Klarna-Idempotency-Key deterministica dall'ordine", headersUltima["klarna-idempotency-key"] === `klarna:${ORDINE_ID}`, headersUltima["klarna-idempotency-key"]);
    check("5. Basic auth dalle credenziali config", headersUltima["authorization"] === AUTH_ATTESA, headersUltima["authorization"]);

    // ── 7+8: firma webhook ──────────────────────────────────────────────
    console.log("\n[T7-8] Verifica firma webhook (fail-closed)");
    const payloadWebhook = JSON.stringify({
      event_id: "evt_klarna_1",
      event_type: "ORDER_CAPTURED",
      order_id: sessione.paymentId,
      merchant_id: "m1",
    });
    const firmaValida = createHmac("sha256", WH_SECRET).update(payloadWebhook).digest("base64");
    const verificato = await gateway.verificaFirma(
      payloadWebhook,
      new Headers({ "klarna-signature": firmaValida }),
      CRED
    );
    check("7. firma valida → eventId/eventType/paymentId", verificato?.eventId === "evt_klarna_1" && verificato?.eventType === "ORDER_CAPTURED" && verificato?.paymentId === sessione.paymentId, verificato);

    const invalida = await gateway.verificaFirma(
      payloadWebhook,
      new Headers({ "klarna-signature": "firma_falsa_xyz" }),
      CRED
    );
    check("8. firma invalida → null (fail-closed)", invalida === null, invalida);
    const senzaHeader = await gateway.verificaFirma(payloadWebhook, new Headers(), CRED);
    check("8b. firma mancante → null", senzaHeader === null, senzaHeader);
    const senzaSecret = await gateway.verificaFirma(
      payloadWebhook,
      new Headers({ "klarna-signature": firmaValida }),
      CRED_SENZA_WEBHOOK
    );
    check("8c. webhook secret assente → null (fail-closed)", senzaSecret === null, senzaSecret);
    const firmaAltroSecret = createHmac("sha256", "altro_secret").update(payloadWebhook).digest("base64");
    const secretDiverso = await gateway.verificaFirma(
      payloadWebhook,
      new Headers({ "klarna-signature": firmaAltroSecret }),
      CRED
    );
    check("8d. secret diverso → null", secretDiverso === null, secretDiverso);

    // ── 9: stato pagamento ──────────────────────────────────────────────
    console.log("\n[T9] Stato pagamento (mapping order_status → PaymentStatus)");
    mock.ordini.set("stato_auth", { order_status: "AUTHORIZED", order_amount: TOTALE_MINOR, remaining_authorized_amount: TOTALE_MINOR, refunded_amount: 0 });
    check("9a. AUTHORIZED → authorized", (await gateway.statoPagamento("stato_auth", CRED)) === "authorized");
    mock.ordini.set("stato_capt", { order_status: "CAPTURED", order_amount: TOTALE_MINOR, remaining_authorized_amount: 0, refunded_amount: 0 });
    check("9b. CAPTURED → paid", (await gateway.statoPagamento("stato_capt", CRED)) === "paid");
    mock.ordini.set("stato_part", { order_status: "PART_CAPTURED", order_amount: TOTALE_MINOR, remaining_authorized_amount: 1000, refunded_amount: 0 });
    check("9c. PART_CAPTURED → paid", (await gateway.statoPagamento("stato_part", CRED)) === "paid");
    mock.ordini.set("stato_canc", { order_status: "CANCELLED", order_amount: TOTALE_MINOR, remaining_authorized_amount: TOTALE_MINOR, refunded_amount: 0 });
    check("9d. CANCELLED → canceled", (await gateway.statoPagamento("stato_canc", CRED)) === "canceled");
    mock.ordini.set("stato_exp", { order_status: "EXPIRED", order_amount: TOTALE_MINOR, remaining_authorized_amount: TOTALE_MINOR, refunded_amount: 0 });
    check("9e. EXPIRED → expired", (await gateway.statoPagamento("stato_exp", CRED)) === "expired");
    mock.ordini.set("stato_closed_ref", { order_status: "CLOSED", order_amount: TOTALE_MINOR, remaining_authorized_amount: 0, refunded_amount: TOTALE_MINOR });
    check("9f. CLOSED con refund > 0 → refunded", (await gateway.statoPagamento("stato_closed_ref", CRED)) === "refunded");
    mock.ordini.set("stato_closed_paid", { order_status: "CLOSED", order_amount: TOTALE_MINOR, remaining_authorized_amount: 0, refunded_amount: 0 });
    check("9g. CLOSED senza refund → paid", (await gateway.statoPagamento("stato_closed_paid", CRED)) === "paid");
    check("9h. ordine sconosciuto → errore tipizzato 404", await gateway
      .statoPagamento("ordine_inesistente", CRED)
      .then(() => false)
      .catch((e) => e instanceof KlarnaGatewayError && e.codice === "KLARNA_ORDINE_NON_TROVATO"));

    // ── 10: capture ─────────────────────────────────────────────────────
    console.log("\n[T10] Capture");
    mock.ordini.set("capt_ord", { order_status: "AUTHORIZED", order_amount: TOTALE_MINOR, remaining_authorized_amount: TOTALE_MINOR, refunded_amount: 0 });
    const capParziale = await gateway.cattura("capt_ord", 12.34, CRED);
    const corpoCap = parseBody(mock.chiamate[mock.chiamate.length - 1].body);
    check("10a. capture con importo → captured_amount 1234 (minor units)", corpoCap.captured_amount === 1234, corpoCap);
    check("10b. transactionId restituito", Boolean(capParziale.transactionId), capParziale);

    mock.ordini.set("capt_full", { order_status: "AUTHORIZED", order_amount: TOTALE_MINOR, remaining_authorized_amount: TOTALE_MINOR, refunded_amount: 0 });
    await gateway.cattura("capt_full", undefined, CRED);
    const corpoCapFull = parseBody(mock.chiamate[mock.chiamate.length - 1].body);
    check("10c. capture senza importo → autorizzazione residua (3190)", corpoCapFull.captured_amount === TOTALE_MINOR, corpoCapFull);

    // ── 11: cancel ──────────────────────────────────────────────────────
    console.log("\n[T11] Cancel");
    mock.ordini.set("canc_ord", { order_status: "AUTHORIZED", order_amount: TOTALE_MINOR, remaining_authorized_amount: TOTALE_MINOR, refunded_amount: 0 });
    await gateway.annulla("canc_ord", CRED);
    check("11. POST /cancel inviato (204, nessun throw)", mock.chiamate.some((c) => c.url.endsWith("/ordermanagement/v1/orders/canc_ord/cancel")), mock.chiamate.map((c) => c.url).slice(-3));
    check("11b. stato ordine nel mock → CANCELLED", mock.ordini.get("canc_ord")?.order_status === "CANCELLED", mock.ordini.get("canc_ord"));

    // ── 12: refund ──────────────────────────────────────────────────────
    console.log("\n[T12] Refund");
    mock.ordini.set("ref_ord", { order_status: "CAPTURED", order_amount: TOTALE_MINOR, remaining_authorized_amount: 0, refunded_amount: 0 });
    const refundParziale = await gateway.rimborsa("ref_ord", 5.0, CRED);
    const corpoRef = parseBody(mock.chiamate[mock.chiamate.length - 1].body);
    check("12a. refund con importo → refunded_amount 500", corpoRef.refunded_amount === 500, corpoRef);
    check("12b. refundId restituito", refundParziale.refundId === "ref_ord", refundParziale);

    mock.ordini.set("ref_full", { order_status: "PART_CAPTURED", order_amount: TOTALE_MINOR, remaining_authorized_amount: 0, refunded_amount: 1190 });
    await gateway.rimborsa("ref_full", undefined, CRED);
    const corpoRefFull = parseBody(mock.chiamate[mock.chiamate.length - 1].body);
    check("12c. refund senza importo → residuo (3190 − 1190 = 2000)", corpoRefFull.refunded_amount === 2000, corpoRefFull);

    // ── 13: errori tipizzati, senza leak di credenziali ─────────────────
    console.log("\n[T13] Errori API Klarna (tipizzati, fail-closed, senza leak)");
    let codice401 = "";
    let messaggio401 = "";
    mock.setAuthErrata(true);
    try {
      await gateway.statoPagamento("capt_ord", CRED_ERRATA);
    } catch (e) {
      if (e instanceof KlarnaGatewayError) {
        codice401 = e.codice;
        messaggio401 = e.message;
      }
    } finally {
      mock.setAuthErrata(false);
    }
    check("13a. credenziali errate → KLARNA_CREDENZIALI_NON_VALIDE", codice401 === "KLARNA_CREDENZIALI_NON_VALIDE", codice401);
    check("13b. nessun leak della password nel messaggio", !messaggio401.includes(PASSWORD) && !messaggio401.includes("api_password"), messaggio401);

    // 400 ORDER_LINES_AMOUNT_MISMATCH: creiamo un contesto con totale sfasato
    const ctxSfasato: ContestoCheckout = { ...ctx, importo: 30.0 };
    let codice400 = "";
    try {
      await gateway.creaSessione(ctxSfasato, CRED);
    } catch (e) {
      if (e instanceof KlarnaGatewayError) codice400 = e.codice;
    }
    check("13c. totale non coerente → 400 → KLARNA_RICHIESTA_NON_VALIDA", codice400 === "KLARNA_RICHIESTA_NON_VALIDA", codice400);

    let codice404 = "";
    try {
      await gateway.annulla("ordine_sconosciuto", CRED);
    } catch (e) {
      if (e instanceof KlarnaGatewayError) codice404 = e.codice;
    }
    check("13d. ordine inesistente → KLARNA_ORDINE_NON_TROVATO", codice404 === "KLARNA_ORDINE_NON_TROVATO", codice404);

    let codiceNonConf = "";
    try {
      await gateway.creaSessione(ctx, { ...CRED, clientId: "", secret: "" });
    } catch (e) {
      if (e instanceof KlarnaGatewayError) codiceNonConf = e.codice;
    }
    check("13e. credenziali assenti → KLARNA_NON_CONFIGURATO (mai Basic vuoto)", codiceNonConf === "KLARNA_NON_CONFIGURATO", codiceNonConf);
    check("13f. nessuna richiesta HTTP inviata senza credenziali", !mock.chiamate.some((c) => String(c.headers["authorization"] ?? "").startsWith("Basic Og==")), mock.chiamate.map((c) => c.headers["authorization"]));

    // ── 14: nessuna regressione Stripe ──────────────────────────────────
    console.log("\n[T14] Regressione Stripe (GatewayStripe intatto)");
    const stripe = new GatewayStripe();
    check("14a. provider = 'stripe'", stripe.provider === "stripe", stripe.provider);
    const metodi: (keyof PaymentGateway)[] = ["creaSessione", "verificaFirma", "statoPagamento", "cattura", "annulla", "rimborsa"];
    check("14b. interfaccia PaymentGateway completa (6 metodi)", metodi.every((m) => typeof (stripe as unknown as Record<string, unknown>)[m] === "function"), metodi.map((m) => typeof (stripe as unknown as Record<string, unknown>)[m]));
    check("14c. Klarna implementa la stessa interfaccia", metodi.every((m) => typeof gateway[m] === "function"));
    check("14d. provider Klarna = 'klarna'", gateway.provider === "klarna", gateway.provider);

    // ── Riepilogo ───────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`GATEWAY KLARNA TEST: ${passati} passati, ${falliti} falliti`);
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
