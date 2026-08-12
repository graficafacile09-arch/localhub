/**
 * PAGAMENTI — SERVIZIO SESSIONI (FASE F1, solo server).
 *
 * Orchestrazione delle sessioni Stripe per ordine:
 *   - creaSessioneStripePerOrdine: crea una Checkout Session usando SOLO il
 *     totale calcolato dal DB, la collega a pagamenti_sessioni (idempotenza:
 *     una sola sessione attiva per ordine via indice parziale unico) e porta
 *     l'ordine a payment_status = 'pending';
 *   - elaboraPagamentiScaduti: sweep best-effort degli ordini in attesa con
 *     payment_expires_at scaduto → RPC pagamenti_ordine_scaduto (ripristino
 *     stock + ordine annullato "Pagamento scaduto").
 *
 * Sicurezza: nessun importo/prezzo dal client; accesso service-role;
 * errori business → esito tipizzato (mai throw verso la UI).
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";
import { getConfigStripeNegozio, credenzialiGatewayDaConfig } from "./config";
import { GatewayStripe, type GatewayStripeOptions } from "./stripe";
import type { ContestoCheckout } from "./types";

/** Dati dell'ordine necessari alla sessione (letti dal DB, mai dal client). */
type OrdinePerSessione = {
  id: string;
  numero: string;
  negozioId: string;
  totale: number;
  stato: string;
  paymentStatus: string | null;
};

export type EsitoSessioneStripe =
  | {
      ok: true;
      redirectUrl: string;
      sessioneId: string;
      giaEsistente: boolean;
    }
  | { ok: false; codice: string; errore: string };

/** Carica l'ordine con SOLO i campi necessari (admin/service-role). */
async function caricaOrdine(ordineId: string): Promise<OrdinePerSessione | null> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("ordini")
    .select("id, numero, negozio_id, totale, stato, payment_status")
    .eq("id", ordineId)
    .single();
  if (error || !data) return null;
  return {
    id: String(data.id),
    numero: String(data.numero ?? ""),
    negozioId: String(data.negozio_id ?? ""),
    totale: Number(data.totale ?? 0),
    stato: String(data.stato ?? ""),
    paymentStatus: (data.payment_status as string | null) ?? null,
  };
}

/** Sessione attiva esistente per l'ordine (status created/pending). */
async function sessioneAttiva(
  db: ReturnType<typeof createAdminSupabaseClient>,
  ordineId: string
): Promise<{ id: string; paymentId: string; redirectUrl: string | null; expiresAt: string | null } | null> {
  const { data } = await db
    .from("pagamenti_sessioni")
    .select("id, payment_id, redirect_url, expires_at")
    .eq("ordine_id", ordineId)
    .eq("provider", "stripe")
    .in("status", ["created", "pending"])
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return {
    id: String(row.id),
    paymentId: row.payment_id ? String(row.payment_id) : "",
    redirectUrl: row.redirect_url ? String(row.redirect_url) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
  };
}

/**
 * Crea (o riusa) la sessione Stripe per un ordine.
 * Può essere invocata subito dopo la creazione ordine (POST /api/cliente/ordini)
 * oppure dal retry (POST /api/pagamenti/sessioni).
 */
export async function creaSessioneStripePerOrdine(
  ordineId: string,
  /** SOLO TEST: consente di puntare il gateway a un server Stripe mock. */
  gatewayOpts?: GatewayStripeOptions
): Promise<EsitoSessioneStripe> {
  if (!ordineId) {
    return { ok: false, codice: "VALIDATION_ERROR", errore: "Ordine non valido." };
  }

  const db = createAdminSupabaseClient();
  const ordine = await caricaOrdine(ordineId);
  if (!ordine) {
    return { ok: false, codice: "ORDINE_NON_TROVATO", errore: "Ordine non trovato." };
  }

  // ── Guardie di stato (il pagamento è la fonte di verità) ────────────────
  if (ordine.stato === "cancellato" || ordine.stato === "consegnato") {
    return {
      ok: false,
      codice: "ORDINE_NON_PAGABILE",
      errore: "Questo ordine non è più pagabile.",
    };
  }
  if (
    ordine.paymentStatus !== null &&
    !["pending", "failed"].includes(ordine.paymentStatus)
  ) {
    return {
      ok: false,
      codice: ordine.paymentStatus === "paid" ? "GIA_PAGATO" : "PAGAMENTO_CONCLUSO",
      errore: ordine.paymentStatus === "paid"
        ? "Questo ordine è già stato pagato."
        : "Il pagamento di questo ordine è già concluso.",
    };
  }

  // ── Riusa la sessione attiva non scaduta (idempotenza / retry) ──────────
  const attiva = await sessioneAttiva(db, ordine.id);
  if (attiva && attiva.redirectUrl) {
    const scaduta = attiva.expiresAt
      ? new Date(attiva.expiresAt).getTime() <= Date.now()
      : false;
    if (!scaduta) {
      // Retry con sessione attiva: garantisce payment_provider='stripe'
      // anche per ordini pending creati PRIMA di questo fix (foundation
      // 20260818). Best-effort: la sessione già attiva non va bloccata da
      // un errore di marcatura (l'update idempotente è fail-soft qui).
      const { error: reuseErr } = await db
        .from("ordini")
        .update({ payment_provider: "stripe" })
        .eq("id", ordine.id);
      if (reuseErr) {
        console.error("[pagamenti] valorizzazione payment_provider (retry) fallita:", reuseErr.message);
      }
      return {
        ok: true,
        redirectUrl: attiva.redirectUrl,
        sessioneId: attiva.id,
        giaEsistente: true,
      };
    }
    // Sessione superata ma non ancora marcata: la chiudiamo per liberare
    // l'indice unico e consentire la creazione di una nuova.
    await db
      .from("pagamenti_sessioni")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", attiva.id);
  }

  // ── Config Stripe del negozio (fail-closed) ─────────────────────────────
  const config = await getConfigStripeNegozio(ordine.negozioId);
  if (!config || !config.webhookSecret) {
    return {
      ok: false,
      codice: "CARTA_NON_DISPONIBILE",
      errore: "Il pagamento con carta non è disponibile per questo negozio.",
    };
  }

  const siteUrl = getSiteUrl();
  const ctx: ContestoCheckout = {
    ordineId: ordine.id,
    negozioId: ordine.negozioId,
    numeroOrdine: ordine.numero,
    importo: ordine.totale, // SEMPRE dal DB
    valuta: "EUR",
    metodo: "carta",
    returnUrl: `${siteUrl}/ordini/conferma/${ordine.id}`,
    cancelUrl: `${siteUrl}/ordini/conferma/${ordine.id}`,
  };

  const gateway = new GatewayStripe(gatewayOpts);
  let sessione;
  try {
    sessione = await gateway.creaSessione(ctx, credenzialiGatewayDaConfig(config));
  } catch (e) {
    console.error("[pagamenti] creazione sessione Stripe fallita:", e instanceof Error ? e.message : e);
    return {
      ok: false,
      codice: e instanceof Error && "codice" in e
        ? String((e as { codice?: string }).codice ?? "STRIPE_ERROR")
        : "STRIPE_ERROR",
      errore: "Impossibile avviare il pagamento con carta. Riprova.",
    };
  }

  // ── Persistenza sessione + stato ordine (atomico lato applicativo) ──────
  const idempotencyKey = `stripe:${ordine.id}:${crypto.randomUUID()}`;
  const { data: sessioneInserita, error: insertErr } = await db
    .from("pagamenti_sessioni")
    .insert({
      ordine_id: ordine.id,
      negozio_id: ordine.negozioId,
      provider: "stripe",
      payment_id: sessione.paymentId,
      status: "created",
      redirect_url: sessione.redirectUrl,
      amount: ordine.totale,
      currency: "EUR",
      expires_at: sessione.expiresAt?.toISOString() ?? null,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (insertErr) {
    // unique_violation sull'indice "una sessione attiva per ordine": una
    // richiesta concorrente ha già creato la sessione → riusa quella.
    const esistente = await sessioneAttiva(db, ordine.id);
    if (esistente?.redirectUrl) {
      return {
        ok: true,
        redirectUrl: esistente.redirectUrl,
        sessioneId: esistente.id,
        giaEsistente: true,
      };
    }
    console.error("[pagamenti] inserimento sessione fallito:", insertErr.message);
    return { ok: false, codice: "SAVE_FAILED", errore: "Impossibile salvare la sessione di pagamento." };
  }

  const { error: statoErr } = await db.rpc("aggiorna_payment_status", {
    p_ordine_id: ordine.id,
    p_nuovo_stato: "pending",
    p_payment_id: sessione.paymentId,
    p_transaction_id: null,
    p_importo: ordine.totale,
    p_valuta: "EUR",
    p_expires_at: sessione.expiresAt?.toISOString() ?? null,
  });

  if (statoErr) {
    console.error("[pagamenti] aggiornamento payment_status fallito:", statoErr.message);
    // Best-effort: la sessione resta salvata; chiudiamola per non lasciare
    // una sessione attiva su un ordine non in pending.
    await db
      .from("pagamenti_sessioni")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", String((sessioneInserita as { id?: string } | null)?.id ?? ""));
    return { ok: false, codice: "SAVE_FAILED", errore: "Impossibile avviare il pagamento. Riprova." };
  }

  // ── FASE F1 — payment_provider: l'ordine è ora nel flusso Stripe ───────
  // Gap chiuso: la colonna ordini.payment_provider esiste dalla foundation
  // (20260818) ma NESSUN punto del flusso la valorizzava → ogni ordine
  // pagato con carta restava payment_provider = NULL. La valorizziamo qui,
  // nell'unico punto architetturale dove l'ordine entra davvero nel
  // pagamento Stripe (sessione creata + payment_status = pending), sia per
  // il checkout iniziale sia per il retry (/api/pagamenti/sessioni).
  // Fail-closed come lo stato: se la marcatura fallisce non lasciamo un
  // ordine pending senza provider (stessa gestione di statoErr). Nessuna
  // migration: colonna e indice esistono già.
  const { error: providerErr } = await db
    .from("ordini")
    .update({ payment_provider: "stripe" })
    .eq("id", ordine.id);
  if (providerErr) {
    console.error("[pagamenti] valorizzazione payment_provider fallita:", providerErr.message);
    await db
      .from("pagamenti_sessioni")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", String((sessioneInserita as { id?: string } | null)?.id ?? ""));
    return { ok: false, codice: "SAVE_FAILED", errore: "Impossibile avviare il pagamento. Riprova." };
  }

  // ── Verifica finale: l'ordine è ancora pending? (anti-race con una ──────
  //    scadenza elaborata nel frattempo) → altrimenti chiudi la sessione.
  const riletto = await caricaOrdine(ordine.id);
  if (!riletto || riletto.paymentStatus !== "pending" || riletto.stato === "cancellato") {
    await db
      .from("pagamenti_sessioni")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", String((sessioneInserita as { id?: string } | null)?.id ?? ""));
    return {
      ok: false,
      codice: "ORDINE_NON_PAGABILE",
      errore: "L'ordine non è più pagabile. Effettua un nuovo acquisto.",
    };
  }

  return {
    ok: true,
    redirectUrl: sessione.redirectUrl,
    sessioneId: String((sessioneInserita as { id?: string } | null)?.id ?? ""),
    giaEsistente: false,
  };
}

/**
 * Chiude un ordine appena creato il cui pagamento NON è mai partito
 * (es. errore Stripe dopo la creazione ordine): inizializza lo stato
 * pagamento e lo scade subito → ripristino stock + ordine annullato
 * "pagamento scaduto". Best-effort, mai lancia.
 */
export async function chiudiOrdineSenzaPagamento(ordineId: string): Promise<void> {
  try {
    const db = createAdminSupabaseClient();
    await db.rpc("aggiorna_payment_status", {
      p_ordine_id: ordineId,
      p_nuovo_stato: "pending",
      p_payment_id: null,
      p_transaction_id: null,
      p_importo: null,
      p_valuta: null,
      p_expires_at: null,
    });
    await db.rpc("pagamenti_ordine_scaduto", { p_ordine_id: ordineId });
  } catch {
    // Best-effort: l'ordine resta comunque tracciabile (payment_status NULL).
  }
}

/**
 * Sweep best-effort degli ordini con pagamento scaduto (payment_expires_at
 * nel passato e payment_status pending/authorized). Chiamato dai punti
 * server (webhook, retry) per la consistenza eventuale: la fonte primaria
 * resta il webhook checkout.session.expired.
 */
export async function elaboraPagamentiScaduti(limite = 20): Promise<number> {
  const db = createAdminSupabaseClient();
  const ora = new Date().toISOString();

  const { data, error } = await db
    .from("ordini")
    .select("id")
    .in("payment_status", ["pending", "authorized"])
    .lt("payment_expires_at", ora)
    .limit(limite);

  if (error || !data) {
    if (error) console.error("[pagamenti] sweep scaduti: query fallita:", error.message);
    return 0;
  }

  let processati = 0;
  for (const row of data) {
    const { error: rpcErr } = await db.rpc("pagamenti_ordine_scaduto", {
      p_ordine_id: row.id,
    });
    if (!rpcErr) processati++;
  }
  return processati;
}
