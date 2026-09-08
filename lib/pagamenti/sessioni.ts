/**
 * PAGAMENTI — SERVIZIO SESSIONI (FASE F1 + orchestrazione provider).
 *
 * Orchestrazione delle sessioni di pagamento per ordine:
 *   - creaSessionePagamentoPerOrdine: crea la sessione del provider
 *     (stripe/klarna/...) usando SOLO il totale calcolato dal DB, la
 *     collega a pagamenti_sessioni (idempotenza: una sola sessione attiva
 *     per ordine+provider — il filtro applicativo è per ordine+provider,
 *     l'indice parziale unico F1 è per ordine: un cambio di metodo sullo
 *     stesso ordine fallisce fail-closed senza corruzione) e porta l'ordine
 *     a payment_status = 'pending' con payment_provider = provider;
 *   - creaSessioneStripePerOrdine: WRAPPER retrocompatibile (F1/F2.3) che
 *     delega a creaSessionePagamentoPerOrdine con provider "stripe" — il
 *     comportamento Stripe è identico;
 *   - elaboraPagamentiScaduti: sweep best-effort degli ordini in attesa con
 *     payment_expires_at scaduto → RPC pagamenti_ordine_scaduto (ripristino
 *     stock + ordine annullato "Pagamento scaduto").
 *
 * Sicurezza: nessun importo/prezzo dal client; accesso service-role;
 * errori business → esito tipizzato (mai throw verso la UI). Provider non
 * configurato o non implementato → errore fail-closed (mai fallback
 * silenzioso su un altro provider).
 */

import {
  createOrderConfirmationUrl,
  verifyOrderAccessToken,
} from "@/lib/cliente/order-access";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";
import { risolviCredenzialiGateway } from "./config";
import { getGatewayProvider, providerGatewayImplementato, type GatewayRuntimeOptions } from "./registry";
import type { GatewayStripeOptions } from "./stripe";
import type { ContestoCheckout, RigaCheckout } from "./types";
import { PAYMENT_SESSION_TTL_MS } from "./expiration";

/** Dati dell'ordine necessari alla sessione (letti dal DB, mai dal client). */

export type SweepPagamentiScadutiResult =
  | { ok: true; candidati: number; processati: number; falliti: number }
  | { ok: false; candidati: number; processati: number; falliti: number; errore: string };

type RpcPaymentResult = {
  ok?: boolean;
  codice?: string;
  messaggio?: string;
};

function rpcPaymentSucceeded(data: unknown): data is RpcPaymentResult & { ok: true } {
  return !!data && typeof data === "object" && (data as RpcPaymentResult).ok === true;
}

type OrdinePerSessione = {
  id: string;
  numero: string;
  negozioId: string;
  totale: number;
  stato: string;
  paymentStatus: string | null;
  /** Costo spedizione (una sola volta, F2.3): line item dedicato. */
  costoSpedizione: number;
  /** Commissione piattaforma snapshot (ordini.commissione_importo), per Stripe Connect. */
  commissioneImporto: number;
  /** Dati consumatore (Scalapay): snapshot DB dell'ordine. */
  consumer: NonNullable<ContestoCheckout["consumer"]>;
  /** Righe dell'ordine (snapshot DB): un line_item per riga (F2.3). */
  righe: RigaCheckout[];
};

export type EsitoSessionePagamento =
  | {
      ok: true;
      redirectUrl: string;
      sessioneId: string;
      giaEsistente: boolean;
    }
  | { ok: false; codice: string; errore: string };

/** Alias retrocompatibile (F1/F2.3): la sessione Stripe è una sessione generica. */
export type EsitoSessioneStripe = EsitoSessionePagamento;

/**
 * Carica l'ordine con i campi necessari (admin/service-role) INSIEME alle
 * sue ordini_righe (FASE F2.3): la sessione nasce da questi snapshot
 * (nome, prezzo unitario, quantità, variante) — mai da dati del client.
 */
async function caricaOrdine(ordineId: string): Promise<OrdinePerSessione | null> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("ordini")
    .select(
      "id, numero, negozio_id, totale, stato, payment_status, costo_spedizione, commissione_importo, cliente_nome, cliente_cognome, cliente_email, cliente_telefono"
    )
    .eq("id", ordineId)
    .single();
  if (error || !data) return null;

  const { data: righe } = await db
    .from("ordini_righe")
    .select("nome_prodotto, prezzo_unitario, quantita, variante_nome")
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: true });

  return {
    id: String(data.id),
    numero: String(data.numero ?? ""),
    negozioId: String(data.negozio_id ?? ""),
    totale: Number(data.totale ?? 0),
    stato: String(data.stato ?? ""),
    paymentStatus: (data.payment_status as string | null) ?? null,
    costoSpedizione: Number(data.costo_spedizione ?? 0),
    commissioneImporto: Number(data.commissione_importo ?? 0),
    consumer: {
      nome: String(data.cliente_nome ?? ""),
      cognome: String(data.cliente_cognome ?? ""),
      email: data.cliente_email ? String(data.cliente_email) : null,
      telefono: data.cliente_telefono ? String(data.cliente_telefono) : null,
    },
    righe: ((righe ?? []) as Record<string, unknown>[]).map((r) => ({
      nome: String(r.nome_prodotto ?? ""),
      quantita: Number(r.quantita ?? 1),
      prezzoUnitario: Number(r.prezzo_unitario ?? 0),
      variante: r.variante_nome ? String(r.variante_nome) : null,
    })),
  };
}

/** Sessione attiva esistente per ordine+provider (status created/pending). */
async function sessioneAttiva(
  db: ReturnType<typeof createAdminSupabaseClient>,
  ordineId: string,
  provider: string
): Promise<{ id: string; paymentId: string; redirectUrl: string | null; expiresAt: string | null } | null> {
  const { data } = await db
    .from("pagamenti_sessioni")
    .select("id, payment_id, redirect_url, expires_at")
    .eq("ordine_id", ordineId)
    .eq("provider", provider)
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
 * Crea (o riusa) la sessione di pagamento per un ordine e un provider.
 * Può essere invocata subito dopo la creazione ordine (POST /api/cliente/ordini/carrello)
 * oppure dal retry (POST /api/pagamenti/sessioni).
 *
 * Fail-closed: provider non ammesso/non implementato → PROVIDER_NON_DISPONIBILE;
 * provider non configurato sul negozio → CARTA_NON_DISPONIBILE (stripe) /
 * PAGAMENTO_NON_DISPONIBILE (altri). Mai un fallback silenzioso.
 */
export async function creaSessionePagamentoPerOrdine(
  ordineId: string,
  provider: string,
  /** SOLO TEST: consente di puntare il gateway a un server mock. */
  gatewayOpts?: GatewayRuntimeOptions
): Promise<EsitoSessionePagamento> {
  if (!ordineId) {
    return { ok: false, codice: "VALIDATION_ERROR", errore: "Ordine non valido." };
  }
  // Provider non implementato/ammesso → fail-closed (mai fallback).
  if (!providerGatewayImplementato(provider)) {
    return {
      ok: false,
      codice: "PROVIDER_NON_DISPONIBILE",
      errore: "Il metodo di pagamento scelto non è disponibile.",
    };
  }
  const gateway = getGatewayProvider(provider, gatewayOpts);
  if (!gateway) {
    return {
      ok: false,
      codice: "PROVIDER_NON_DISPONIBILE",
      errore: "Il metodo di pagamento scelto non è disponibile.",
    };
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
  const attiva = await sessioneAttiva(db, ordine.id, provider);
  if (attiva && attiva.redirectUrl) {
    const scaduta = attiva.expiresAt
      ? new Date(attiva.expiresAt).getTime() <= Date.now()
      : false;
    if (!scaduta) {
      // Retry con sessione attiva: garantisce payment_provider corretto anche
      // per ordini pending creati PRIMA di questo fix (foundation 20260818).
      // Best-effort: la sessione già attiva non va bloccata da un errore di
      // marcatura (l'update idempotente è fail-soft qui).
      const { error: reuseErr } = await db
        .from("ordini")
        .update({ payment_provider: provider })
        .eq("id", ordine.id);
      if (reuseErr) {
        console.error(`[pagamenti] valorizzazione payment_provider (retry ${provider}) fallita:`, reuseErr.message);
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

  // ── Config del provider sul negozio (fail-closed) ───────────────────────
  // Gestisce entrambi i modelli: Stripe Connect (account collegato) e
  // legacy/direct (secret + webhook secret per Stripe manuale/PayPal/Klarna).
  const risolto = await risolviCredenzialiGateway(ordine.negozioId, provider);
  if (!risolto.pronto || !risolto.cred) {
    const codice = provider === "stripe" ? "CARTA_NON_DISPONIBILE" : "PAGAMENTO_NON_DISPONIBILE";
    return {
      ok: false,
      codice,
      errore:
        provider === "stripe"
          ? "Il pagamento con carta non è disponibile per questo negozio."
          : "Il metodo di pagamento scelto non è disponibile per questo negozio.",
    };
  }

  // ── FASE F2.3 — righe dell'ordine dal DB + coerenza totale ──────────────
  // Ogni riga diventa un line_item (prezzo unitario e quantità dagli
  // snapshot ordini_righe). Il totale della sessione (Σ righe + spedizione)
  // deve corrispondere ESATTAMENTE a ordine.totale (calcolato dal DB alla
  // creazione dell'ordine): se non coincide rifiutiamo (fail-closed) — mai
  // una sessione con un importo diverso da quello persistito.
  if (ordine.righe.length === 0) {
    return {
      ok: false,
      codice: "ORDINE_SENZA_RIGHE",
      errore: "L'ordine non ha prodotti: impossibile avviare il pagamento.",
    };
  }
  const sommaRighe = ordine.righe.reduce(
    (s, r) => s + Math.round(r.prezzoUnitario * r.quantita * 100) / 100,
    0
  );
  const totaleAtteso = Math.round((sommaRighe + ordine.costoSpedizione) * 100) / 100;
  if (Math.abs(totaleAtteso - ordine.totale) > 0.011) {
    console.error(
      `[pagamenti] totale incoerente ordine ${ordine.id}: righe=${totaleAtteso}, persistito=${ordine.totale}`
    );
    return {
      ok: false,
      codice: "TOTALE_NON_COERENTE",
      errore: "Impossibile avviare il pagamento: totale dell'ordine non coerente.",
    };
  }

  const siteUrl = getSiteUrl();
  const ctx: ContestoCheckout = {
    ordineId: ordine.id,
    negozioId: ordine.negozioId,
    numeroOrdine: ordine.numero,
    importo: ordine.totale, // SEMPRE dal DB
    valuta: "EUR",
    metodo: provider === "stripe" ? "carta" : provider,
    returnUrl: createOrderConfirmationUrl(siteUrl, ordine.id),
    cancelUrl: createOrderConfirmationUrl(siteUrl, ordine.id),
    // FASE F2.3 — un line_item per riga, spedizione come line item dedicato.
    righe: ordine.righe,
    costoSpedizione: ordine.costoSpedizione,
    // Commissione snapshot (solo Stripe Connect: application_fee_amount).
    commissioneImporto: ordine.commissioneImporto,
    // Dati consumatore (solo per i gateway che li richiedono, es. Scalapay).
    consumer: ordine.consumer,
  };

  let sessione;
  try {
    sessione = await gateway.creaSessione(ctx, risolto.cred);
  } catch (e) {
    console.error(`[pagamenti] creazione sessione ${provider} fallita:`, e instanceof Error ? e.message : e);
    return {
      ok: false,
      codice: e instanceof Error && "codice" in e
        ? String((e as { codice?: string }).codice ?? `${provider.toUpperCase()}_ERROR`)
        : `${provider.toUpperCase()}_ERROR`,
      errore: "Impossibile avviare il pagamento. Riprova.",
    };
  }

  // ── Persistenza sessione + stato ordine (atomico lato applicativo) ──────
  // Stripe returns its provider deadline; the other providers use the same
  // application TTL so order/session expiration remains consistent locally.
  const expiresAt = sessione.expiresAt ?? new Date(Date.now() + PAYMENT_SESSION_TTL_MS);
  const idempotencyKey = `${provider}:${ordine.id}:${crypto.randomUUID()}`;
  const { data: sessioneInserita, error: insertErr } = await db
    .from("pagamenti_sessioni")
    .insert({
      ordine_id: ordine.id,
      negozio_id: ordine.negozioId,
      provider,
      payment_id: sessione.paymentId,
      status: "created",
      redirect_url: sessione.redirectUrl,
      amount: ordine.totale,
      currency: "EUR",
      expires_at: expiresAt.toISOString(),
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (insertErr) {
    // unique_violation sull'indice "una sessione attiva per ordine": una
    // richiesta concorrente ha già creato la sessione → riusa quella.
    const esistente = await sessioneAttiva(db, ordine.id, provider);
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

  const { data: statoData, error: statoErr } = await db.rpc("aggiorna_payment_status", {
    p_ordine_id: ordine.id,
    p_nuovo_stato: "pending",
    p_payment_id: sessione.paymentId,
    p_transaction_id: null,
    p_importo: ordine.totale,
    p_valuta: "EUR",
    p_expires_at: expiresAt.toISOString(),
  });

  if (statoErr || !rpcPaymentSucceeded(statoData)) {
    const statoMessage = statoErr?.message ?? (statoData as RpcPaymentResult | null)?.messaggio ?? "stato pagamento rifiutato";
    console.error("[pagamenti] aggiornamento payment_status fallito:", statoMessage);
    // Best-effort: la sessione resta salvata; chiudiamola per non lasciare
    // una sessione attiva su un ordine non in pending.
    await db
      .from("pagamenti_sessioni")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", String((sessioneInserita as { id?: string } | null)?.id ?? ""));
    return { ok: false, codice: "SAVE_FAILED", errore: "Impossibile avviare il pagamento. Riprova." };
  }

  // ── payment_provider: l'ordine è ora nel flusso del provider ────────────
  // L'ordine entra davvero nel pagamento (sessione creata + payment_status
  // = pending): valorizziamo payment_provider sia per il checkout iniziale
  // sia per il retry. Fail-closed come lo stato: se la marcatura fallisce
  // non lasciamo un ordine pending senza provider. Nessuna migration:
  // colonna e indice esistono già dalla foundation.
  const { error: providerErr } = await db
    .from("ordini")
    .update({ payment_provider: provider })
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
 * WRAPPER retrocompatibile (F1/F2.3): crea (o riusa) la sessione Stripe per
 * un ordine. Identico a prima — delega a creaSessionePagamentoPerOrdine con
 * provider "stripe". Tutti i caller esistenti (buy-now, retry, test) e il
 * comportamento Stripe restano invariati.
 */
export async function creaSessioneStripePerOrdine(
  ordineId: string,
  /** SOLO TEST: consente di puntare il gateway a un server Stripe mock. */
  gatewayOpts?: GatewayStripeOptions
): Promise<EsitoSessioneStripe> {
  return creaSessionePagamentoPerOrdine(ordineId, "stripe", gatewayOpts);
}

/**
 * Chiude un ordine appena creato il cui pagamento NON è mai partito
 * (es. errore del gateway dopo la creazione ordine): inizializza lo stato
 * pagamento e lo scade subito → ripristino stock + ordine annullato
 * "pagamento scaduto". Best-effort, mai lancia.
 */
export async function chiudiOrdinePagamento(
  ordineId: string,
  stato: "expired" | "canceled"
): Promise<{ ok: boolean; errore?: string }> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db.rpc("pagamenti_ordine_chiuso", {
    p_ordine_id: ordineId,
    p_payment_status: stato,
  });
  if (error) return { ok: false, errore: error.message };
  if (!rpcPaymentSucceeded(data)) {
    return {
      ok: false,
      errore: (data as RpcPaymentResult | null)?.messaggio ?? "chiusura pagamento rifiutata",
    };
  }
  return { ok: true };
}

export async function chiudiOrdineSenzaPagamento(ordineId: string): Promise<void> {
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db.rpc("aggiorna_payment_status", {
      p_ordine_id: ordineId,
      p_nuovo_stato: "pending",
      p_payment_id: null,
      p_transaction_id: null,
      p_importo: null,
      p_valuta: null,
      p_expires_at: new Date(Date.now() + PAYMENT_SESSION_TTL_MS).toISOString(),
    });
    if (error || !rpcPaymentSucceeded(data)) return;
    await chiudiOrdinePagamento(ordineId, "expired");
  } catch {
    // Best-effort: the order remains traceable and no client-side state is trusted.
  }
}

/**
 * Detailed sweep result used by the protected cron endpoint.
 *
 * P3 PAYMENT-FIRST: oltre agli ordini in attesa (flusso legacy), lo sweep
 * gestisce gli INTENTI senza ordine (pagamenti_sessioni.ordine_id IS NULL,
 * status created/pending, expires_at <= now) rilasciando la riserva stock
 * tramite checkout_intento_scaduto (idempotente e serializzata dal lock).
 * Candidati/processati/falliti sommano entrambe le categorie.
 */
export async function elaboraPagamentiScadutiDettagli(
  limite = 20
): Promise<SweepPagamentiScadutiResult> {
  const db = createAdminSupabaseClient();
  const ora = new Date().toISOString();

  let processati = 0;
  let falliti = 0;
  let candidati = 0;

  // ── 1. ORDINI in attesa di pagamento (flusso legacy, invariato) ────────
  const { data, error } = await db
    .from("ordini")
    .select("id")
    .in("payment_status", ["pending", "authorized"])
    .lt("payment_expires_at", ora)
    .limit(limite);

  if (error) {
    console.error("[pagamenti] sweep scaduti: query ordini fallita:", error.message);
    return { ok: false, candidati: 0, processati: 0, falliti: 0, errore: error.message };
  }
  candidati += (data ?? []).length;
  for (const row of data ?? []) {
    const { data: rpcData, error: rpcErr } = await db.rpc("pagamenti_ordine_scaduto", {
      p_ordine_id: row.id,
    });
    if (rpcErr || !rpcPaymentSucceeded(rpcData)) {
      falliti++;
      console.error("[pagamenti] sweep scaduti: chiusura ordine fallita", rpcErr?.message ?? (rpcData as RpcPaymentResult | null)?.messaggio ?? "rpc rifiutata");
    } else {
      processati++;
    }
  }

  // ── 2. INTENTI senza ordine (P3 payment-first): rilascio riserve ───────
  //    Riutilizza l'indice parziale P0 (status, expires_at) where ordine_id
  //    is null. Ogni riga viene gestita da checkout_intento_scaduto (lock
  //    breve per singola sessione: niente lock prolungati inutilmente).
  const { data: intenti, error: intentiErr } = await db
    .from("pagamenti_sessioni")
    .select("id")
    .is("ordine_id", null)
    .in("status", ["created", "pending"])
    .lt("expires_at", ora)
    .limit(limite);

  if (intentiErr) {
    console.error("[pagamenti] sweep scaduti: query intenti fallita:", intentiErr.message);
    return { ok: false, candidati, processati, falliti, errore: intentiErr.message };
  }
  candidati += (intenti ?? []).length;
  for (const row of intenti ?? []) {
    const { data: rpcData, error: rpcErr } = await db.rpc("checkout_intento_scaduto", {
      p_sessione_id: row.id,
    });
    if (rpcErr || !rpcPaymentSucceeded(rpcData)) {
      falliti++;
      console.error("[pagamenti] sweep scaduti: scadenza intento fallita", rpcErr?.message ?? (rpcData as RpcPaymentResult | null)?.messaggio ?? "rpc rifiutata");
    } else {
      processati++;
    }
  }

  return falliti > 0
    ? { ok: false, candidati, processati, falliti, errore: "uno o più elementi scaduti non sono stati chiusi" }
    : { ok: true, candidati, processati, falliti };
}

/** Backward-compatible count API used by existing scripts/tests. */
export async function elaboraPagamentiScaduti(limite = 20): Promise<number> {
  const result = await elaboraPagamentiScadutiDettagli(limite);
  return result.processati;
}

// ═══════════════════════════════════════════════════════════════════════
// P1 PAYMENT-FIRST — INTENTO DI CHECKOUT (ordine NON ancora creato)
// ═══════════════════════════════════════════════════════════════════════

/** Dispatch metodo → provider gateway (fail-closed; bonifico → null). */
export function providerDaMetodoPagamento(metodo: string | undefined | null): string | null {
  if (metodo === "carta") return "stripe";
  if (metodo === "klarna") return "klarna";
  if (metodo === "scalapay") return "scalapay";
  if (metodo === "paypal") return "paypal";
  return null;
}

/** HTTP status associato ai codici d'errore dell'intento (RPC). */
const STATUS_INTENTO_DA_CODICE: Record<string, number> = {
  VALIDATION_ERROR: 422,
  PRODOTTO_NON_TROVATO: 404,
  PRODOTTO_INATTIVO: 409,
  NEGOZIO_NON_TROVATO: 404,
  NEGOZIO_INATTIVO: 409,
  NEGOZIO_DIVERSO: 409,
  SCORTE_INSUFFICIENTI: 409,
  PREZZO_NON_VALIDO: 500,
  VARIANTE_NON_VALIDA: 422,
  VARIANTE_OBBLIGATORIA: 422,
  CORRIERE_NON_VALIDO: 422,
  SERVIZIO_NON_VALIDO: 422,
  PESO_MANCANTE: 422,
  TARIFFA_NON_TROVATA: 422,
  CORRIERE_LOCALE_NON_DISPONIBILE: 422,
  DB_UNAVAILABLE: 500,
  SAVE_FAILED: 500,
};

/** Esito della creazione dell'intento (RPC checkout_intento_crea). */
export type EsitoIntentoCheckout =
  | {
      ok: true;
      checkoutId: string;
      checkoutKey: string;
      negozioId: string;
      negozioNome: string;
      totale: number;
      costoSpedizione: number;
      commissioneImporto: number;
      giaEsistente: boolean;
    }
  | { ok: false; codice: string; errore: string; status: number };

/** Payload canonico salvato dalla RPC in pagamenti_sessioni.checkout_payload. */
export type PayloadIntentoCheckout = {
  version: number;
  checkoutKey: string;
  provider: string;
  metodoPagamento: string | null;
  modalita: string;
  negozioId: string;
  negozioNome: string;
  righe: Array<{
    prodottoId: string;
    varianteId: string | null;
    varianteNome: string | null;
    nomeProdotto: string;
    prezzoUnitario: number;
    quantita: number;
    immagineUrl: string | null;
  }>;
  subtotale: number;
  costoSpedizione: number;
  totale: number;
  commissionePercentuale: number;
  commissioneImporto: number;
  spedizione: {
    indirizzo: string;
    cap: string;
    citta: string;
    provincia: string;
    note: string | null;
    carrier: string;
    servizio: string;
    metodoSpedizione: string;
    tariffaVersione: string | null;
    pesoGrammi: number;
  } | null;
  cliente: {
    nome: string;
    cognome: string;
    telefono: string | null;
    email: string | null;
    userId: string | null;
  };
  fatturazione: unknown;
  note: string | null;
  clienteIp: string | null;
};

/**
 * P1 — Crea l'INTENTO di checkout per i metodi ONLINE (RPC atomica
 * checkout_intento_crea): valida, RISERVA lo stock (quantita_riservata),
 * inserisce una sessione con ordine_id = NULL e salva il payload canonico.
 * NESSUNA riga in ordini/ordini_righe, nessuna notifica.
 */
export async function creaIntentoCheckout(
  payload: Record<string, unknown>
): Promise<EsitoIntentoCheckout> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db.rpc("checkout_intento_crea", { p_payload: payload });
  if (error) {
    console.error("[pagamenti] RPC checkout_intento_crea fallita:", error.message);
    return { ok: false, codice: "SAVE_FAILED", errore: "Impossibile avviare il pagamento.", status: 500 };
  }
  const esito = data as unknown as {
    ok?: boolean;
    checkoutId?: string;
    checkoutKey?: string;
    negozioId?: string;
    negozioNome?: string;
    totale?: number;
    costoSpedizione?: number;
    commissioneImporto?: number;
    giaEsistente?: boolean;
    codice?: string;
    messaggio?: string;
  } | null;
  if (!esito || esito.ok !== true || !esito.checkoutId) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      errore: String(esito?.messaggio ?? "Impossibile avviare il pagamento."),
      status: STATUS_INTENTO_DA_CODICE[codice] ?? 422,
    };
  }
  return {
    ok: true,
    checkoutId: String(esito.checkoutId),
    checkoutKey: String(esito.checkoutKey ?? ""),
    negozioId: String(esito.negozioId ?? ""),
    negozioNome: String(esito.negozioNome ?? ""),
    totale: Number(esito.totale ?? 0),
    costoSpedizione: Number(esito.costoSpedizione ?? 0),
    commissioneImporto: Number(esito.commissioneImporto ?? 0),
    giaEsistente: esito.giaEsistente === true,
  };
}

type SessioneIntentoCaricata = {
  id: string;
  negozioId: string;
  provider: string;
  status: string;
  paymentId: string | null;
  redirectUrl: string | null;
  expiresAt: string | null;
  payload: PayloadIntentoCheckout | null;
};

async function caricaIntento(
  checkoutId: string
): Promise<SessioneIntentoCaricata | null> {
  const db = createAdminSupabaseClient();
  const { data } = await db
    .from("pagamenti_sessioni")
    .select("id, negozio_id, provider, status, payment_id, redirect_url, expires_at, checkout_payload")
    .eq("id", checkoutId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    negozioId: String(data.negozio_id ?? ""),
    provider: String(data.provider ?? ""),
    status: String(data.status ?? ""),
    paymentId: data.payment_id ? String(data.payment_id) : null,
    redirectUrl: data.redirect_url ? String(data.redirect_url) : null,
    expiresAt: data.expires_at ? String(data.expires_at) : null,
    payload: (data.checkout_payload as PayloadIntentoCheckout | null) ?? null,
  };
}

/**
 * P5 — Intento caricato per il RETRY / la pagina risultato, con i dati di
 * autorizzazione e il collegamento all'ordine (se la conferma P2 è avvenuta).
 * SOLA LETTURA: mai un ordine, mai una riserva.
 */
export type IntentoRetryCaricato = {
  id: string;
  negozioId: string;
  provider: string;
  status: string;
  /** Ordine creato dopo la conferma (P2) — null finché il pagamento non è riuscito. */
  ordineId: string | null;
  /** Proprietario autenticato del checkout (checkout_payload.clienteUserId). */
  clienteUserId: string | null;
  expiresAt: string | null;
  redirectUrl: string | null;
};

export async function caricaIntentoRetry(
  checkoutId: string
): Promise<IntentoRetryCaricato | null> {
  if (!checkoutId) return null;
  const db = createAdminSupabaseClient();
  const { data } = await db
    .from("pagamenti_sessioni")
    .select(
      "id, negozio_id, provider, status, ordine_id, redirect_url, expires_at, checkout_payload"
    )
    .eq("id", checkoutId)
    .maybeSingle();
  if (!data) return null;
  const payload = (data.checkout_payload as { clienteUserId?: unknown } | null) ?? null;
  return {
    id: String(data.id),
    negozioId: String(data.negozio_id ?? ""),
    provider: String(data.provider ?? ""),
    status: String(data.status ?? ""),
    ordineId: data.ordine_id ? String(data.ordine_id) : null,
    clienteUserId: payload?.clienteUserId ? String(payload.clienteUserId) : null,
    expiresAt: data.expires_at ? String(data.expires_at) : null,
    redirectUrl: data.redirect_url ? String(data.redirect_url) : null,
  };
}

/**
 * P5 — Autorizzazione a un checkout/intento payment-first. Fail-closed:
 *  - utente AUTENTICATO → proprietario del checkout (clienteUserId nello
 *    snapshot, impostato SOLO server-side dalla sessione Supabase);
 *  - GUEST → token firmato (cookie httpOnly o Bearer) scoped all'id sessione
 *    (stesso meccanismo order-access: mai accesso a checkout altrui).
 */
export async function intentoAutorizzato(
  checkoutId: string,
  access: { userId: string | null; token: string | null }
): Promise<boolean> {
  if (!checkoutId) return false;
  if (access.userId) {
    const intento = await caricaIntentoRetry(checkoutId);
    return intento !== null && intento.clienteUserId === access.userId;
  }
  return verifyOrderAccessToken(access.token, checkoutId);
}

/**
 * Input VALIDATO per la creazione dell'intento (P1): stesso insieme di dati
 * già validato dalle route checkout (mai prezzi/totali dal client — la RPC
 * ricalcola tutto dal DB). `righe` contiene SOLO riferimenti + quantità.
 */
export type IntentoCheckoutInput = {
  /** Chiave di idempotenza del cliente (≤64, per negozio nel carrello). */
  checkoutKey: string;
  /** Provider gateway (stripe | paypal | klarna | scalapay). */
  provider: string;
  modalita: "spedizione";
  righe: Array<{
    prodottoId: string;
    varianteId?: string | null;
    quantita: number;
  }>;
  cliente: {
    nome: string;
    cognome: string;
    telefono?: string | null;
    email?: string | null;
  };
  /** UUID del cliente AUTENTICATO (SERVER-ONLY dalla sessione). */
  clienteUserId?: string | null;
  clienteIp?: string | null;
  spedizione: {
    indirizzo: string;
    cap: string;
    citta: string;
    provincia: string;
    note?: string | null;
    carrier: string;
    servizio: string;
    metodoPagamento: string;
  };
  /** Indirizzo di fatturazione opzionale (passthrough snapshot). */
  fatturazione?: unknown;
  note?: string | null;
};

/**
 * Costruisce il payload della RPC `checkout_intento_crea` a partire
 * dall'input VALIDATO (funzione pura, stessa normalizzazione di
 * costruisciPayloadOrdine: niente default silenziosi).
 */
export function costruisciPayloadIntentoCheckout(
  input: IntentoCheckoutInput
): Record<string, unknown> {
  const cliente = input.cliente ?? ({} as IntentoCheckoutInput["cliente"]);
  const note = input.note ? String(input.note).trim().slice(0, 500) : null;
  return {
    checkoutKey: (input.checkoutKey ?? "").trim(),
    provider: input.provider,
    modalita: input.modalita,
    clienteNome: String(cliente.nome ?? "").trim(),
    clienteCognome: String(cliente.cognome ?? "").trim(),
    clienteTelefono: cliente.telefono ? String(cliente.telefono).trim().slice(0, 30) : null,
    clienteEmail: cliente.email ? String(cliente.email).trim().slice(0, 120) : null,
    clienteUserId:
      input.clienteUserId && String(input.clienteUserId).trim()
        ? String(input.clienteUserId).trim()
        : null,
    clienteIp: input.clienteIp ?? null,
    spedizioneIndirizzo: String(input.spedizione?.indirizzo ?? "").trim(),
    spedizioneCap: String(input.spedizione?.cap ?? "").trim(),
    spedizioneCitta: String(input.spedizione?.citta ?? "").trim(),
    spedizioneProvincia: String(input.spedizione?.provincia ?? "").trim(),
    spedizioneNote: input.spedizione?.note
      ? String(input.spedizione.note).trim().slice(0, 500)
      : null,
    spedizioneCarrier: input.spedizione?.carrier ?? null,
    spedizioneServizio: input.spedizione?.servizio ?? null,
    metodoPagamento: input.spedizione?.metodoPagamento ?? null,
    note,
    fatturazione: input.fatturazione ?? null,
    righe: (input.righe ?? []).map((r) => ({
      prodottoId: String(r.prodottoId),
      varianteId:
        r.varianteId && String(r.varianteId).trim() ? String(r.varianteId).trim() : null,
      quantita: Number(r.quantita),
    })),
  };
}

/**
 * Annulla un intento (rilascia la riserva stock + sessione expired).
 * Best-effort, mai lancia: usata quando la creazione della sessione
 * PROVIDER fallisce DOPO la riserva (regola P1: nessuna riserva fantasma).
 */
export async function annullaIntentoCheckout(
  checkoutId: string
): Promise<{ ok: boolean; errore?: string }> {
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db.rpc("checkout_intento_annulla", {
      p_checkout_id: checkoutId,
    });
    if (error) return { ok: false, errore: error.message };
    const esito = data as unknown as { ok?: boolean; messaggio?: string } | null;
    if (!esito || esito.ok !== true) {
      return {
        ok: false,
        errore: String(esito?.messaggio ?? "annullamento intento rifiutato"),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, errore: "annullamento intento non disponibile" };
  }
}

/** Esito della creazione/riuso della sessione PROVIDER per un intento. */
export type EsitoSessioneIntento =
  | { ok: true; redirectUrl: string; sessioneId: string; giaEsistente: boolean }
  | { ok: false; codice: string; errore: string };

/**
 * P1 — Crea (o riusa) la sessione del PROVIDER per un intento GIÀ esistente
 * (pagamenti_sessioni con ordine_id = NULL): legge il payload canonico dal
 * DB, risolve le credenziali del negozio (fail-closed), chiama il gateway
 * e aggiorna la riga sessione (payment_id / redirect_url / expires_at).
 * MAI un ordine, MAI un fallback di provider.
 */
export async function creaSessionePagamentoPerIntento(
  checkoutId: string,
  provider: string,
  gatewayOpts?: GatewayRuntimeOptions
): Promise<EsitoSessioneIntento> {
  if (!checkoutId) {
    return { ok: false, codice: "VALIDATION_ERROR", errore: "Checkout non valido." };
  }
  const intento = await caricaIntento(checkoutId);
  if (!intento) {
    return { ok: false, codice: "CHECKOUT_NON_TROVATO", errore: "Checkout non trovato." };
  }

  // Il provider AUTHORITATIVO è quello salvato sull'intento (mai dal client
  // in retry): il parametro serve solo al dispatch iniziale.
  const providerEffettivo = intento.provider || provider;
  if (!providerGatewayImplementato(providerEffettivo)) {
    return {
      ok: false,
      codice: "PROVIDER_NON_DISPONIBILE",
      errore: "Il metodo di pagamento scelto non è disponibile.",
    };
  }
  const gateway = getGatewayProvider(providerEffettivo, gatewayOpts);
  if (!gateway) {
    return {
      ok: false,
      codice: "PROVIDER_NON_DISPONIBILE",
      errore: "Il metodo di pagamento scelto non è disponibile.",
    };
  }

  // Guardie di stato: solo un intento attivo è pagabile.
  if (!["created", "pending"].includes(intento.status)) {
    return {
      ok: false,
      codice: "CHECKOUT_NON_DISPONIBILE",
      errore: "Questo checkout non è più pagabile.",
    };
  }

  const payload = intento.payload;
  if (!payload || !Array.isArray(payload.righe) || payload.righe.length === 0) {
    return {
      ok: false,
      codice: "CHECKOUT_SENZA_RIGHE",
      errore: "Il checkout non ha prodotti: impossibile avviare il pagamento.",
    };
  }

  // Riusa la sessione provider attiva NON scaduta (idempotenza / retry).
  if (intento.redirectUrl) {
    const scaduta = intento.expiresAt
      ? new Date(intento.expiresAt).getTime() <= Date.now()
      : false;
    if (!scaduta) {
      return {
        ok: true,
        redirectUrl: intento.redirectUrl,
        sessioneId: intento.id,
        giaEsistente: true,
      };
    }
  }

  // Config del provider sul negozio (fail-closed, come per gli ordini).
  const risolto = await risolviCredenzialiGateway(intento.negozioId, providerEffettivo);
  if (!risolto.pronto || !risolto.cred) {
    const codice =
      providerEffettivo === "stripe" ? "CARTA_NON_DISPONIBILE" : "PAGAMENTO_NON_DISPONIBILE";
    return {
      ok: false,
      codice,
      errore:
        providerEffettivo === "stripe"
          ? "Il pagamento con carta non è disponibile per questo negozio."
          : "Il metodo di pagamento scelto non è disponibile per questo negozio.",
    };
  }

  const siteUrl = getSiteUrl();
  // Correlazione webhook (P2): l'identificativo dell'intento è l'id sessione.
  const riferimento = checkoutId.slice(0, 8);
  const ctx: ContestoCheckout = {
    ordineId: checkoutId,
    negozioId: intento.negozioId,
    numeroOrdine: riferimento,
    importo: Number(payload.totale ?? 0),
    valuta: "EUR",
    metodo: providerEffettivo === "stripe" ? "carta" : providerEffettivo,
    returnUrl: createOrderConfirmationUrl(siteUrl, checkoutId),
    cancelUrl: createOrderConfirmationUrl(siteUrl, checkoutId),
    righe: payload.righe.map((r) => ({
      nome: r.nomeProdotto,
      quantita: r.quantita,
      prezzoUnitario: r.prezzoUnitario,
      variante: r.varianteNome ?? null,
    })),
    costoSpedizione: Number(payload.costoSpedizione ?? 0),
    commissioneImporto: Number(payload.commissioneImporto ?? 0),
    consumer: {
      nome: payload.cliente?.nome ?? "",
      cognome: payload.cliente?.cognome ?? "",
      email: payload.cliente?.email ?? null,
      telefono: payload.cliente?.telefono ?? null,
    },
  };

  let sessione;
  try {
    sessione = await gateway.creaSessione(ctx, risolto.cred);
  } catch (e) {
    console.error(
      `[pagamenti] creazione sessione ${providerEffettivo} (intento ${checkoutId}) fallita:`,
      e instanceof Error ? e.message : e
    );
    return {
      ok: false,
      codice: `${providerEffettivo.toUpperCase()}_ERROR`,
      errore: "Impossibile avviare il pagamento. Riprova.",
    };
  }

  const expiresAt = sessione.expiresAt ?? new Date(Date.now() + PAYMENT_SESSION_TTL_MS);
  const db = createAdminSupabaseClient();
  const { error: updateErr } = await db
    .from("pagamenti_sessioni")
    .update({
      payment_id: sessione.paymentId,
      redirect_url: sessione.redirectUrl,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", checkoutId);
  if (updateErr) {
    console.error("[pagamenti] aggiornamento sessione intento fallito:", updateErr.message);
    return { ok: false, codice: "SAVE_FAILED", errore: "Impossibile salvare la sessione di pagamento." };
  }

  return {
    ok: true,
    redirectUrl: sessione.redirectUrl,
    sessioneId: checkoutId,
    giaEsistente: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// P2 PAYMENT-FIRST — CONFERMA PAGAMENTO → ORDINE ATOMICO
// ═══════════════════════════════════════════════════════════════════════

/** Intento individuato da un webhook provider (sessione senza ordine). */
export type IntentoWebhook = {
  checkoutId: string;
  negozioId: string;
  provider: string;
  /** Importo autoritativo dello snapshot (pagamenti_sessioni.amount). */
  importo: number;
};

/**
 * P2 — Cerca l'INTENTO per ID sessione (Stripe: client_reference_id /
 * metadata.ordine_id = id sessione). ordine_id deve essere NULL.
 */
export async function intentoDaId(
  sessioneId: string,
  negozioId: string
): Promise<IntentoWebhook | null> {
  if (!sessioneId) return null;
  const db = createAdminSupabaseClient();
  const { data } = await db
    .from("pagamenti_sessioni")
    .select("id, negozio_id, provider, amount, status, ordine_id")
    .eq("id", sessioneId)
    .eq("negozio_id", negozioId)
    .is("ordine_id", null)
    .maybeSingle();
  if (!data) return null;
  return {
    checkoutId: String(data.id),
    negozioId: String(data.negozio_id ?? ""),
    provider: String(data.provider ?? ""),
    importo: Number(data.amount ?? 0),
  };
}

/**
 * P2 — Cerca l'INTENTO tramite il payment reference del provider
 * (PayPal/Klarna/Scalapay: pagamenti_sessioni.payment_id con ordine_id NULL).
 */
export async function intentoDaPaymentId(
  paymentId: string,
  negozioId: string,
  provider: string
): Promise<IntentoWebhook | null> {
  if (!paymentId || !negozioId) return null;
  const db = createAdminSupabaseClient();
  const { data } = await db
    .from("pagamenti_sessioni")
    .select("id, negozio_id, provider, amount, status, ordine_id")
    .eq("provider", provider)
    .eq("payment_id", paymentId)
    .eq("negozio_id", negozioId)
    .is("ordine_id", null)
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return {
    checkoutId: String(row.id),
    negozioId: String(row.negozio_id ?? ""),
    provider: String(row.provider ?? provider),
    importo: Number(row.amount ?? 0),
  };
}

/** Esito della conferma dell'intento (RPC checkout_intento_conferma). */
export type EsitoConfermaIntento =
  | {
      ok: true;
      ordineId: string;
      numero: string;
      negozioId: string;
      negozioNome: string;
      totale: number;
      giaEsistente: boolean;
    }
  | { ok: false; codice: string; errore: string };

/**
 * P2 — Conferma un intento pagato (RPC atomica checkout_intento_conferma):
 * crea ordine + righe, converte la riserva in vendita definitiva e collega
 * la sessione. Idempotente: se l'ordine esiste già restituisce quello
 * esistente. Mai chiamata prima della verifica webhook del pagamento.
 */
export async function confermaIntentoCheckout(
  checkoutId: string,
  opts: {
    paymentId: string;
    transactionId: string | null;
    importo: number;
    valuta: string;
  }
): Promise<EsitoConfermaIntento> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db.rpc("checkout_intento_conferma", {
    p_sessione_id: checkoutId,
    p_payment_id: opts.paymentId || null,
    p_transaction_id: opts.transactionId || null,
    p_importo: opts.importo,
    p_valuta: opts.valuta || "EUR",
  });
  if (error) {
    console.error("[pagamenti] RPC checkout_intento_conferma fallita:", error.message);
    return { ok: false, codice: "SAVE_FAILED", errore: "Conferma del pagamento non riuscita." };
  }
  const esito = data as unknown as {
    ok?: boolean;
    giaEsistente?: boolean;
    ordine?: {
      id?: unknown;
      numero?: unknown;
      negozioId?: unknown;
      negozioNome?: unknown;
      totale?: unknown;
    } | null;
    codice?: string;
    messaggio?: string;
  } | null;
  if (!esito || esito.ok !== true || !esito.ordine?.id) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      errore: String(esito?.messaggio ?? "Conferma del pagamento non riuscita."),
    };
  }
  return {
    ok: true,
    ordineId: String(esito.ordine.id),
    numero: String(esito.ordine.numero ?? ""),
    negozioId: String(esito.ordine.negozioId ?? ""),
    negozioNome: String(esito.ordine.negozioNome ?? ""),
    totale: Number(esito.ordine.totale ?? 0),
    giaEsistente: esito.giaEsistente === true,
  };
}
