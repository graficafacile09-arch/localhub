/**
 * PAGAMENTI — WEBHOOK STRIPE (FASE F1, solo server).
 *
 * Riceve gli eventi di Stripe Checkout per TUTTI i negozi (endpoint unico
 * /api/webhook/pagamenti/stripe): la firma viene verificata provando i
 * signing secret delle configurazioni Stripe attive (la firma identifica
 * anche l'account del negozio mittente).
 *
 * Idempotenza: ogni evento viene registrato in `pagamenti_eventi` con
 * event_id UNIQUE → un webhook duplicato non viene mai riprocessato.
 * Il doppio pagamento/doppia cattura è inoltre bloccato dalla macchina a
 * stati `aggiorna_payment_status` (paid→paid = no-op).
 *
 * Eventi gestiti:
 *   - checkout.session.completed  → payment_status = paid + email conferma
 *   - checkout.session.expired    → RPC pagamenti_ordine_scaduto (riserva
 *                                   stock con scadenza, ordine annullato)
 *   - charge.refunded             → refunded | partially_refunded
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getConfigStripeNegozio } from "./config";
import { verificaEventoStripe } from "./stripe";
import { inviaEmailConfermaOrdine } from "@/lib/cliente/ordine-email";

export type EsitoWebhook = { status: number; body: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EventoConfronto = {
  eventId: string;
  eventType: string;
  negozioId: string;
  ordineId: string | null;
  paymentId: string;
};

/** Configurazioni Stripe attive da provare per la firma. */
async function configAttive(): Promise<string[]> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("negozio_pagamenti")
    .select("negozio_id")
    .eq("provider", "stripe")
    .eq("attivo", true);
  if (error) return [];
  return (data ?? [])
    .map((r) => String(r.negozio_id))
    .filter((id) => UUID_RE.test(id));
}

/**
 * Verifica la firma del webhook provando le configurazioni attive.
 * Ritorna l'evento decodificato + la config che ha verificato.
 */
async function verificaFirmaMultiNegozio(
  rawBody: string,
  signature: string
): Promise<{ evento: Awaited<ReturnType<typeof verificaEventoStripe>>; negozioId: string } | null> {
  const negozi = await configAttive();
  for (const negozioId of negozi) {
    const config = await getConfigStripeNegozio(negozioId);
    if (!config || !config.webhookSecret) continue;
    const evento = verificaEventoStripe(rawBody, signature, config.webhookSecret);
    if (evento) return { evento, negozioId };
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
      provider: "stripe",
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
    console.error("[pagamenti] registrazione evento fallita:", error.message);
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

/** Porta l'ordine a paid (con inizializzazione legacy fail-safe). */
async function marcaPagato(
  ordineId: string,
  paymentId: string,
  transactionId: string | null,
  importo: number,
  valuta: string
): Promise<{ ok: boolean; errore?: string }> {
  const db = createAdminSupabaseClient();
  const payload = {
    p_ordine_id: ordineId,
    p_nuovo_stato: "paid",
    p_payment_id: paymentId,
    p_transaction_id: transactionId,
    p_importo: importo,
    p_valuta: valuta,
    p_expires_at: null,
  };
  const { data, error } = await db.rpc("aggiorna_payment_status", payload);
  if (error) {
    return { ok: false, errore: error.message };
  }
  const esito = data as { ok?: boolean; codice?: string } | null;
  if (esito?.ok === true) {
    // Sessione → paid
    await db
      .from("pagamenti_sessioni")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("payment_id", paymentId);
    return { ok: true };
  }
  if (esito?.codice === "STATO_LEGACY_DA_INIZIALIZZARE") {
    // Ordine legacy senza payment_status: inizializza a pending e riprova.
    const init = await db.rpc("aggiorna_payment_status", {
      ...payload,
      p_nuovo_stato: "pending",
    });
    if (init.error || (init.data as { ok?: boolean } | null)?.ok !== true) {
      return { ok: false, errore: "inizializzazione stato pagamento fallita" };
    }
    const retry = await db.rpc("aggiorna_payment_status", payload);
    if (retry.error) return { ok: false, errore: retry.error.message };
    await db
      .from("pagamenti_sessioni")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("payment_id", paymentId);
    return { ok: true };
  }
  // paid→paid = no-op idempotente; altre transizioni → errore.
  return esito?.codice
    ? { ok: false, errore: String(esito.codice) }
    : { ok: false, errore: "transizione non riuscita" };
}

/** Estrae ordineId dall'oggetto sessione (client_reference_id / metadata). */
function ordineIdDaSessione(obj: {
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
}): string | null {
  const ref = obj.client_reference_id ?? obj.metadata?.ordine_id;
  if (typeof ref === "string" && UUID_RE.test(ref)) return ref;
  return null;
}

/**
 * Entry point del webhook. Ritorna sempre lo stato HTTP e il body da
 * restituire a Stripe (200 = processato o duplicato; 400 = firma invalida).
 */
export async function gestisciWebhookStripe(
  rawBody: string,
  headers: Headers
): Promise<EsitoWebhook> {
  const signature = headers.get("stripe-signature");
  if (!signature) {
    return { status: 400, body: "Firma mancante." };
  }

  const verificato = await verificaFirmaMultiNegozio(rawBody, signature);
  if (!verificato?.evento) {
    return { status: 400, body: "Firma non valida." };
  }

  const { evento, negozioId } = verificato;
  const db = createAdminSupabaseClient();

  // ── Identità dell'evento ────────────────────────────────────────────────
  const obj = (evento.data?.object as unknown) as
    | (Record<string, unknown> & {
        client_reference_id?: string | null;
        metadata?: Record<string, string> | null;
      })
    | undefined;

  let ordineId: string | null = null;
  if (evento.type.startsWith("checkout.session.")) {
    ordineId = ordineIdDaSessione(obj ?? {});
  }

  const paymentId =
    typeof obj?.id === "string" ? obj.id : "";
  const confronto: EventoConfronto = {
    eventId: evento.id,
    eventType: evento.type,
    negozioId,
    ordineId,
    paymentId,
  };

  // ── Idempotenza: duplicato → 200 senza riprocessare ────────────────────
  const inserito = await registraEvento(confronto, (evento as unknown as { raw?: unknown }).raw ?? evento);
  if (!inserito) {
    return { status: 200, body: "Evento già processato." };
  }

  try {
    switch (evento.type) {
      case "checkout.session.completed": {
        if (!ordineId) {
          throw new Error("checkout.session.completed senza ordine_id");
        }
        const session = obj as {
          payment_status?: string;
          amount_total?: number;
          currency?: string;
          payment_intent?: string | { id?: string } | null;
        };
        const transactionId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
        const importo = Number(session.amount_total ?? 0) / 100;
        const esito = await marcaPagato(
          ordineId,
          paymentId,
          transactionId,
          importo,
          String(session.currency ?? "EUR")
        );
        if (!esito.ok) {
          console.error("[pagamenti] elaborazione completed fallita:", esito.errore);
        } else {
          // Email di conferma pagamento: per gli ordini carta la conferma
          // viene inviata QUI (alla creazione era stata rimandata).
          await inviaEmailConfermaOrdine(ordineId).catch(() => {});
        }
        break;
      }

      case "checkout.session.expired": {
        if (!ordineId) {
          throw new Error("checkout.session.expired senza ordine_id");
        }
        // Marca la sessione scaduta e delega alla RPC il ripristino stock
        // (con guardia anti-retry: se esiste una sessione attiva più recente
        // l'ordine NON viene annullato).
        await db
          .from("pagamenti_sessioni")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("payment_id", paymentId);
        const { error: scadErr } = await db.rpc("pagamenti_ordine_scaduto", {
          p_ordine_id: ordineId,
        });
        if (scadErr) {
          console.error("[pagamenti] elaborazione scadenza fallita:", scadErr.message);
        }
        break;
      }

      case "charge.refunded": {
        const charge = obj as {
          payment_intent?: string | { id?: string } | null;
          amount_refunded?: number;
          amount_captured?: number;
        };
        const transactionId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null;
        if (!transactionId) {
          throw new Error("charge.refunded senza payment_intent");
        }
        const { data: ordini } = await db
          .from("ordini")
          .select("id")
          .or(`payment_transaction_id.eq.${transactionId},payment_id.eq.${transactionId}`)
          .limit(1);
        const ordineRimborso = ordini?.[0];
        if (!ordineRimborso) {
          throw new Error("charge.refunded: ordine non trovato");
        }
        const importoRimborsato = Number(charge.amount_refunded ?? 0) / 100;
        const importoCatturato = Number(charge.amount_captured ?? 0) / 100;
        const totale = importoCatturato > 0 ? importoCatturato : importoRimborsato;
        const stato = importoRimborsato >= totale ? "refunded" : "partially_refunded";

        const { error: refundErr } = await db.rpc("aggiorna_payment_status", {
          p_ordine_id: String(ordineRimborso.id),
          p_nuovo_stato: stato,
          p_payment_id: null,
          p_transaction_id: transactionId,
          p_importo: null,
          p_valuta: null,
          p_expires_at: null,
        });
        if (refundErr) {
          console.error("[pagamenti] aggiornamento rimborso fallito:", refundErr.message);
        }
        await db
          .from("ordini")
          .update({
            payment_refunded_at: new Date().toISOString(),
            payment_refunded_amount: importoRimborsato,
          })
          .eq("id", String(ordineRimborso.id));
        break;
      }

      default:
        // Eventi non gestiti (es. payment_intent.*): registrati ma ignorati.
        break;
    }

    await segnaProcessato(evento.id, true);
    return { status: 200, body: "OK" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore sconosciuto";
    await segnaProcessato(evento.id, false, msg);
    console.error("[pagamenti] webhook non elaborato:", msg);
    return { status: 200, body: "Registrato (elaborazione rinviata)." };
  }
}
