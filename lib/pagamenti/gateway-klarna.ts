/**
 * PAGAMENTI — GATEWAY KLARNA (implementazione PaymentGateway).
 *
 * Integra Klarna Checkout (KCO) + Order Management (OM) implementando
 * ESATTAMENTE l'interfaccia `PaymentGateway` (lib/pagamenti/types.ts):
 * l'orchestratore usa il registry, mai questo file direttamente.
 *
 * API reali (base URL separata test/produzione):
 *   - test:      https://api.playground.klarna.com
 *   - produzione: https://api.klarna.com
 *   - auth:      HTTP Basic con api_username (clientId) e api_password
 *                (secret) dalle CREDENZIALI decifrate server-side
 *                (getConfigProviderNegozio / CredenzialiGateway) — mai
 *                hardcoded, mai nei log, mai al client.
 *
 * Flusso:
 *   - creaSessione  → POST /checkout/v3/orders (Payment Session KCO) con
 *                     Klarna-Idempotency-Key deterministica dall'ordine
 *                     (identità fornita dall'orchestratore); restituisce
 *                     order_id (paymentId) + redirect_url (hosted checkout);
 *   - statoPagamento→ GET /ordermanagement/v1/orders/{id} → PaymentStatus
 *                     (AUTHORIZED→authorized, CAPTURED/PART_CAPTURED→paid,
 *                     CANCELLED→canceled, EXPIRED→expired, CLOSED→paid o
 *                     refunded se rimborsato);
 *   - cattura        → POST .../{id}/captures (captured_amount obbligatorio:
 *                     fornito dall'orchestratore, altrimenti autorizzazione
 *                     residua letta dall'ordine);
 *   - annulla        → POST .../{id}/cancel;
 *   - rimborsa       → POST .../{id}/refunds (refunded_amount obbligatorio:
 *                     fornito, altrimenti residuo rimborsabile = order_amount
 *                     − già rimborsato);
 *   - verificaFirma  → header `Klarna-Signature` = Base64(HMAC-SHA256(body,
 *                     shared secret del negozio)); confronto timing-safe,
 *                     fail-closed (null → rifiuta).
 *
 * Importi: SEMPRE in minor units (centesimi) secondo il contratto Klarna;
 * totali e valuta arrivano SOLO dal ContestoCheckout popolato dal server
 * (mai dal client). Righe F2.3 (snapshot DB) + spedizione come order_line
 * dedicata; senza righe → fallback legacy (linea unica sul totale).
 *
 * Errori: tipizzati (KlarnaGatewayError con codice), mai con credenziali o
 * dati sensibili nel messaggio.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSiteUrl } from "@/lib/site";
import type {
  ContestoCheckout,
  CredenzialiGateway,
  PaymentGateway,
  PaymentStatus,
} from "./types";

/** Base URL Klarna per ambiente (API UE). */
export const KLARNA_BASE_TEST = "https://api.playground.klarna.com";
export const KLARNA_BASE_PROD = "https://api.klarna.com";

/** Opzioni del gateway (SOLO TEST: base URL alternativa = mock HTTP locale). */
export type GatewayKlarnaOptions = {
  baseUrl?: string;
};

/** Errore applicativo del gateway (mai esposto al client in chiaro). */
export class KlarnaGatewayError extends Error {
  codice: string;
  status?: number;
  correlationId?: string;
  constructor(
    codice: string,
    messaggio: string,
    dettagli?: { status?: number; correlationId?: string }
  ) {
    super(messaggio);
    this.codice = codice;
    this.status = dettagli?.status;
    this.correlationId = dettagli?.correlationId;
  }
}

/** Base URL effettiva: override test → playground/produzione da testMode. */
function baseUrlEffettiva(
  cred: CredenzialiGateway,
  opts?: GatewayKlarnaOptions
): string {
  if (opts?.baseUrl) return opts.baseUrl;
  return cred.testMode ? KLARNA_BASE_TEST : KLARNA_BASE_PROD;
}

/** Converte euro in minor units (centesimi) secondo il contratto Klarna. */
function inMinorUnits(importo: number): number {
  return Math.round(Number(importo) * 100);
}

/** Credenziali Basic: api_username = clientId, api_password = secret. */
function basicAuth(cred: CredenzialiGateway): string {
  const username = (cred.clientId ?? "").trim();
  const password = (cred.secret ?? "").trim();
  if (!username || !password) {
    throw new KlarnaGatewayError(
      "KLARNA_NON_CONFIGURATO",
      "Klarna non configurato per questo negozio."
    );
  }
  return Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}

/** Mappa un errore HTTP Klarna in un codice tipizzato (mai credenziali nel messaggio). */
function mappaErroreKlarna(status: number, body: unknown): { codice: string; messaggio: string } {
  const json = (body ?? null) as
    | { error_code?: string; error_messages?: string[]; correlation_id?: string }
    | null;
  const dettaglio = Array.isArray(json?.error_messages) && json.error_messages.length > 0
    ? json.error_messages[0]
    : json?.error_code ?? "";

  if (status === 400 || status === 422) {
    return {
      codice: "KLARNA_RICHIESTA_NON_VALIDA",
      messaggio: dettaglio
        ? `Richiesta Klarna non valida: ${dettaglio}.`
        : "Richiesta Klarna non valida.",
    };
  }
  if (status === 401) {
    return { codice: "KLARNA_CREDENZIALI_NON_VALIDE", messaggio: "Credenziali Klarna non valide." };
  }
  if (status === 403) {
    return { codice: "KLARNA_NON_AUTORIZZATO", messaggio: "Operazione Klarna non autorizzata." };
  }
  if (status === 404) {
    return { codice: "KLARNA_ORDINE_NON_TROVATO", messaggio: "Ordine Klarna non trovato." };
  }
  if (status === 409) {
    return { codice: "KLARNA_CONFLITTO", messaggio: "Conflitto sull'ordine Klarna." };
  }
  return { codice: "KLARNA_NON_DISPONIBILE", messaggio: "Klarna non disponibile. Riprova." };
}

/**
 * Chiamata HTTP a Klarna con Basic auth e parsing JSON tipizzato.
 * `body` undefined → richiesta senza corpo (GET / OM senza payload).
 * Errore HTTP → KlarnaGatewayError (mai credenziali nel messaggio).
 */
async function chiamaApiKlarna<T>(
  baseUrl: string,
  path: string,
  cred: CredenzialiGateway,
  opts: { method: string; body?: unknown; headers?: Record<string, string> } = { method: "GET" }
): Promise<T | null> {
  const auth = basicAuth(cred);
  const headers: Record<string, string> = {
    authorization: `Basic ${auth}`,
    ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    ...opts.headers,
  };
  let res: Response;
  try {
    // Timeout di sicurezza: una connessione appesa non deve mai bloccare
    // il request handler (l'SDK Stripe ha i propri timeout; qui serve il
    // nostro). Abort → KLARNA_NON_RAGGIUNGIBILE (mai credenziali nel messaggio).
    res = await fetch(`${baseUrl}${path}`, {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    throw new KlarnaGatewayError(
      "KLARNA_NON_RAGGIUNGIBILE",
      timeout || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(err?.message ?? "")
        ? "Klarna non raggiungibile."
        : "Impossibile contattare Klarna.",
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
    const { codice, messaggio } = mappaErroreKlarna(res.status, json);
    throw new KlarnaGatewayError(codice, messaggio, {
      status: res.status,
      correlationId: (json as { correlation_id?: string } | null)?.correlation_id,
    });
  }
  return (json as T | null) ?? null;
}

/** Costruisce le order_lines dal contesto (righe F2.3 + spedizione) o legacy. */
function costruisciOrderLines(ctx: ContestoCheckout): {
  order_lines: Record<string, unknown>[];
  order_tax_amount: number;
} {
  if (Array.isArray(ctx.righe) && ctx.righe.length > 0) {
    const lines: Record<string, unknown>[] = ctx.righe.map((riga) => {
      const unitPrice = inMinorUnits(riga.prezzoUnitario);
      return {
        type: "physical",
        name: riga.variante ? `${riga.nome} — ${riga.variante}` : riga.nome,
        quantity: riga.quantita,
        unit_price: unitPrice,
        total_amount: unitPrice * riga.quantita,
        // Nessun motore IVA in questa fase: aliquota 0 (importi già comprensivi).
        tax_rate: 0,
        total_tax_amount: 0,
      };
    });
    const spedizione = inMinorUnits(Number(ctx.costoSpedizione ?? 0));
    if (spedizione > 0) {
      lines.push({
        type: "shipping_fee",
        name: "Spedizione",
        quantity: 1,
        unit_price: spedizione,
        total_amount: spedizione,
        tax_rate: 0,
        total_tax_amount: 0,
      });
    }
    return { order_lines: lines, order_tax_amount: 0 };
  }
  // Fallback legacy: linea unica pari al totale (ordini senza righe caricate).
  const importo = inMinorUnits(Number(ctx.importo));
  return {
    order_lines: [
      {
        type: "physical",
        name: `Ordine ${ctx.numeroOrdine}`,
        quantity: 1,
        unit_price: importo,
        total_amount: importo,
        tax_rate: 0,
        total_tax_amount: 0,
      },
    ],
    order_tax_amount: 0,
  };
}

export class GatewayKlarna implements PaymentGateway {
  provider = "klarna" as const;

  private opts: GatewayKlarnaOptions;

  /** `opts` consente di puntare a un server mock (solo test). */
  constructor(opts?: GatewayKlarnaOptions) {
    this.opts = opts ?? {};
  }

  async creaSessione(
    ctx: ContestoCheckout,
    cred: CredenzialiGateway
  ): Promise<{ paymentId: string; redirectUrl: string; expiresAt?: Date }> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    const importo = Number(ctx.importo);
    if (!Number.isFinite(importo) || importo <= 0) {
      throw new KlarnaGatewayError("IMPORTO_NON_VALIDO", "Importo dell'ordine non valido.");
    }

    const { order_lines, order_tax_amount } = costruisciOrderLines(ctx);
    // order_amount = totale DAL ContestoCheckout (server: ordine.totale
    // persistito), SEMPRE in minor units. L'equivalenza con la somma delle
    // order_lines è garantita dall'orchestratore (F2.3, TOTALE_NON_COERENTE
    // fail-closed); se non coincide, Klarna rifiuta con 400 → errore tipizzato
    // (mai una sessione con importo diverso da quello persistito).
    const orderAmount = inMinorUnits(importo);
    const siteUrl = getSiteUrl();

    const body = {
      purchase_country: "IT",
      purchase_currency: (ctx.valuta || "EUR").toUpperCase(),
      locale: "it-IT",
      order_amount: orderAmount,
      order_tax_amount,
      order_lines,
      merchant_urls: {
        terms: siteUrl,
        checkout: siteUrl,
        confirmation: ctx.returnUrl,
        // Endpoint webhook Klarna previsto (la route arriva con l'integrazione
        // checkout: questo file NON modifica alcun webhook esistente).
        push: `${siteUrl}/api/webhook/pagamenti/klarna`,
        failure: ctx.cancelUrl,
        cancel: ctx.cancelUrl,
        error: ctx.cancelUrl,
      },
      merchant_reference1: ctx.numeroOrdine,
      merchant_reference2: ctx.ordineId,
      auto_capture: false,
    };

    // Idempotenza: chiave deterministica dall'identità fornita
    // dall'orchestratore (ordineId) → un retry non duplica l'ordine Klarna.
    const idempotencyKey = `klarna:${ctx.ordineId}`;

    const esito = await chiamaApiKlarna<{
      order_id?: string;
      redirect_url?: string;
      status?: string;
    }>(baseUrl, "/checkout/v3/orders", cred, {
      method: "POST",
      body,
      headers: { "klarna-idempotency-key": idempotencyKey },
    });

    if (!esito?.order_id || !esito?.redirect_url) {
      throw new KlarnaGatewayError(
        "SESSIONE_SENZA_URL",
        "Klarna non ha restituito un URL di pagamento."
      );
    }
    return {
      paymentId: String(esito.order_id),
      redirectUrl: String(esito.redirect_url),
      // Klarna non espone una scadenza esplicita della sessione checkout:
      // la gestione scadenze resta orchestrata dall'app (payment_expires_at).
    };
  }

  async verificaFirma(
    rawBody: string,
    headers: Headers,
    cred: CredenzialiGateway
  ): Promise<{ eventId: string; eventType: string; paymentId: string } | null> {
    const signature = headers.get("klarna-signature");
    const secret = (cred.webhookSecret ?? "").trim();
    if (!signature || !secret) return null;

    // Klarna firma il body RAW con HMAC-SHA256 e lo serializza in Base64.
    const attesa = createHmac("sha256", secret).update(rawBody).digest("base64");
    try {
      const a = Buffer.from(attesa, "utf8");
      const b = Buffer.from(signature.trim(), "utf8");
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }

    let evento: { event_id?: unknown; event_type?: unknown; order_id?: unknown };
    try {
      evento = JSON.parse(rawBody) as typeof evento;
    } catch {
      return null;
    }
    const eventId = typeof evento.event_id === "string" ? evento.event_id : "";
    const eventType = typeof evento.event_type === "string" ? evento.event_type : "";
    const paymentId = typeof evento.order_id === "string" ? evento.order_id : "";
    if (!eventId || !paymentId) return null;
    return { eventId, eventType, paymentId };
  }

  async statoPagamento(
    paymentId: string,
    cred: CredenzialiGateway
  ): Promise<PaymentStatus> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    const ordine = await chiamaApiKlarna<{
      order_status?: string;
      order_amount?: number;
      refunded_amount?: number;
    }>(baseUrl, `/ordermanagement/v1/orders/${encodeURIComponent(paymentId)}`, cred, {
      method: "GET",
    });

    switch (ordine?.order_status) {
      case "AUTHORIZED":
        return "authorized";
      case "PART_CAPTURED":
      case "CAPTURED":
        return "paid";
      case "CANCELLED":
        return "canceled";
      case "EXPIRED":
        return "expired";
      case "CLOSED":
        return Number(ordine.refunded_amount ?? 0) > 0 ? "refunded" : "paid";
      default:
        // checkout_incomplete / sconosciuto → in attesa.
        return "pending";
    }
  }

  /** Cattura: importo fornito → parziale/totale; altrimenti autorizzazione residua. */
  async cattura(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ transactionId: string }> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    let capturedAmount: number;
    if (importo !== undefined && Number(importo) > 0) {
      capturedAmount = inMinorUnits(importo);
    } else {
      const ordine = await chiamaApiKlarna<{
        order_amount?: number;
        remaining_authorized_amount?: number;
      }>(baseUrl, `/ordermanagement/v1/orders/${encodeURIComponent(paymentId)}`, cred, {
        method: "GET",
      });
      capturedAmount = Number(ordine?.remaining_authorized_amount ?? ordine?.order_amount ?? 0);
      if (capturedAmount <= 0) {
        throw new KlarnaGatewayError(
          "CATTURA_NON_POSSIBILE",
          "Nessuna autorizzazione residua da catturare."
        );
      }
    }
    const esito = await chiamaApiKlarna<{ capture_id?: string }>(
      baseUrl,
      `/ordermanagement/v1/orders/${encodeURIComponent(paymentId)}/captures`,
      cred,
      { method: "POST", body: { captured_amount: capturedAmount } }
    );
    return { transactionId: esito?.capture_id ?? paymentId };
  }

  /** Annulla un ordine non ancora catturato (rilascia l'autorizzazione). */
  async annulla(paymentId: string, cred: CredenzialiGateway): Promise<void> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    await chiamaApiKlarna(
      baseUrl,
      `/ordermanagement/v1/orders/${encodeURIComponent(paymentId)}/cancel`,
      cred,
      { method: "POST" }
    );
  }

  /** Rimborso totale (importo undefined → residuo) o parziale. */
  async rimborsa(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ refundId: string }> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    let refundedAmount: number;
    if (importo !== undefined && Number(importo) > 0) {
      refundedAmount = inMinorUnits(importo);
    } else {
      // Rimborso completo: residuo rimborsabile = order_amount − già rimborsato.
      const ordine = await chiamaApiKlarna<{
        order_amount?: number;
        refunded_amount?: number;
      }>(baseUrl, `/ordermanagement/v1/orders/${encodeURIComponent(paymentId)}`, cred, {
        method: "GET",
      });
      const giaRimborsato = Number(ordine?.refunded_amount ?? 0);
      refundedAmount = Math.max(0, Number(ordine?.order_amount ?? 0) - giaRimborsato);
      if (refundedAmount <= 0) {
        throw new KlarnaGatewayError(
          "RIMBORSO_NON_POSSIBILE",
          "Nessun importo residuo da rimborsare."
        );
      }
    }
    await chiamaApiKlarna(
      baseUrl,
      `/ordermanagement/v1/orders/${encodeURIComponent(paymentId)}/refunds`,
      cred,
      { method: "POST", body: { refunded_amount: refundedAmount } }
    );
    return { refundId: paymentId };
  }
}
