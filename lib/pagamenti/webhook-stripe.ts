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
 * Eventi gestiti (endpoint UNICO della piattaforma, un solo
 * STRIPE_WEBHOOK_SECRET):
 *   - checkout.session.completed  → payment_status = paid + email conferma
 *   - checkout.session.expired    → RPC pagamenti_ordine_scaduto (riserva
 *                                   stock con scadenza, ordine annullato)
 *   - charge.refunded             → refunded | partially_refunded
 *   - payment_intent.payment_failed → sessione failed (ordine resta pending)
 *   - charge.dispute.created/closed → marcatore payment_disputed_at
 *   - payout.paid/failed/updated  → tracking payout interno (V1)
 *   - account.updated             → stato onboarding del connected account
 *                                   (Soluzione A: integrato qui, NON su un
 *                                   secondo endpoint — un solo whsec)
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getConfigStripeNegozio, getNegozioIdByStripeAccount } from "./config";
import { verificaEventoStripe } from "./stripe";
import {
  getStripePlatformWebhookSecret,
  statoOnboardingDaAccount,
} from "./stripe-connect";
import type Stripe from "stripe";
import { inviaEmailConfermaPagamento } from "@/lib/cliente/ordine-email";

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

/**
 * Percorso Stripe CONNECT: verifica con il webhook signing secret DELLA
 * PIATTAFORMA (STRIPE_WEBHOOK_SECRET) e risolve il negozio dall'account
 * collegato (`event.account` → negozio_pagamenti.account_id).
 * null = nessun percorso Connect (secret piattaforma assente, firma invalida
 * o account non riconosciuto) → si ripiega sul percorso legacy multi-negozio.
 */
async function verificaFirmaConnect(
  rawBody: string,
  signature: string
): Promise<{ evento: Awaited<ReturnType<typeof verificaEventoStripe>>; negozioId: string } | null> {
  const platformSecret = getStripePlatformWebhookSecret();
  if (!platformSecret) return null;
  const evento = verificaEventoStripe(rawBody, signature, platformSecret);
  if (!evento) return null;
  const account = (evento as { account?: string | null }).account;
  if (typeof account !== "string" || !account) return null;
  const negozioId = await getNegozioIdByStripeAccount(account);
  if (!negozioId) return null;
  return { evento, negozioId };
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

  // 1) Stripe Connect (firma piattaforma + account collegato);
  // 2) fallback legacy direct (firma per-negozio).
  let verificato = await verificaFirmaConnect(rawBody, signature);
  if (!verificato?.evento) {
    verificato = await verificaFirmaMultiNegozio(rawBody, signature);
  }
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
          // Email di CONFERMA PAGAMENTO al cliente: inviata SOLO qui, dopo che
          // marcaPagato ha registrato payment_status=paid. L'idempotenza è a
          // monte: registraEvento (pagamenti_eventi UNIQUE event_id) fa
          // processare questo evento una sola volta → conferma pagamento
          // inviata una sola volta anche in caso di retry Stripe. Un errore
          // email NON fa fallire il webhook (best-effort + .catch).
          await inviaEmailConfermaPagamento(ordineId).catch(() => {});
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

      // ── Tentativo di pagamento fallito (NON terminale per l'ordine) ────
      // Stripe invia payment_intent.payment_failed quando un tentativo
      // fallisce DENTRO una Checkout Session ancora aperta: il cliente può
      // riprovare, quindi l'ordine resta pending (failed è uno stato
      // terminale nella macchina a stati e bloccherebbe il retry). Si marca
      // solo la sessione come "failed" (stato informativo, testo libero in
      // pagamenti_sessioni); l'esito finale arriva da
      // checkout.session.completed oppure checkout.session.expired. La
      // riconciliazione con l'ordine usa il metadata ordine_id del
      // PaymentIntent (impostato in lib/pagamenti/stripe.ts).
      case "payment_intent.payment_failed": {
        const pi = obj as { metadata?: Record<string, string> | null };
        const ordineId =
          typeof pi.metadata?.ordine_id === "string" &&
          UUID_RE.test(pi.metadata.ordine_id)
            ? pi.metadata.ordine_id
            : null;
        if (!ordineId) {
          throw new Error("payment_intent.payment_failed senza ordine_id (metadata mancante)");
        }
        const { data: sess } = await db
          .from("pagamenti_sessioni")
          .select("id")
          .eq("ordine_id", ordineId)
          .eq("provider", "stripe")
          .in("status", ["created", "pending"])
          .order("created_at", { ascending: false })
          .limit(1);
        if (sess?.[0]) {
          await db
            .from("pagamenti_sessioni")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", String(sess[0].id));
        }
        break;
      }

      // ── Dispute: storno IN SOSPESO, MAI un rimborso automatico ──────────
      // Stripe apre una disputa quando il titolare contesta l'addebito. NON
      // si inventa un rimborso né una transizione di stato (la macchina a
      // stati non ha 'disputed'): l'evento viene registrato (già idempotente
      // in pagamenti_eventi) e l'ordine viene marcato con payment_disputed_at.
      // L'esito economico reale arriva da charge.refunded (disputa persa =
      // Stripe rimborsa) oppure da charge.dispute.closed (marcatore liberato).
      case "charge.dispute.created": {
        const dispute = obj as { payment_intent?: string | { id?: string } | null };
        const transactionId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id ?? null;
        if (!transactionId) {
          throw new Error("charge.dispute.created senza payment_intent");
        }
        const { data: ordini } = await db
          .from("ordini")
          .select("id")
          .or(`payment_transaction_id.eq.${transactionId},payment_id.eq.${transactionId}`)
          .limit(1);
        const ordine = ordini?.[0];
        if (!ordine) {
          throw new Error("charge.dispute.created: ordine non trovato");
        }
        await db
          .from("ordini")
          .update({ payment_disputed_at: new Date().toISOString() })
          .eq("id", String(ordine.id));
        break;
      }

      case "charge.dispute.closed": {
        const dispute = obj as { payment_intent?: string | { id?: string } | null };
        const transactionId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id ?? null;
        if (!transactionId) {
          throw new Error("charge.dispute.closed senza payment_intent");
        }
        const { data: ordini } = await db
          .from("ordini")
          .select("id")
          .or(`payment_transaction_id.eq.${transactionId},payment_id.eq.${transactionId}`)
          .limit(1);
        const ordine = ordini?.[0];
        if (!ordine) {
          throw new Error("charge.dispute.closed: ordine non trovato");
        }
        await db
          .from("ordini")
          .update({ payment_disputed_at: null })
          .eq("id", String(ordine.id));
        break;
      }

      // ── Account Connect aggiornato (Soluzione A): onboarding/abilitazioni ─
      // Stripe notifica ogni modifica a un connected account (KYC, IBAN,
      // restrizioni). Percorso identico agli eventi pagamento Connect: la
      // firma è quella della PIATTAFORMA (STRIPE_WEBHOOK_SECRET, unico) e il
      // negozio è risolto da event.account → negozio_pagamenti.account_id
      // (verificaFirmaConnect). Lo stato viene salvato con la STESSA RPC del
      // webhook Connect (pagamenti_stripe_connect_stato_salva: UPDATE per
      // account_id, idempotente per natura; l'idempotenza evento è garantita
      // da pagamenti_eventi.event_id UNIQUE). Nessun secret nei log.
      case "account.updated": {
        const accountObj = obj as Stripe.Account | undefined;
        if (!accountObj?.id) {
          throw new Error("account.updated senza account id");
        }
        const stato = statoOnboardingDaAccount(accountObj);
        const { error: accErr } = await db.rpc("pagamenti_stripe_connect_stato_salva", {
          p_account_id: accountObj.id,
          p_onboarding_status: stato.status,
          p_payouts_enabled: stato.payoutsEnabled,
          p_charges_enabled: stato.chargesEnabled,
        });
        if (accErr) {
          console.error(
            `[pagamenti] aggiornamento account ${accountObj.id} fallito: ${accErr.message}`
          );
        }
        break;
      }

      // ── Payout (tracking interno V1, SOLO percorsi Connect) ──────────────
      // Gestione READ/TRACKING di payout.paid/failed/updated dei connected
      // account: identifica il payout INTERNO tramite stripe_payout_id (per
      // il negozio risolto da event.account) e aggiorna ESCLUSIVAMENTE
      // tracking/stato/errore via RPC payout_segna_erogato. Non crea
      // denaro, transfer o payout. FAIL-CLOSED: se la firma non è verificata
      // (env Connect assente) o l'account è sconosciuto, l'evento non viene
      // processato. Idempotenza: event_id UNIQUE in pagamenti_eventi.
      case "payout.paid":
      case "payout.failed":
      case "payout.updated": {
        const payoutObj = obj as {
          id?: string;
          status?: string;
          failure_message?: string | null;
        };
        const stripePayoutId = typeof payoutObj.id === "string" ? payoutObj.id : null;
        if (!stripePayoutId) {
          throw new Error(`${evento.type} senza payout id`);
        }
        const { data: payoutInterno } = await db
          .from("payout")
          .select("id, stato, negozio_id")
          .eq("negozio_id", negozioId)
          .eq("stripe_payout_id", stripePayoutId)
          .maybeSingle();
        if (!payoutInterno) {
          // Account/negozio sconosciuto o payout non ancora associato:
          // fail-closed, nessuna scrittura.
          console.warn(
            `[pagamenti] payout ${stripePayoutId} non trovato per negozio ${negozioId} — ignorato.`
          );
          break;
        }
        const statoStripe = String(payoutObj.status ?? "");
        const errore =
          typeof payoutObj.failure_message === "string" && payoutObj.failure_message
            ? payoutObj.failure_message.slice(0, 500)
            : null;
        // Mapping stato Stripe → stato interno (V1).
        let nuovoStato: "in_erogazione" | "pagato" | "fallito";
        if (statoStripe === "paid") nuovoStato = "pagato";
        else if (statoStripe === "failed") nuovoStato = "fallito";
        else nuovoStato = "in_erogazione";

        const { error: payoutErr } = await db.rpc("payout_segna_erogato", {
          p_payout_id: String(payoutInterno.id),
          p_nuovo_stato: nuovoStato,
          p_stripe_payout_id: stripePayoutId,
          p_stripe_payout_status: statoStripe || null,
          p_errore: errore,
        });
        if (payoutErr) {
          console.error(
            `[pagamenti] aggiornamento payout ${stripePayoutId} fallito: ${payoutErr.message}`
          );
        }
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
