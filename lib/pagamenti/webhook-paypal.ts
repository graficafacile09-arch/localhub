/**
 * PAGAMENTI — WEBHOOK PAYPAL (solo server).
 *
 * Riceve gli eventi PayPal per TUTTI i negozi (endpoint unico
 * /api/webhook/pagamenti/paypal): la firma viene verificata provando le
 * configurazioni PayPal attive (webhook id = cred.webhookSecret) tramite
 * POST /v1/notifications/verify-webhook-signature.
 *
 * Sicurezza:
 *   - firma mancante/invalida → 400 fail-closed, NESSUNA operazione DB;
 *   - l'ordine viene identificato SOLO tramite il payment/session reference
 *     salvato durante la sessione (pagamenti_sessioni.payment_id con
 *     provider='paypal' oppure ordini.payment_id con payment_provider='paypal'):
 *     mai dal client, mai verso ordini di altri provider;
 *   - importo dell'evento (resource.amount.value, decimale EUR) coerente con
 *     ordine.totale → mismatch fail-closed (nessuna modifica);
 *   - nessun fallback verso Stripe/Klarna: provider resta "paypal".
 *
 * Idempotenza: ogni evento è registrato in pagamenti_eventi con event_id
 * UNIQUE; la macchina a stati aggiorna_payment_status blocca il doppio
 * aggiornamento (paid→paid = no-op).
 *
 * Eventi gestiti (normalizzazione case):
 *   - PAYMENT.CAPTURE.COMPLETED → payment_status = paid (+ email conferma);
 *   - PAYMENT.CAPTURE.REFUNDED / PARTIALLY_REFUNDED / REVERSED → refunded;
 *   - PAYMENT.CAPTURE.DENIED / FAILED / VOIDED / ORDER.CANCELLED → canceled;
 *   - eventi non riconosciuti → registrati ma ignorati (mai errori).
 *
 * La macchina a stati NON è duplicata qui: ogni transizione passa dalle RPC
 * esistenti (aggiorna_payment_status / pagamenti_ordine_scaduto).
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getConfigProviderNegozio, credenzialiGatewayDaConfig } from "./config";
import { getGatewayProvider } from "./registry";
import { inviaEmailConfermaPagamento } from "@/lib/cliente/ordine-email";
import { inviaNotificaNuovoOrdine } from "@/lib/notifiche/whatsapp";
import { notificaNuovoOrdineAdmin } from "@/lib/amministratore/notifiche";

export type EsitoWebhook = { status: number; body: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Configurazioni PayPal attive da provare per la firma. */
async function configAttive(): Promise<string[]> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("negozio_pagamenti")
    .select("negozio_id")
    .eq("provider", "paypal")
    .eq("attivo", true);
  if (error) return [];
  return (data ?? [])
    .map((r) => String(r.negozio_id))
    .filter((id) => UUID_RE.test(id));
}

/**
 * Verifica la firma del webhook provando le configurazioni PayPal attive.
 * La verifica (verify-webhook-signature con il webhook id del negozio)
 * identifica anche il negozio mittente. Ritorna l'evento decodificato + il
 * negozio, oppure null (fail-closed).
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
    const config = await getConfigProviderNegozio(negozioId, "paypal");
    if (!config || !config.webhookSecret) continue;
    const gateway = getGatewayProvider("paypal");
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
      provider: "paypal",
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
    if (error.code === "23505") return false;
    console.error("[pagamenti] registrazione evento paypal fallita:", error.message);
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

/**
 * Identifica l'ordine PayPal dal payment/session reference salvato durante
 * la sessione: pagamenti_sessioni (provider='paypal') oppure ordini.payment_id
 * con payment_provider='paypal'. MAI un ordine di un altro provider né di un
 * altro negozio (hardening cross-tenant, fail-closed).
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
    .eq("provider", "paypal")
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
  const { data: ordine2 } = await db
    .from("ordini")
    .select("id, totale, negozio_id")
    .eq("payment_id", paymentId)
    .eq("payment_provider", "paypal")
    .limit(1);
  if (ordine2?.[0]?.id && String(ordine2[0].negozio_id ?? "") === negozioId) {
    return { id: String(ordine2[0].id), totale: Number(ordine2[0].totale ?? 0) };
  }
  return null;
}

/** Applica una transizione alla macchina a stati via RPC (pattern Klarna). */
async function aggiornaStato(
  ordineId: string,
  nuovoStato: "paid" | "canceled" | "refunded",
  opts: {
    paymentId?: string | null;
    transactionId?: string | null;
    importo?: number | null;
  } = {}
): Promise<{ ok: boolean; errore?: string }> {
  const db = createAdminSupabaseClient();
  const payload = {
    p_ordine_id: ordineId,
    p_nuovo_stato: nuovoStato,
    p_payment_id: opts.paymentId ?? null,
    p_transaction_id: opts.transactionId ?? null,
    p_importo: opts.importo ?? null,
    p_valuta: "EUR",
    p_expires_at: null,
  };
  const { data, error } = await db.rpc("aggiorna_payment_status", payload);
  if (error) return { ok: false, errore: error.message };
  const esito = data as { ok?: boolean; codice?: string } | null;
  if (esito?.ok === true) return { ok: true };
  if (esito?.codice === "STATO_LEGACY_DA_INIZIALIZZARE") {
    const init = await db.rpc("aggiorna_payment_status", {
      ...payload,
      p_nuovo_stato: "pending",
    });
    if (init.error || (init.data as { ok?: boolean } | null)?.ok !== true) {
      return { ok: false, errore: "inizializzazione stato pagamento fallita" };
    }
    const retry = await db.rpc("aggiorna_payment_status", payload);
    if (retry.error) return { ok: false, errore: retry.error.message };
    return { ok: true };
  }
  return esito?.codice
    ? { ok: false, errore: String(esito.codice) }
    : { ok: false, errore: "transizione non riuscita" };
}

/** Marca la sessione PayPal con lo stato finale (best-effort). */
async function marcaSessione(paymentId: string, status: string) {
  const db = createAdminSupabaseClient();
  await db
    .from("pagamenti_sessioni")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("payment_id", paymentId);
}

/**
 * Mappa un event_type PayPal allo stato di pagamento da applicare.
 * null = evento non riconosciuto (registrato ma ignorato).
 */
function statoDaEvento(
  eventType: string
): "paid" | "canceled" | "refunded" | null {
  const t = eventType.toUpperCase();
  if (t.includes("REFUND") || t.includes("REVERSED")) return "refunded";
  if (
    t.includes("DENIED") ||
    t.includes("FAILED") ||
    t.includes("VOID") ||
    t.includes("CANCEL")
  ) {
    return "canceled";
  }
  if (t === "PAYMENT.CAPTURE.COMPLETED") return "paid";
  // CHECKOUT.ORDER.APPROVED / PAYMENT.CAPTURE.PENDING → registrati e ignorati.
  return null;
}

/**
 * Entry point del webhook PayPal. Ritorna sempre lo stato HTTP e il body:
 * 200 = processato o duplicato (idempotente); 400 = firma mancante/invalida
 * (fail-closed, nessuna operazione DB).
 */
export async function gestisciWebhookPaypal(
  rawBody: string,
  headers: Headers
): Promise<EsitoWebhook> {
  if (!headers.get("paypal-transmission-id") || !headers.get("paypal-transmission-sig")) {
    return { status: 400, body: "Firma mancante." };
  }

  const verificato = await verificaFirmaMultiNegozio(rawBody, headers);
  if (!verificato) {
    return { status: 400, body: "Firma non valida." };
  }

  const { eventId, eventType, paymentId, negozioId } = verificato;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { status: 400, body: "Payload non valido." };
  }

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

    // ── Importo: coerenza con ordine.totale (fail-closed) ────────────────
    if (ordine) {
      const resource = (payload.resource ?? {}) as {
        amount?: { value?: unknown };
      };
      const valueRaw = resource.amount?.value;
      if (typeof valueRaw === "string" || typeof valueRaw === "number") {
        const importoEvento = Number(valueRaw);
        if (Number.isFinite(importoEvento)) {
          const atteso = Math.round(ordine.totale * 100) / 100;
          if (Math.abs(importoEvento - atteso) > 0.011) {
            throw new Error(
              `importo incoerente: evento=${importoEvento}, ordine=${atteso}`
            );
          }
        }
      }
    }

    if (!ordine || !stato) {
      await segnaProcessato(eventId, true);
      return { status: 200, body: "OK" };
    }

    const db = createAdminSupabaseClient();

    switch (stato) {
      case "paid": {
        const resource = (payload.resource ?? {}) as {
          id?: unknown;
        };
        const transactionId =
          typeof resource.id === "string" && resource.id ? resource.id : null;
        const esito = await aggiornaStato(ordine.id, "paid", {
          paymentId,
          transactionId,
          importo: ordine.totale,
        });
        if (!esito.ok) {
          console.error("[pagamenti] elaborazione paypal paid fallita:", esito.errore);
        } else {
          await marcaSessione(paymentId, "paid");
          await inviaEmailConfermaPagamento(ordine.id).catch(() => {});
          // WhatsApp al negoziante: SOLO dopo la conferma del pagamento.
          // Idempotenza: event_id UNIQUE in pagamenti_eventi + transizione
          // paid→paid = no-op → una sola notifica per ordine. Best-effort:
          // un errore WhatsApp non tocca ordine né webhook.
          await inviaNotificaNuovoOrdine(ordine.id).catch(() => {});
          // Notifica admin — BEST-EFFORT, SOLO a pagamento confermato.
          // Guardie idempotenti a monte (pagamenti_eventi UNIQUE + paid→paid
          // no-op): mai due notifiche per lo stesso ordine.
          await notificaNuovoOrdineAdmin(ordine.id).catch(() => {});
        }
        break;
      }

      case "canceled": {
        const esito = await aggiornaStato(ordine.id, "canceled", {
          paymentId,
          transactionId: null,
          importo: null,
        });
        if (!esito.ok) {
          console.error("[pagamenti] elaborazione paypal cancel fallita:", esito.errore);
        } else {
          await marcaSessione(paymentId, "canceled");
        }
        break;
      }

      case "refunded": {
        const resource = (payload.resource ?? {}) as {
          id?: unknown;
          amount?: { value?: unknown };
        };
        const refundId =
          typeof resource.id === "string" && resource.id ? resource.id : null;
        const importoRimborsato =
          typeof resource.amount?.value === "string" || typeof resource.amount?.value === "number"
            ? Number(resource.amount.value)
            : null;
        const esito = await aggiornaStato(ordine.id, "refunded", {
          paymentId,
          transactionId: refundId,
          importo: null,
        });
        if (!esito.ok) {
          console.error("[pagamenti] elaborazione paypal refund fallita:", esito.errore);
        } else {
          await marcaSessione(paymentId, "refunded");
          await db
            .from("ordini")
            .update({
              payment_refunded_at: new Date().toISOString(),
              ...(importoRimborsato !== null
                ? { payment_refunded_amount: importoRimborsato }
                : {}),
            })
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
    console.error("[pagamenti] webhook paypal non elaborato:", msg);
    return { status: 200, body: "Registrato (elaborazione rinviata)." };
  }
}
