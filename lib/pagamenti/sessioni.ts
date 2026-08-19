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

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";
import { risolviCredenzialiGateway } from "./config";
import { getGatewayProvider, providerGatewayImplementato, type GatewayRuntimeOptions } from "./registry";
import type { GatewayStripeOptions } from "./stripe";
import type { ContestoCheckout, RigaCheckout } from "./types";

/** Dati dell'ordine necessari alla sessione (letti dal DB, mai dal client). */
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
    returnUrl: `${siteUrl}/ordini/conferma/${ordine.id}`,
    cancelUrl: `${siteUrl}/ordini/conferma/${ordine.id}`,
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
      expires_at: sessione.expiresAt?.toISOString() ?? null,
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
 * resta il webhook di scadenza del provider.
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
