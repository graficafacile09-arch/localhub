/**
 * PAGAMENTI — WEBHOOK KLARNA (solo server).
 *
 * Riceve gli eventi Klarna per TUTTI i negozi (endpoint unico
 * /api/webhook/pagamenti/klarna): la firma viene verificata provando i
 * webhook secret delle configurazioni Klarna attive (header
 * `Klarna-Signature` = Base64(HMAC-SHA256(body, shared secret))).
 *
 * Sicurezza:
 *   - firma mancante/invalida → 400 fail-closed, NESSUNA operazione DB
 *     (nessun ordine modificato, nessun evento registrato);
 *   - l'ordine viene identificato SOLO tramite il payment/session reference
 *     salvato durante F2 (pagamenti_sessioni.payment_id / ordini.payment_id
 *     con provider='klarna'): mai dal client, mai verso ordini di altri
 *     provider (un order_id Klarna non tocca MAI un ordine Stripe);
 *   - importo dell'evento (order_amount, minor units) coerente con
 *     ordine.totale → mismatch fail-closed (nessuna modifica);
 *   - nessun fallback verso Stripe: provider resta "klarna".
 *
 * Idempotenza: ogni evento viene registrato in `pagamenti_eventi` con
 * event_id UNIQUE → un webhook duplicato non viene mai riprocessato; la
 * macchina a stati `aggiorna_payment_status` blocca anche il doppio
 * aggiornamento (paid→paid = no-op).
 *
 * Eventi gestiti (normalizzazione case/separatori):
 *   - AUTHORIZED / CAPTURED / CHECKOUT.ORDER_COMPLETED /
 *     CAPTURE_ACKNOWLEDGED ecc. → payment_status = paid (+ email conferma);
 *   - CANCELLED / CANCELED / CANCEL_ACKNOWLEDGED → payment_status = canceled;
 *   - EXPIRED → RPC pagamenti_ordine_scaduto (ripristino stock + annullato);
 *   - REFUNDED / REFUND_ACKNOWLEDGED → payment_status = refunded
 *     (+ payment_refunded_at / payment_refunded_amount);
 *   - eventi non riconosciuti → registrati ma ignorati (mai errori).
 *
 * La macchina a stati NON è duplicata qui: ogni transizione passa dalle
 * RPC esistenti (aggiorna_payment_status / pagamenti_ordine_scaduto).
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

/** Configurazioni Klarna attive da provare per la firma. */
async function configAttive(): Promise<string[]> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("negozio_pagamenti")
    .select("negozio_id")
    .eq("provider", "klarna")
    .eq("attivo", true);
  if (error) return [];
  return (data ?? [])
    .map((r) => String(r.negozio_id))
    .filter((id) => UUID_RE.test(id));
}

/**
 * Verifica la firma del webhook provando le configurazioni Klarna attive.
 * La firma (HMAC con il webhook secret del negozio) identifica anche il
 * negozio mittente. Ritorna l'evento decodificato + il negozio, oppure
 * null (fail-closed).
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
    const config = await getConfigProviderNegozio(negozioId, "klarna");
    if (!config || !config.webhookSecret) continue;
    const gateway = getGatewayProvider("klarna");
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
      provider: "klarna",
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
    console.error("[pagamenti] registrazione evento klarna fallita:", error.message);
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
 * Identifica l'ordine Klarna dal payment/session reference salvato durante
 * F2: pagamenti_sessioni (provider='klarna') oppure ordini.payment_id con
 * payment_provider='klarna'. MAI un ordine di un altro provider né di un
 * altro negozio: l'ordine deve appartenere al negozio che ha firmato
 * l'evento (hardening cross-tenant, fail-closed).
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
    .eq("provider", "klarna")
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
    .eq("payment_provider", "klarna")
    .limit(1);
  if (
    ordine2?.[0]?.id &&
    String(ordine2[0].negozio_id ?? "") === negozioId
  ) {
    return { id: String(ordine2[0].id), totale: Number(ordine2[0].totale ?? 0) };
  }
  return null;
}

/**
 * Applica una transizione alla macchina a stati via RPC, con inizializzazione
 * legacy fail-safe (stesso pattern del webhook Stripe). Ritorna l'esito.
 */
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
    // Ordine senza payment_status: inizializza a pending e riprova.
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

/** Marca la sessione Klarna con lo stato finale (best-effort). */
async function marcaSessione(paymentId: string, status: string) {
  const db = createAdminSupabaseClient();
  await db
    .from("pagamenti_sessioni")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("payment_id", paymentId);
}

/** Normalizza un event_type (case + punti/trattini → underscore). */
function normalizzaEventType(eventType: string): string {
  return eventType.toUpperCase().replace(/[.\-]/g, "_");
}

/**
 * Mappa un event_type Klarna allo stato di pagamento da applicare.
 * null = evento non riconosciuto (registrato ma ignorato).
 */
function statoDaEvento(eventType: string): "paid" | "canceled" | "expired" | "refunded" | null {
  const t = normalizzaEventType(eventType);
  if (t.includes("REFUND")) return "refunded";
  if (t.includes("CANCEL")) return "canceled";
  if (t.includes("EXPIR")) return "expired";
  if (
    t.includes("AUTHORIZ") ||
    t.includes("CAPTURE") ||
    t.includes("COMPLETED") ||
    t.includes("ACCEPTED")
  ) {
    return "paid";
  }
  return null;
}

/**
 * Entry point del webhook Klarna. Ritorna sempre lo stato HTTP e il body:
 * 200 = processato o duplicato (idempotente); 400 = firma mancante/invalida
 * (fail-closed, nessuna operazione DB).
 */
export async function gestisciWebhookKlarna(
  rawBody: string,
  headers: Headers
): Promise<EsitoWebhook> {
  const signature = headers.get("klarna-signature");
  if (!signature) {
    return { status: 400, body: "Firma mancante." };
  }

  const verificato = await verificaFirmaMultiNegozio(rawBody, headers);
  if (!verificato) {
    return { status: 400, body: "Firma non valida." };
  }

  const { eventId, eventType, paymentId, negozioId } = verificato;

  // ── Payload: parse UNA volta (la validità JSON è già garantita dalla
  //    verifica firma) e riusato per idempotenza, importo e dispatch.
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { status: 400, body: "Payload non valido." };
  }

  // ── Identificazione ordine (SOLO reference Klarna salvate in F2, dello
  //    stesso negozio firmatario) ─────────────────────────────────────────
  const ordine = await ordineDaPaymentId(paymentId, negozioId);

  // ── Idempotenza: duplicato → 200 senza riprocessare ────────────────────
  const confronto = {
    eventId,
    eventType,
    negozioId,
    ordineId: ordine?.id ?? null,
    paymentId,
  };
  const inserito = await registraEvento(confronto, payload);
  if (!inserito) {
    return { status: 200, body: "Evento già processato." };
  }

  try {
    const stato = statoDaEvento(eventType);

    // ── Importo: coerenza con ordine.totale (fail-closed) ────────────────
    // L'ordine può essere assente (es. order_id di un altro provider o
    // sessione non trovata): in tal caso l'evento viene solo registrato,
    // MAI applicato a ordini sconosciuti.
    if (ordine) {
      if (typeof payload.order_amount === "number") {
        const atteso = Math.round(ordine.totale * 100);
        if (Math.abs(payload.order_amount - atteso) > 0) {
          throw new Error(
            `importo incoerente: evento=${payload.order_amount}, ordine=${atteso}`
          );
        }
      }
    }

    if (!ordine || !stato) {
      // Evento non riconosciuto / ordine non risolvibile: registrato ma
      // ignorato (mai errori per eventi sconosciuti, mai modifiche).
      await segnaProcessato(eventId, true);
      return { status: 200, body: "OK" };
    }

    const db = createAdminSupabaseClient();

    switch (stato) {
      case "paid": {
        const captureId =
          typeof payload.capture_id === "string" && payload.capture_id
            ? String(payload.capture_id)
            : null;
        const esito = await aggiornaStato(ordine.id, "paid", {
          paymentId,
          transactionId: captureId,
          importo: ordine.totale,
        });
        if (!esito.ok) {
          console.error("[pagamenti] elaborazione klarna paid fallita:", esito.errore);
        } else {
          await marcaSessione(paymentId, "paid");
          // Email di conferma: per gli ordini con pagamento online la
          // conferma parte QUI (alla creazione era stata rimandata).
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
          console.error("[pagamenti] elaborazione klarna cancel fallita:", esito.errore);
        } else {
          await marcaSessione(paymentId, "canceled");
        }
        break;
      }

      case "expired": {
        // Marca la sessione scaduta e delega alla RPC il ripristino stock
        // (con guardia anti-retry: se esiste una sessione attiva più
        // recente l'ordine NON viene annullato).
        await marcaSessione(paymentId, "expired");
        const { error: scadErr } = await db.rpc("pagamenti_ordine_scaduto", {
          p_ordine_id: ordine.id,
        });
        if (scadErr) {
          console.error("[pagamenti] elaborazione klarna expired fallita:", scadErr.message);
        }
        break;
      }

      case "refunded": {
        const refundId =
          typeof payload.refund_id === "string" && payload.refund_id
            ? String(payload.refund_id)
            : null;
        const importoRimborsato =
          typeof payload.refunded_amount === "number"
            ? Number(payload.refunded_amount) / 100
            : null;
        const esito = await aggiornaStato(ordine.id, "refunded", {
          paymentId,
          transactionId: refundId,
          importo: null,
        });
        if (!esito.ok) {
          console.error("[pagamenti] elaborazione klarna refund fallita:", esito.errore);
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
    console.error("[pagamenti] webhook klarna non elaborato:", msg);
    // Fail-closed: l'ordine NON è stato modificato. 200 per non far
    // ritentare Klarna all'infinito; l'evento resta marcato "error".
    return { status: 200, body: "Registrato (elaborazione rinviata)." };
  }
}
