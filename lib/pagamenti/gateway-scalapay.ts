/**
 * PAGAMENTI — GATEWAY SCALAPAY (implementazione PaymentGateway).
 *
 * Integra l'Orders API v2 di Scalapay implementando ESATTAMENTE
 * l'interfaccia `PaymentGateway` (lib/pagamenti/types.ts): l'orchestratore
 * usa il registry, mai questo file direttamente. Stesso pattern HTTP del
 * gateway Klarna/PayPal.
 *
 * API reali (base URL separata test/produzione):
 *   - sandbox:     https://integration.api.scalapay.com
 *   - produzione:  https://api.scalapay.com
 *   - auth:        `Authorization: Bearer <API key>` (chiave prefissata
 *                  `sp_`, distinta tra sandbox e produzione). L'API key è
 *                  l'UNICA credenziale del merchant (nessun client id,
 *                  nessun webhook secret separato): autentica le chiamate
 *                  API E firma i webhook (HMAC-SHA256).
 *
 * Flusso:
 *   - creaSessione  → POST /v2/orders (type "online", product "pay-in-3")
 *                     con totalAmount, consumer, items e merchant redirect;
 *                     restituisce `token` (paymentId) + `checkoutUrl`
 *                     (redirect al checkout hosted Scalapay);
 *   - verificaFirma → header `x-scalapay-hmac-v1` = HMAC-SHA256 (hex) di
 *                     `V1:{timestamp}:{JSON.stringify(payload)}` con secret
 *                     = API key del merchant (header `x-scalapay-timestamp`);
 *                     confronto timing-safe, fail-closed (null → rifiuta);
 *   - statoPagamento→ GET /v2/payments/{token} → PaymentStatus
 *                     (charged→paid, authorised→authorized, refunded→refunded,
 *                     expired→expired, cancelled→canceled, altri→pending);
 *   - cattura        → POST /v2/payments/capture (body { token }): la cattura
 *                     è il passo che ADDEBITA davvero il cliente dopo
 *                     l'autorizzazione (evento "authorized" → capture →
 *                     evento "charged");
 *   - annulla        → no-op intenzionale: un ordine autorizzato ma non
 *                     catturato scade da solo (orderExpiryMilliseconds);
 *                     nessun effetto collaterale, MAI fallback su altro
 *                     provider;
 *   - rimborsa       → POST /v2/payments/{token}/refund (importo totale o
 *                     parziale).
 *
 * Importi: SEMPRE in formato decimale stringa EUR (contratto Scalapay);
 * totali/valuta/righe arrivano SOLO dal ContestoCheckout popolato dal server
 * (mai dal client). Consumer (nome/cognome/email/telefono) letto dallo
 * snapshot DB dell'ordine (sessioni.ts), MAI dal browser.
 *
 * Errori: tipizzati (ScalapayGatewayError con codice), mai con credenziali o
 * dati sensibili nel messaggio.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type {
  ContestoCheckout,
  CredenzialiGateway,
  PaymentGateway,
  PaymentStatus,
} from "./types";

/** Base URL Scalapay per ambiente (API UE). */
export const SCALAPAY_BASE_TEST = "https://integration.api.scalapay.com";
export const SCALAPAY_BASE_PROD = "https://api.scalapay.com";

/** Opzioni del gateway (SOLO TEST: base URL alternativa = mock HTTP locale). */
export type GatewayScalapayOptions = {
  baseUrl?: string;
};

/** Errore applicativo del gateway (mai esposto al client in chiaro). */
export class ScalapayGatewayError extends Error {
  codice: string;
  status?: number;
  constructor(codice: string, messaggio: string, dettagli?: { status?: number }) {
    super(messaggio);
    this.codice = codice;
    this.status = dettagli?.status;
  }
}

/** Durata massima dell'autorizzazione (ordine non catturato → scade). */
const ORDER_EXPIRY_MS = 30 * 60 * 1000; // 30 minuti (come la sessione Stripe).

/** Base URL effettiva: override test → sandbox/produzione da testMode. */
function baseUrlEffettiva(
  cred: CredenzialiGateway,
  opts?: GatewayScalapayOptions
): string {
  if (opts?.baseUrl) return opts.baseUrl;
  // Override SOLO per test E2E (mai impostato in produzione).
  const override = process.env.SCALAPAY_API_BASE_URL;
  if (override && override.trim().length > 0) return override.trim();
  return cred.testMode ? SCALAPAY_BASE_TEST : SCALAPAY_BASE_PROD;
}

/** API key (Bearer) del merchant: unica credenziale Scalapay. */
function apiKey(cred: CredenzialiGateway): string {
  const key = (cred.secret ?? "").trim();
  if (!key) {
    throw new ScalapayGatewayError(
      "SCALAPAY_NON_CONFIGURATO",
      "Scalapay non configurato per questo negozio."
    );
  }
  return key;
}

/** Formatta un importo euro in stringa decimale (2 decimali, contratto Scalapay). */
function decimale(importo: number): string {
  return Number(importo).toFixed(2);
}

/** Mappa un errore HTTP Scalapay in un codice tipizzato (mai credenziali). */
function mappaErroreScalapay(status: number, body: unknown): { codice: string; messaggio: string } {
  const json = (body ?? null) as
    | { errorCode?: string; message?: string }
    | null;
  const dettaglio = json?.message ?? json?.errorCode ?? "";

  if (status === 400 || status === 422) {
    return {
      codice: "SCALAPAY_RICHIESTA_NON_VALIDA",
      messaggio: dettaglio
        ? `Richiesta Scalapay non valida: ${dettaglio}.`
        : "Richiesta Scalapay non valida.",
    };
  }
  if (status === 401) {
    return { codice: "SCALAPAY_CREDENZIALI_NON_VALIDE", messaggio: "Credenziali Scalapay non valide." };
  }
  if (status === 403) {
    return { codice: "SCALAPAY_NON_AUTORIZZATO", messaggio: "Operazione Scalapay non autorizzata." };
  }
  if (status === 404) {
    return { codice: "SCALAPAY_ORDINE_NON_TROVATO", messaggio: "Ordine Scalapay non trovato." };
  }
  if (status === 409) {
    return { codice: "SCALAPAY_CONFLITTO", messaggio: "Conflitto sull'ordine Scalapay." };
  }
  return { codice: "SCALAPAY_NON_DISPONIBILE", messaggio: "Scalapay non disponibile. Riprova." };
}

/**
 * Chiamata HTTP a Scalapay con auth Bearer e parsing JSON tipizzato.
 * Errore HTTP → ScalapayGatewayError (mai credenziali nel messaggio).
 */
async function chiamaApiScalapay<T>(
  baseUrl: string,
  path: string,
  cred: CredenzialiGateway,
  opts: { method: string; body?: unknown } = { method: "GET" }
): Promise<T | null> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey(cred)}`,
    ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
  };
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    throw new ScalapayGatewayError(
      "SCALAPAY_NON_RAGGIUNGIBILE",
      timeout || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(err?.message ?? "")
        ? "Scalapay non raggiungibile."
        : "Impossibile contattare Scalapay.",
      { status: 0 }
    );
  }

  const raw = await res.text().catch(() => "");
  let json: unknown = null;
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const { codice, messaggio } = mappaErroreScalapay(res.status, json);
    throw new ScalapayGatewayError(codice, messaggio, { status: res.status });
  }
  return (json as T | null) ?? null;
}

/** Costruisce gli items (order lines) dal contesto (righe F2.3) o fallback legacy. */
function costruisciItems(ctx: ContestoCheckout): Record<string, unknown>[] {
  const valuta = (ctx.valuta || "EUR").toUpperCase();

  if (Array.isArray(ctx.righe) && ctx.righe.length > 0) {
    return ctx.righe.map((riga) => ({
      name: riga.variante ? `${riga.nome} — ${riga.variante}` : riga.nome,
      quantity: riga.quantita,
      price: { amount: decimale(riga.prezzoUnitario), currency: valuta },
      // Categoria generica Scalapay: il catalogo prodotti non espone una
      // categoria Scalapay per riga in questa fase.
      category: "GENERAL",
    }));
  }

  // Fallback legacy: linea unica pari al totale (ordini senza righe caricate).
  return [
    {
      name: `Ordine ${ctx.numeroOrdine}`,
      quantity: 1,
      price: { amount: decimale(Number(ctx.importo)), currency: valuta },
      category: "GENERAL",
    },
  ];
}

export class GatewayScalapay implements PaymentGateway {
  provider = "scalapay" as const;

  private opts: GatewayScalapayOptions;

  /** `opts` consente di puntare a un server mock (solo test). */
  constructor(opts?: GatewayScalapayOptions) {
    this.opts = opts ?? {};
  }

  async creaSessione(
    ctx: ContestoCheckout,
    cred: CredenzialiGateway
  ): Promise<{ paymentId: string; redirectUrl: string; expiresAt?: Date }> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    const importo = Number(ctx.importo);
    if (!Number.isFinite(importo) || importo <= 0) {
      throw new ScalapayGatewayError("IMPORTO_NON_VALIDO", "Importo dell'ordine non valido.");
    }

    // Scalapay richiede i dati del consumatore: li leggiamo dallo snapshot
    // dell'ordine (sessioni.ts), mai dal browser. Assenti → fail-closed.
    const consumer = ctx.consumer;
    if (!consumer || !consumer.nome || !consumer.cognome) {
      throw new ScalapayGatewayError(
        "CONSUMER_MANCANTE",
        "Dati del consumatore non disponibili per Scalapay."
      );
    }

    const valuta = (ctx.valuta || "EUR").toUpperCase();
    const spedizione = Number(ctx.costoSpedizione ?? 0);

    const body: Record<string, unknown> = {
      merchantReference: ctx.numeroOrdine,
      type: "online",
      product: "pay-in-3",
      totalAmount: { amount: decimale(importo), currency: valuta },
      consumer: {
        givenNames: consumer.nome,
        surname: consumer.cognome,
        ...(consumer.email ? { email: consumer.email } : {}),
        ...(consumer.telefono ? { phoneNumber: consumer.telefono } : {}),
      },
      items: costruisciItems(ctx),
      merchant: {
        redirectConfirmUrl: `${ctx.returnUrl}${ctx.returnUrl.includes("?") ? "&" : "?"}esito=ok`,
        redirectCancelUrl: `${ctx.cancelUrl}${ctx.cancelUrl.includes("?") ? "&" : "?"}esito=annullato`,
      },
      taxAmount: { amount: "0.00", currency: valuta },
      ...(spedizione > 0
        ? { shippingAmount: { amount: decimale(spedizione), currency: valuta } }
        : {}),
      orderExpiryMilliseconds: ORDER_EXPIRY_MS,
    };

    const esito = await chiamaApiScalapay<{
      token?: string;
      checkoutUrl?: string;
    }>(baseUrl, "/v2/orders", cred, { method: "POST", body });

    if (!esito?.token || !esito?.checkoutUrl) {
      throw new ScalapayGatewayError(
        "SESSIONE_SENZA_URL",
        "Scalapay non ha restituito un URL di pagamento."
      );
    }

    return {
      // paymentId = token dell'ordine Scalapay (reference salvata in
      // pagamenti_sessioni.payment_id e usata dai webhook per la riconciliazione).
      paymentId: String(esito.token),
      redirectUrl: String(esito.checkoutUrl),
    };
  }

  async verificaFirma(
    rawBody: string,
    headers: Headers,
    cred: CredenzialiGateway
  ): Promise<{ eventId: string; eventType: string; paymentId: string } | null> {
    const firma = headers.get("x-scalapay-hmac-v1");
    const timestamp = headers.get("x-scalapay-timestamp");
    // Scalapay firma i webhook con la STESSA API key del merchant
    // (header `x-scalapay-hmac-v1` = HMAC-SHA256 hex di
    // `V1:{timestamp}:{JSON.stringify(payload)}`).
    const secret = (cred.secret ?? cred.webhookSecret ?? "").trim();
    if (!firma || !timestamp || !secret) return null;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }

    const raw = `V1:${timestamp}:${JSON.stringify(payload)}`;
    const attesa = createHmac("sha256", secret).update(raw).digest("hex");
    try {
      const a = Buffer.from(attesa, "utf8");
      const b = Buffer.from(firma.trim(), "utf8");
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }

    // Payload webhook Scalapay (modello dati ufficiale): 4 campi top-level —
    // totalAmount, status, orderToken, merchantReference (più orderDetails).
    // Il token del pagamento è SEMPRE `orderToken` (top-level). Mapping
    // difensivo per compatibilità legacy, MAI su `eventId`: Scalapay NON
    // espone un event id nel payload. Il webhook handler deriva comunque
    // l'identità autorevole dal payload (webhook-scalapay.ts).
    const annidato = (payload.payload ?? {}) as Record<string, unknown>;
    const paymentId =
      (typeof payload.orderToken === "string" && payload.orderToken) ||
      (typeof payload.token === "string" && payload.token) ||
      (typeof annidato.orderToken === "string" && annidato.orderToken) ||
      "";
    const eventType =
      (typeof payload.status === "string" && payload.status) ||
      (typeof payload.eventName === "string" && payload.eventName) ||
      (typeof payload.eventType === "string" && payload.eventType) ||
      (typeof annidato.status === "string" && annidato.status) ||
      "";
    if (!paymentId) return null;

    // Identificatore deterministico e stabile dell'evento: SHA-256 hex del
    // body RAW ricevuto. Lo stesso identico webhook ritrasmesso (retry)
    // produce lo stesso event_id → idempotenza via UNIQUE su
    // pagamenti_eventi.event_id. MAI un timestamp corrente.
    const eventId = createHash("sha256").update(rawBody).digest("hex");

    return { eventId, eventType, paymentId };
  }

  async statoPagamento(
    paymentId: string,
    cred: CredenzialiGateway
  ): Promise<PaymentStatus> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    const ordine = await chiamaApiScalapay<{ status?: string }>(
      baseUrl,
      `/v2/payments/${encodeURIComponent(paymentId)}`,
      cred,
      { method: "GET" }
    );

    switch (String(ordine?.status ?? "").toLowerCase()) {
      case "charged":
        return "paid";
      case "authorised":
      case "authorized":
        return "authorized";
      case "refunded":
        return "refunded";
      case "expired":
        return "expired";
      case "cancelled":
      case "canceled":
        return "canceled";
      default:
        // created / sconosciuto → in attesa.
        return "pending";
    }
  }

  /** Cattura l'autorizzazione (authorized → charged): addebita davvero il cliente. */
  async cattura(
    paymentId: string,
    _importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ transactionId: string }> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    // Cattura completa dell'autorizzazione residua (body { token }).
    await chiamaApiScalapay(baseUrl, "/v2/payments/capture", cred, {
      method: "POST",
      body: { token: paymentId },
    });
    return { transactionId: paymentId };
  }

  /** Annulla: un ordine autorizzato ma non catturato scade da solo (no-op). */
  async annulla(_paymentId: string, _cred: CredenzialiGateway): Promise<void> {
    // No-op intenzionale: Scalapay non espone una cancellazione API per gli
    // ordini creati via checkout; la scadenza è gestita dall'app
    // (orderExpiryMilliseconds + evento webhook "expired").
  }

  /** Rimborso totale (importo undefined) o parziale sulla cattura. */
  async rimborsa(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ refundId: string }> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    const body: Record<string, unknown> = importo !== undefined && Number(importo) > 0
      ? { refundRequest: { amount: { amount: decimale(importo), currency: "EUR" } } }
      : { refundRequest: {} };

    await chiamaApiScalapay(
      baseUrl,
      `/v2/payments/${encodeURIComponent(paymentId)}/refund`,
      cred,
      { method: "POST", body }
    );
    return { refundId: paymentId };
  }
}
