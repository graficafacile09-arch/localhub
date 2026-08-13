/**
 * PAGAMENTI — GATEWAY PAYPAL (implementazione PaymentGateway).
 *
 * Integra PayPal Orders API v2 implementando ESATTAMENTE l'interfaccia
 * `PaymentGateway` (lib/pagamenti/types.ts): l'orchestratore usa il registry,
 * mai questo file direttamente. Stesso pattern HTTP del gateway Klarna.
 *
 * API reali (base URL separata test/produzione):
 *   - test:       https://api-m.sandbox.paypal.com
 *   - produzione: https://api-m.paypal.com
 *   - auth:       OAuth2 client-credentials (clientId + secret) →
 *                 access token Bearer, mai hardcoded, mai nei log, mai al
 *                 client (credenziali decifrate server-side via
 *                 getConfigProviderNegozio / CredenzialiGateway).
 *
 * Flusso:
 *   - creaSessione  → POST /v2/checkout/orders (intent=CAPTURE) con
 *                     purchase_units dagli SNAPSHOT DB (mai dal client);
 *                     restituisce order_id (paymentId) + link "approve"
 *                     (redirectUrl hosted checkout PayPal);
 *   - statoPagamento→ GET /v2/checkout/orders/{id} → PaymentStatus
 *                     (COMPLETED→paid, APPROVED→authorized, VOIDED→canceled,
 *                     altri→pending);
 *   - cattura        → POST /v2/checkout/orders/{id}/capture (cattura
 *                     dell'ordine/authorization; con CAPTURE la cattura è
 *                     automatica all'approvazione, questo è il fallback di
 *                     riconciliazione);
 *   - annulla        → no-op: gli ordini PayPal CAPTURE-intent non hanno una
 *                     cancellazione API (scadono da soli); nessun effetto
 *                     collaterale, MAI un fallback su altro provider;
 *   - rimborsa       → POST /v2/payments/captures/{capture_id}/refund
 *                     (risolve il capture id dall'ordine);
 *   - verificaFirma  → verifica webhook via
 *                     POST /v1/notifications/verify-webhook-signature
 *                     (webhook_id = cred.webhookSecret) con gli header
 *                     PAYPAL-TRANSMISSION-*; fail-closed (null → rifiuta).
 *
 * Importi: SEMPRE in formato decimale EUR (valuta dal ContestoCheckout,
 * mai dal client). Righe F2.3 (snapshot DB) come items + breakdown;
 * senza righe → fallback legacy (unico importo sul totale).
 *
 * Errori: tipizzati (PaypalGatewayError con codice), mai con credenziali o
 * dati sensibili nel messaggio.
 */

import type {
  ContestoCheckout,
  CredenzialiGateway,
  PaymentGateway,
  PaymentStatus,
} from "./types";

/** Base URL PayPal per ambiente. */
export const PAYPAL_BASE_TEST = "https://api-m.sandbox.paypal.com";
export const PAYPAL_BASE_PROD = "https://api-m.paypal.com";

/** Opzioni del gateway (SOLO TEST: base URL alternativa = mock HTTP locale). */
export type GatewayPaypalOptions = {
  baseUrl?: string;
};

/** Errore applicativo del gateway (mai esposto al client in chiaro). */
export class PaypalGatewayError extends Error {
  codice: string;
  status?: number;
  constructor(codice: string, messaggio: string, dettagli?: { status?: number }) {
    super(messaggio);
    this.codice = codice;
    this.status = dettagli?.status;
  }
}

/** Base URL effettiva: override test → sandbox/produzione da testMode. */
function baseUrlEffettiva(
  cred: CredenzialiGateway,
  opts?: GatewayPaypalOptions
): string {
  if (opts?.baseUrl) return opts.baseUrl;
  // Override SOLO per test E2E (mai impostato in produzione).
  const override = process.env.PAYPAL_API_BASE_URL;
  if (override && override.trim().length > 0) return override.trim();
  return cred.testMode ? PAYPAL_BASE_TEST : PAYPAL_BASE_PROD;
}

/** Credenziali Basic per OAuth2 client-credentials (clientId:secret). */
function basicAuth(cred: CredenzialiGateway): string {
  const username = (cred.clientId ?? "").trim();
  const password = (cred.secret ?? "").trim();
  if (!username || !password) {
    throw new PaypalGatewayError(
      "PAYPAL_NON_CONFIGURATO",
      "PayPal non configurato per questo negozio."
    );
  }
  return Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}

/** Formatta un importo euro in stringa decimale (2 decimali, contratto PayPal). */
function decimale(importo: number): string {
  return Number(importo).toFixed(2);
}

/** Mappa un errore HTTP PayPal in un codice tipizzato (mai credenziali). */
function mappaErrorePaypal(status: number, body: unknown): { codice: string; messaggio: string } {
  const json = (body ?? null) as
    | { name?: string; message?: string; details?: Array<{ issue?: string; description?: string }> }
    | null;
  const dettaglio = Array.isArray(json?.details) && json.details.length > 0
    ? json.details[0]?.description ?? json.details[0]?.issue ?? ""
    : json?.message ?? "";

  if (status === 400 || status === 422) {
    return {
      codice: "PAYPAL_RICHIESTA_NON_VALIDA",
      messaggio: dettaglio
        ? `Richiesta PayPal non valida: ${dettaglio}.`
        : "Richiesta PayPal non valida.",
    };
  }
  if (status === 401) {
    return { codice: "PAYPAL_CREDENZIALI_NON_VALIDE", messaggio: "Credenziali PayPal non valide." };
  }
  if (status === 403) {
    return { codice: "PAYPAL_NON_AUTORIZZATO", messaggio: "Operazione PayPal non autorizzata." };
  }
  if (status === 404) {
    return { codice: "PAYPAL_ORDINE_NON_TROVATO", messaggio: "Ordine PayPal non trovato." };
  }
  if (status === 409) {
    return { codice: "PAYPAL_CONFLITTO", messaggio: "Conflitto sull'ordine PayPal." };
  }
  return { codice: "PAYPAL_NON_DISPONIBILE", messaggio: "PayPal non disponibile. Riprova." };
}

/** HTTP JSON verso PayPal con auth Bearer (opzionale) o Basic, timeout 10s. */
async function chiamaApiPaypal<T>(
  baseUrl: string,
  path: string,
  cred: CredenzialiGateway,
  opts: {
    method: string;
    body?: unknown;
    headers?: Record<string, string>;
    bearer?: string;
  } = { method: "GET" }
): Promise<T | null> {
  const headers: Record<string, string> = {
    ...(opts.bearer
      ? { authorization: `Bearer ${opts.bearer}` }
      : { authorization: `Basic ${basicAuth(cred)}` }),
    ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    ...opts.headers,
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
    throw new PaypalGatewayError(
      "PAYPAL_NON_RAGGIUNGIBILE",
      timeout || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(err?.message ?? "")
        ? "PayPal non raggiungibile."
        : "Impossibile contattare PayPal.",
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
    const { codice, messaggio } = mappaErrorePaypal(res.status, json);
    throw new PaypalGatewayError(codice, messaggio, { status: res.status });
  }
  return (json as T | null) ?? null;
}

/** Ottiene un access token OAuth2 (client-credentials) per le chiamate API. */
async function accessToken(
  cred: CredenzialiGateway,
  opts?: GatewayPaypalOptions
): Promise<string> {
  const baseUrl = baseUrlEffettiva(cred, opts);
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth(cred)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new PaypalGatewayError("PAYPAL_NON_RAGGIUNGIBILE", "PayPal non raggiungibile.");
  });

  const raw = await res.text().catch(() => "");
  let accessTokenStr: string | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { access_token?: string } | null;
      accessTokenStr = typeof parsed?.access_token === "string" ? parsed.access_token : null;
    } catch {
      accessTokenStr = null;
    }
  }
  if (!res.ok || !accessTokenStr) {
    throw new PaypalGatewayError(
      "PAYPAL_CREDENZIALI_NON_VALIDE",
      "Impossibile autenticarsi presso PayPal.",
      { status: res.status }
    );
  }
  return accessTokenStr;
}

/** Costruisce la purchase_unit (items + breakdown) dagli snapshot DB. */
function costruisciPurchaseUnit(ctx: ContestoCheckout): Record<string, unknown> {
  const valuta = (ctx.valuta || "EUR").toUpperCase();

  if (Array.isArray(ctx.righe) && ctx.righe.length > 0) {
    const items = ctx.righe.map((riga) => ({
      name: riga.variante ? `${riga.nome} — ${riga.variante}` : riga.nome,
      unit_amount: { currency_code: valuta, value: decimale(riga.prezzoUnitario) },
      quantity: String(riga.quantita),
    }));
    const itemTotal = ctx.righe.reduce(
      (s, r) => s + Math.round(r.prezzoUnitario * r.quantita * 100) / 100,
      0
    );
    const spedizione = Number(ctx.costoSpedizione ?? 0);
    const totale = Math.round((itemTotal + spedizione) * 100) / 100;
    const breakdown: Record<string, unknown> = {
      item_total: { currency_code: valuta, value: decimale(itemTotal) },
    };
    if (spedizione > 0) {
      breakdown.shipping = { currency_code: valuta, value: decimale(spedizione) };
    }
    return {
      reference_id: ctx.ordineId,
      custom_id: ctx.ordineId,
      invoice_id: ctx.numeroOrdine,
      items,
      amount: { currency_code: valuta, value: decimale(totale), breakdown },
    };
  }

  // Fallback legacy: unico importo pari al totale (ordini senza righe).
  return {
    reference_id: ctx.ordineId,
    custom_id: ctx.ordineId,
    invoice_id: ctx.numeroOrdine,
    amount: { currency_code: valuta, value: decimale(Number(ctx.importo)) },
  };
}

export class GatewayPaypal implements PaymentGateway {
  provider = "paypal" as const;

  private opts: GatewayPaypalOptions;

  /** `opts` consente di puntare a un server mock (solo test). */
  constructor(opts?: GatewayPaypalOptions) {
    this.opts = opts ?? {};
  }

  async creaSessione(
    ctx: ContestoCheckout,
    cred: CredenzialiGateway
  ): Promise<{ paymentId: string; redirectUrl: string; expiresAt?: Date }> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    const importo = Number(ctx.importo);
    if (!Number.isFinite(importo) || importo <= 0) {
      throw new PaypalGatewayError("IMPORTO_NON_VALIDO", "Importo dell'ordine non valido.");
    }

    const token = await accessToken(cred, this.opts);
    const esito = await chiamaApiPaypal<{
      id?: string;
      status?: string;
      links?: Array<{ rel?: string; href?: string }>;
    }>(baseUrl, "/v2/checkout/orders", cred, {
      method: "POST",
      bearer: token,
      headers: { "prefer": "return=representation" },
      body: {
        intent: "CAPTURE",
        purchase_units: [costruisciPurchaseUnit(ctx)],
        application_context: {
          brand_name: "InCittà",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: `${ctx.returnUrl}${ctx.returnUrl.includes("?") ? "&" : "?"}esito=ok`,
          cancel_url: `${ctx.cancelUrl}${ctx.cancelUrl.includes("?") ? "&" : "?"}esito=annullato`,
        },
      },
    });

    const approve = esito?.links?.find((l) => l.rel === "approve")?.href;
    if (!esito?.id || !approve) {
      throw new PaypalGatewayError(
        "SESSIONE_SENZA_URL",
        "PayPal non ha restituito un URL di pagamento."
      );
    }
    return {
      paymentId: String(esito.id),
      redirectUrl: approve,
    };
  }

  async verificaFirma(
    rawBody: string,
    headers: Headers,
    cred: CredenzialiGateway
  ): Promise<{ eventId: string; eventType: string; paymentId: string } | null> {
    const webhookId = (cred.webhookSecret ?? "").trim();
    const transmissionId = headers.get("paypal-transmission-id");
    const transmissionTime = headers.get("paypal-transmission-time");
    const transmissionSig = headers.get("paypal-transmission-sig");
    const certUrl = headers.get("paypal-cert-url");
    const authAlgo = headers.get("paypal-auth-algo");
    if (!webhookId || !transmissionId || !transmissionSig) return null;

    let webhookEvent: Record<string, unknown>;
    try {
      webhookEvent = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }

    const token = await accessToken(cred, this.opts);
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    const verifica = await chiamaApiPaypal<{ verification_status?: string }>(
      baseUrl,
      "/v1/notifications/verify-webhook-signature",
      cred,
      {
        method: "POST",
        bearer: token,
        body: {
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: webhookEvent,
        },
      }
    );

    if (verifica?.verification_status !== "SUCCESS") return null;

    const eventId = typeof webhookEvent.id === "string" ? webhookEvent.id : "";
    const eventType = typeof webhookEvent.event_type === "string" ? webhookEvent.event_type : "";
    const resource = (webhookEvent.resource ?? {}) as {
      id?: unknown;
      supplementary_data?: { related_ids?: { order_id?: unknown } };
    };
    // paymentId = PayPal ORDER id (reference salvato in pagamenti_sessioni):
    // per gli eventi di cattura l'order id è in related_ids, per gli eventi
    // CHECKOUT.ORDER.* è resource.id.
    const related = resource.supplementary_data?.related_ids?.order_id;
    const paymentId =
      typeof related === "string" && related
        ? related
        : typeof resource.id === "string"
          ? resource.id
          : "";
    if (!eventId || !paymentId) return null;
    return { eventId, eventType, paymentId };
  }

  async statoPagamento(
    paymentId: string,
    cred: CredenzialiGateway
  ): Promise<PaymentStatus> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    const token = await accessToken(cred, this.opts);
    const ordine = await chiamaApiPaypal<{ status?: string }>(
      baseUrl,
      `/v2/checkout/orders/${encodeURIComponent(paymentId)}`,
      cred,
      { method: "GET", bearer: token }
    );
    switch (ordine?.status) {
      case "COMPLETED":
        return "paid";
      case "APPROVED":
        return "authorized";
      case "VOIDED":
        return "canceled";
      default:
        // CREATED / SAVED / PAYER_ACTION_REQUIRED → in attesa.
        return "pending";
    }
  }

  /** Cattura: con CAPTURE la cattura è automatica; questo è il fallback. */
  async cattura(
    paymentId: string,
    _importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ transactionId: string }> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    const token = await accessToken(cred, this.opts);
    const esito = await chiamaApiPaypal<{
      id?: string;
      purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string }> } }>;
    }>(baseUrl, `/v2/checkout/orders/${encodeURIComponent(paymentId)}/capture`, cred, {
      method: "POST",
      bearer: token,
    });
    const captureId = esito?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    return { transactionId: captureId ?? esito?.id ?? paymentId };
  }

  /** Annulla: gli ordini CAPTURE-intent non hanno cancellazione API (scadono). */
  async annulla(_paymentId: string, _cred: CredenzialiGateway): Promise<void> {
    // No-op intenzionale: PayPal non espone una cancellazione per gli ordini
    // CAPTURE-intent creati via checkout; la scadenza è gestita dall'app.
  }

  /** Rimborso totale (importo undefined → residuo) o parziale sulla cattura. */
  async rimborsa(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ refundId: string }> {
    const baseUrl = baseUrlEffettiva(cred, this.opts);
    const token = await accessToken(cred, this.opts);

    // Risolve il capture id dall'ordine (prima cattura disponibile).
    const ordine = await chiamaApiPaypal<{
      purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string }> } }>;
    }>(baseUrl, `/v2/checkout/orders/${encodeURIComponent(paymentId)}`, cred, {
      method: "GET",
      bearer: token,
    });
    const captureId = ordine?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    if (!captureId) {
      throw new PaypalGatewayError(
        "RIMBORSO_NON_POSSIBILE",
        "Nessuna cattura associata all'ordine PayPal."
      );
    }

    // Rimborso totale (nessun amount) o parziale (amount esplicito).
    const body: Record<string, unknown> =
      importo !== undefined && Number(importo) > 0
        ? { amount: { currency_code: "EUR", value: decimale(importo) } }
        : {};

    const esito = await chiamaApiPaypal<{ id?: string }>(
      baseUrl,
      `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
      cred,
      { method: "POST", bearer: token, body: Object.keys(body).length ? body : undefined }
    );
    return { refundId: esito?.id ?? captureId };
  }
}
