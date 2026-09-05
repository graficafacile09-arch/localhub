/**
 * PAGAMENTI — WEBHOOK SCALAPAY (solo server).
 *
 * Riceve gli eventi Scalapay per TUTTI i negozi (endpoint unico
 * /api/webhook/pagamenti/scalapay): la firma viene verificata provando le
 * API key delle configurazioni Scalapay attive (header `x-scalapay-hmac-v1`
 * = HMAC-SHA256 di `V1:{timestamp}:{JSON.stringify(payload)}`, secret = API
 * key del merchant, header `x-scalapay-timestamp`).
 *
 * Sicurezza:
 *   - firma mancante/invalida → 400 fail-closed, NESSUNA operazione DB;
 *   - l'ordine viene identificato SOLO tramite il payment/session reference
 *     salvato durante la sessione (pagamenti_sessioni.payment_id con
 *     provider='scalapay'): mai dal client, mai verso ordini di altri
 *     provider (un token Scalapay non tocca MAI un ordine Stripe/Klarna/...);
 *   - nessun fallback verso altri provider: provider resta "scalapay".
 *
 * Idempotenza: il payload Scalapay NON contiene un event id; l'identificatore
 * deterministico è lo SHA-256 hex del body RAW ricevuto (lo stesso webhook
 * ritrasmesso produce lo stesso event_id) → UNIQUE su pagamenti_eventi.event_id;
 * la macchina a stati aggiorna_payment_status blocca il doppio aggiornamento
 * (paid→paid = no-op).
 *
 * Payload reale (modello dati ufficiale, 4 campi top-level):
 *   { totalAmount, status, orderToken, merchantReference } (+ orderDetails)
 *   - event_id  = SHA-256 del body RAW (deterministico, idempotente);
 *   - token     = orderToken (top-level) — MAI altri campi;
 *   - eventType = status — supportati ESATTAMENTE: created, authorized,
 *                 charged, refunded, expired (sconosciuto → fail-closed,
 *                 registrato ma MAI transizioni).
 *
 * Eventi gestiti:
 *   - charged        → payment_status = paid (+ email conferma);
 *   - authorized     → auto-capture via POST /v2/payments/capture (il passo
 *                      che ADDEBITA davvero: l'evento "charged" successivo
 *                      conferma il pagamento);
 *   - refunded       → payment_status = refunded;
 *   - expired        → RPC pagamenti_ordine_scaduto (ripristino stock);
 *   - created/altri  → registrati ma ignorati (mai errori, mai modifiche).
 *
 * La macchina a stati NON è duplicata qui: ogni transizione passa dalle RPC
 * esistenti (aggiorna_payment_status / pagamenti_ordine_scaduto).
 */

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getConfigProviderNegozio, credenzialiGatewayDaConfig } from "./config";
import { getGatewayProvider } from "./registry";
import { inviaEmailConfermaPagamento } from "@/lib/cliente/ordine-email";
import { inviaNotificaNuovoOrdine } from "@/lib/notifiche/whatsapp";
import { notificaNuovoOrdineAdmin } from "@/lib/amministratore/notifiche";
import { chiudiOrdinePagamento } from "./sessioni";
import { gestisciPagamentoTardivo } from "./late-payment";

export type EsitoWebhook = { status: number; body: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identità dell'evento Scalapay derivata dal payload REALE (modello dati
 * ufficiale: totalAmount, status, orderToken, merchantReference):
 *   - eventId:   SHA-256 hex del body RAW — deterministico e stabile: lo
 *                stesso identico webhook ritrasmesso produce lo stesso id
 *                (idempotenza via UNIQUE su pagamenti_eventi.event_id);
 *   - paymentId: ESCLUSIVAMENTE payload.orderToken (token Scalapay, stringa
 *                non vuota);
 *   - eventType: ESCLUSIVAMENTE payload.status.
 * null = payload non conforme (fail-closed: nessuna operazione).
 */
export function identitaEventoDaPayload(
  rawBody: string,
  payload: Record<string, unknown>
): { eventId: string; eventType: string; paymentId: string } | null {
  const paymentId = typeof payload.orderToken === "string" ? payload.orderToken : "";
  if (!paymentId) return null;
  const eventType = typeof payload.status === "string" ? payload.status : "";
  const eventId = createHash("sha256").update(rawBody).digest("hex");
  return { eventId, eventType, paymentId };
}

/** Configurazioni Scalapay attive da provare per la firma. */
async function configAttive(): Promise<string[]> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("negozio_pagamenti")
    .select("negozio_id")
    .eq("provider", "scalapay")
    .eq("attivo", true);
  if (error) return [];
  return (data ?? [])
    .map((r) => String(r.negozio_id))
    .filter((id) => UUID_RE.test(id));
}

/**
 * Verifica la firma del webhook provando le configurazioni Scalapay attive.
 * La firma (HMAC con l'API key del negozio) identifica anche il negozio
 * mittente. Ritorna l'evento decodificato + il negozio, oppure null
 * (fail-closed).
 */
async function verificaFirmaMultiNegozio(
  rawBody: string,
  headers: Headers
): Promise<{
  eventId: string;
  eventType: string;
  paymentId: string;
  negozioId: string;
} | null> {
  const negozi = await configAttive();
  for (const negozioId of negozi) {
    const config = await getConfigProviderNegozio(negozioId, "scalapay");
    if (!config || !config.secretKey) continue;
    const gateway = getGatewayProvider("scalapay");
    if (!gateway) continue;
    const evento = await gateway.verificaFirma(
      rawBody,
      headers,
      credenzialiGatewayDaConfig(config)
    );
    if (evento) {
      return { ...evento, negozioId };
    }
  }
  return null;
}

/** Registra l'evento in pagamenti_eventi. false = evento già processato. */
async function registraEvento(
  e: { eventId: string; eventType: string; ordineId: string | null; negozioId: string; paymentId: string },
  payload: unknown
): Promise<boolean> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("pagamenti_eventi")
    .insert({
      provider: "scalapay",
      event_id: e.eventId,
      event_type: e.eventType,
      ordine_id: e.ordineId,
      negozio_id: e.negozioId,
      payment_id: e.paymentId || null,
      payload,
      status: "received",
    })
    .select("id")
    .single();

  if (error) {
    // Unique su event_id → duplicato: non riprocessare.
    if (error.code === "23505") return false;
    console.error("[pagamenti] registrazione evento scalapay fallita:", error.message);
    return false;
  }
  return !!data;
}

/** Segna l'evento come processato (best-effort). */
async function segnaProcessato(eventId: string, success: boolean, errMessage?: string) {
  const db = createAdminSupabaseClient();
  await db
    .from("pagamenti_eventi")
    .update({
      status: success ? "processed" : "error",
      processed_at: new Date().toISOString(),
      error: success ? null : (errMessage ?? "elaborazione fallita"),
    })
    .eq("event_id", eventId);
}

/** Marca la sessione Scalapay con lo stato finale (best-effort). */
async function marcaSessione(paymentId: string, status: string) {
  const db = createAdminSupabaseClient();
  await db
    .from("pagamenti_sessioni")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("payment_id", paymentId);
}

/**
 * Identifica l'ordine Scalapay dal payment/session reference salvato durante
 * la sessione: pagamenti_sessioni (provider='scalapay'). MAI un ordine di un
 * altro provider né di un altro negozio (hardening cross-tenant, fail-closed).
 */
async function ordineDaPaymentId(
  paymentId: string,
  negozioId: string
): Promise<{ id: string; totale: number } | null> {
  if (!paymentId) return null;
  const db = createAdminSupabaseClient();
  const { data: sess } = await db
    .from("pagamenti_sessioni")
    .select("ordine_id")
    .eq("provider", "scalapay")
    .eq("payment_id", paymentId)
    .eq("negozio_id", negozioId)
    .limit(1);
  const ordineId = sess?.[0]?.ordine_id ? String(sess[0].ordine_id) : null;
  if (ordineId) {
    const { data: ordine } = await db
      .from("ordini")
      .select("id, totale, negozio_id")
      .eq("id", ordineId)
      .single();
    if (ordine?.id && String(ordine.negozio_id ?? "") === negozioId) {
      return { id: String(ordine.id), totale: Number(ordine.totale ?? 0) };
    }
  }
  return null;
}

/**
 * Applica una transizione alla macchina a stati via RPC, con inizializzazione
 * legacy fail-safe (stesso pattern del webhook Stripe/Klarna).
 */
async function aggiornaStato(
  ordineId: string,
  nuovoStato: "paid" | "canceled" | "refunded",
  opts: { paymentId?: string | null; importo?: number | null } = {}
): Promise<{ ok: boolean; errore?: string; codice?: string }> {
  const db = createAdminSupabaseClient();
  const payload = {
    p_ordine_id: ordineId,
    p_nuovo_stato: nuovoStato,
    p_payment_id: opts.paymentId ?? null,
    p_transaction_id: opts.paymentId ?? null,
    p_importo: opts.importo ?? null,
    p_valuta: "EUR",
    p_expires_at: null,
  };
  const { data, error } = await db.rpc("aggiorna_payment_status", payload);
  if (error) return { ok: false, errore: error.message, codice: "RPC_ERROR" };
  const esito = data as { ok?: boolean; codice?: string; messaggio?: string } | null;
  if (esito?.ok === true) return { ok: true };
  if (esito?.codice === "STATO_LEGACY_DA_INIZIALIZZARE") {
    const init = await db.rpc("aggiorna_payment_status", {
      ...payload,
      p_nuovo_stato: "pending",
    });
    if (init.error || (init.data as { ok?: boolean } | null)?.ok !== true) {
      return { ok: false, errore: init.error?.message ?? "inizializzazione stato pagamento fallita", codice: "INIT_FAILED" };
    }
    const retry = await db.rpc("aggiorna_payment_status", payload);
    if (retry.error) return { ok: false, errore: retry.error.message, codice: "RPC_ERROR" };
    const retryResult = retry.data as { ok?: boolean; codice?: string; messaggio?: string } | null;
    if (retryResult?.ok !== true) return { ok: false, errore: retryResult?.messaggio ?? "transizione pagamento fallita", codice: retryResult?.codice ?? "TRANSIZIONE_NON_CONSENTITA" };
    return { ok: true };
  }
  return esito?.codice
    ? { ok: false, errore: String(esito.messaggio ?? esito.codice), codice: String(esito.codice) }
    : { ok: false, errore: "transizione non riuscita", codice: "TRANSIZIONE_NON_CONSENTITA" };
}

/** Normalizza un event_type (case + punti/trattini → underscore). */
function normalizzaEventType(eventType: string): string {
  return eventType.toUpperCase().replace(/[.\-/]/g, "_");
}

/**
 * Mappa lo status webhook Scalapay (payload.status) a una transizione.
 * Supportati ESATTAMENTE: created, authorized, charged, refunded, expired.
 * - created → null: registrato ma nessuna transizione (informazione);
 * - status sconosciuto → null: fail-closed (registrato ma MAI modifiche);
 * - authorized → "authorized": auto-capture (il chiamante cattura).
 */
function statoDaEvento(
  eventType: string
): "paid" | "authorized" | "expired" | "refunded" | null {
  const t = normalizzaEventType(eventType);
  switch (t) {
    case "CREATED":
      return null;
    case "AUTHORIZED":
    case "AUTHORISED":
      return "authorized";
    case "CHARGED":
      return "paid";
    case "REFUNDED":
      return "refunded";
    case "EXPIRED":
      return "expired";
    default:
      return null;
  }
}

/** Cattura l'autorizzazione (authorized → charged) per il negozio. */
async function autoCattura(
  negozioId: string,
  paymentId: string
): Promise<void> {
  const config = await getConfigProviderNegozio(negozioId, "scalapay");
  if (!config || !config.secretKey) {
    throw new Error("config Scalapay non disponibile per la cattura");
  }
  const gateway = getGatewayProvider("scalapay");
  if (!gateway) throw new Error("gateway Scalapay non disponibile");
  await gateway.cattura(paymentId, undefined, credenzialiGatewayDaConfig(config));
}

/**
 * Entry point del webhook Scalapay. Ritorna sempre lo stato HTTP e il body:
 * 200 = processato o duplicato (idempotente); 400 = firma mancante/invalida
 * (fail-closed, nessuna operazione DB); 500 = cattura automatica fallita
 * (consente il retry di Scalapay per l'evento "authorized").
 */
export async function gestisciWebhookScalapay(
  rawBody: string,
  headers: Headers
): Promise<EsitoWebhook> {
  if (!headers.get("x-scalapay-hmac-v1") || !headers.get("x-scalapay-timestamp")) {
    return { status: 400, body: "Firma mancante." };
  }

  const verificato = await verificaFirmaMultiNegozio(rawBody, headers);
  if (!verificato) {
    return { status: 400, body: "Firma non valida." };
  }

  const { negozioId } = verificato;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { status: 400, body: "Payload non valido." };
  }

  // Identità dell'evento derivata dal payload REALE (modello dati ufficiale),
  // NON dai campi restituiti dal gateway (informativi): event_id = SHA-256
  // del body RAW (idempotente), token = orderToken top-level, tipo = status.
  // Fail-closed: payload senza orderToken → 400, nessuna operazione DB.
  const identita = identitaEventoDaPayload(rawBody, payload);
  if (!identita) {
    return { status: 400, body: "Payload non conforme (orderToken mancante)." };
  }
  const { eventId, eventType, paymentId } = identita;

  const ordine = await ordineDaPaymentId(paymentId, negozioId);

  const inserito = await registraEvento(
    { eventId, eventType, negozioId, ordineId: ordine?.id ?? null, paymentId },
    payload
  );
  if (!inserito) {
    return { status: 200, body: "Evento già processato." };
  }

  try {
    const stato = statoDaEvento(eventType);

    // Evento non riconosciuto (created/altri) o ordine non risolvibile:
    // registrato ma ignorato (mai errori, mai modifiche).
    if (!stato) {
      await segnaProcessato(eventId, true);
      return { status: 200, body: "OK" };
    }

    // ── authorized → auto-capture (addebita davvero il cliente) ──────────
    // Scalapay: creazione → autorizzazione → cattura → "charged". Qui la
    // cattura è automatica (come la cattura automatica di Stripe Checkout).
    if (stato === "authorized") {
      if (!ordine) {
        await segnaProcessato(eventId, true);
        return { status: 200, body: "OK" };
      }
      try {
        await autoCattura(negozioId, paymentId);
        await segnaProcessato(eventId, true);
        return { status: 200, body: "OK" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "cattura fallita";
        await segnaProcessato(eventId, false, msg);
        console.error("[pagamenti] cattura automatica scalapay fallita:", msg);
        // 500 → Scalapay ritenta l'evento "authorized" (cattura retryable).
        return { status: 500, body: "Cattura rinviata." };
      }
    }

    if (!ordine) {
      await segnaProcessato(eventId, true);
      return { status: 200, body: "OK" };
    }

    const db = createAdminSupabaseClient();

    switch (stato) {
      case "paid": {
        const esito = await aggiornaStato(ordine.id, "paid", {
          paymentId,
          importo: ordine.totale,
        });
        if (!esito.ok) {
          if (esito.codice === "PAGAMENTO_SCADUTO") {
            const tardivo = await gestisciPagamentoTardivo({ ordineId: ordine.id, negozioId, provider: "scalapay", paymentId, importo: ordine.totale, eventId, payload });
            if (!tardivo.ok) throw new Error(`late payment Scalapay non gestito: ${tardivo.errore}`);
          } else {
            throw new Error(`elaborazione scalapay paid fallita: ${esito.errore}`);
          }
        } else {
          await marcaSessione(paymentId, "paid");
          await inviaEmailConfermaPagamento(ordine.id).catch(() => {});
          // WhatsApp al negoziante: SOLO dopo la conferma del pagamento
          // (evento "charged"). Idempotenza: event_id (SHA-256 del body)
          // UNIQUE in pagamenti_eventi + transizione paid→paid = no-op →
          // una sola notifica per ordine. Best-effort: un errore WhatsApp
          // non tocca ordine né webhook.
          await inviaNotificaNuovoOrdine(ordine.id).catch(() => {});
          // Notifica admin — BEST-EFFORT, SOLO a pagamento confermato.
          // Guardie idempotenti a monte (pagamenti_eventi UNIQUE + paid→paid
          // no-op): mai due notifiche per lo stesso ordine.
          await notificaNuovoOrdineAdmin(ordine.id).catch(() => {});
        }
        break;
      }

      case "expired": {
        const chiusura = await chiudiOrdinePagamento(ordine.id, "expired");
        if (!chiusura.ok) throw new Error(`elaborazione scalapay expired fallita: ${chiusura.errore}`);
        await marcaSessione(paymentId, "expired");
        break;
      }

      case "refunded": {
        const esito = await aggiornaStato(ordine.id, "refunded", { paymentId });
        if (!esito.ok) {
          throw new Error(`elaborazione scalapay refund fallita: ${esito.errore}`);
        } else {
          await marcaSessione(paymentId, "refunded");
          await db
            .from("ordini")
            .update({ payment_refunded_at: new Date().toISOString() })
            .eq("id", ordine.id);
        }
        break;
      }
    }

    await segnaProcessato(eventId, true);
    return { status: 200, body: "OK" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore sconosciuto";
    await segnaProcessato(eventId, false, msg);
    console.error("[pagamenti] webhook scalapay non elaborato:", msg);
    // Fail-closed: l'ordine NON è stato modificato. 200 per non far ritentare
    // Scalapay all'infinito su eventi non-riprocessabili; resta marcato "error".
    return { status: 200, body: "Registrato (elaborazione rinviata)." };
  }
}
