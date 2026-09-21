/**
 * PAGAMENTI — METODI PUBBLICI CHECKOUT (solo server).
 *
 * Separa nettamente DUE concetti:
 *
 *   A) CATALOGO (lib/pagamenti/catalogo.ts) — cosa InCittà SUPPORTA.
 *      Sempre restituito: ogni metodo del catalogo è presente nella risposta,
 *      indipendentemente dalla configurazione del negozio.
 *
 *   B) DISPONIBILITÀ per il singolo negozio — se il negozio può DAVVERO
 *      processare quel metodo. I metodi online usano esclusivamente Stripe;
 *
 * Ogni voce espone il flag `disponibile`. Nessun fallback automatico, nessun
 * metodo pre-selezionato, nessun secret letto o esposto (solo dati pubblici
 * via RPC con p_decifra = false). Usato dalle pagine server del buy-now e,
 * tramite getMetodiPagamentoPubbliciMulti, dal checkout carrello.
 */

import Stripe from "stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getStripeConnectAccount } from "./config";
import {
  CATALOGO_METODI_PAGAMENTO,
  type MetodoPagamento,
  type VoceCatalogoMetodo,
} from "./catalogo";

export type MetodoPagamentoCheckout = {
  metodo: MetodoPagamento;
  etichetta: string;
  /** Nome breve (es. "Carta") per i messaggi di indisponibilità/alternative. */
  nomeBreve: string;
  descrizione: string;
  /**
   * True se il negozio (o TUTTI i negozi del carrello, in `Multi`) può
   * realmente processare il metodo. Un metodo supportato ma non configurato
   * resta visibile con `disponibile = false` (mai rimosso dal catalogo).
   */
  disponibile: boolean;
  /** iban/payee_email del negozio per il bonifico (dati pubblici configurativi). */
  iban?: string | null;
  payeeEmail?: string | null;
};

export type EsitoMetodiPubblici =
  | { ok: true; metodi: MetodoPagamentoCheckout[] }
  | { ok: false; errore: string };

/**
 * B2 — Disponibilità REAL per-metodo per un negozio (fail-closed):
 *
 *   carta    → connected account pronto (charges+payouts) E attivo
 *              (metodo 'carta' in negozio_metodi_pagamento);
 *   klarna   → connected account pronto E capability klarna_payments ACTIVE
 *              (flag B1 klarna_enabled) E metodo 'klarna' attivo;
 *   paypal  → connected account pronto, metodo 'paypal' attivo E PayPal
 *              disponibile nella Payment Method Configuration Stripe;
 *   sepa_debit → connected account pronto e metodo 'sepa_debit' attivo;
 *   bonifico_istantaneo → connected account pronto e metodo attivo;
 *
 * Solo "active" abilita: requested/pending/inactive/restricted → false.
 */
export async function isMetodoDisponibile(
  negozioId: string,
  metodo: string,
  _opts?: { importo?: number }
): Promise<boolean> {
  if (!negozioId) return false;

  if (
    metodo === "carta" ||
    metodo === "klarna" ||
    metodo === "paypal" ||
    metodo === "sepa_debit" ||
    metodo === "bonifico_istantaneo"
  ) {
    // 1. Il metodo deve essere ATTIVATO dal negozio
    //    (negozio_metodi_pagamento.attivo = true).
    if (!(await metodoAttivatoDalNegozio(negozioId, metodo))) return false;
    // 2. Il connected account Stripe deve essere PRONTO (charges+payouts).
    const connect = await getStripeConnectAccount(negozioId);
    if (!connect || !connect.chargesEnabled || !connect.payoutsEnabled) return false;
    // 3. Gating per capability (stato REALE Stripe, fail-closed).
    if (metodo === "klarna" && !connect.klarnaEnabled) return false;
    if (metodo === "paypal" && !(await paypalDisponibileInConfigurazioneStripe(connect.accountId))) {
      return false;
    }
    if (metodo === "sepa_debit" && !(await sepaDisponibileInConfigurazioneStripe(connect.accountId))) {
      return false;
    }
    if (
      metodo === "bonifico_istantaneo" &&
      !(await bonificoIstantaneoDisponibileInConfigurazioneStripe(connect.accountId))
    ) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Verifica la configurazione Stripe effettiva per il connected account.
 * Nessuna scrittura: un errore o una configurazione non disponibile chiude
 * il metodo (fail-closed), lasciando a Stripe la selezione dinamica finale.
 */
async function paypalDisponibileInConfigurazioneStripe(accountId: string): Promise<boolean> {
  const secret = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!secret || !accountId) return false;
  try {
    const stripe = new Stripe(secret);
    const configurazioni = await stripe.paymentMethodConfigurations.list(
      { limit: 100 },
      { stripeAccount: accountId }
    );
    const configurazioneDefault = configurazioni.data.find(
      (configurazione) => configurazione.active && configurazione.is_default && configurazione.parent
    );
    return configurazioneDefault?.paypal?.available === true;
  } catch {
    return false;
  }
}

async function sepaDisponibileInConfigurazioneStripe(accountId: string): Promise<boolean> {
  const secret = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!secret || !accountId) return false;
  try {
    const stripe = new Stripe(secret);
    const configurazioni = await stripe.paymentMethodConfigurations.list(
      { limit: 100 },
      { stripeAccount: accountId }
    );
    const configurazioneDefault = configurazioni.data.find(
      (configurazione) => configurazione.active && configurazione.is_default && configurazione.parent
    );
    return configurazioneDefault?.sepa_debit?.available === true;
  } catch {
    return false;
  }
}

async function bonificoIstantaneoDisponibileInConfigurazioneStripe(accountId: string): Promise<boolean> {
  const secret = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!secret || !accountId) return false;
  try {
    const stripe = new Stripe(secret);
    const configurazioni = await stripe.paymentMethodConfigurations.list(
      { limit: 100 },
      { stripeAccount: accountId }
    );
    const configurazioneDefault = configurazioni.data.find(
      (configurazione) => configurazione.active && configurazione.is_default && configurazione.parent
    );
    return configurazioneDefault?.pay_by_bank?.available === true;
  } catch {
    return false;
  }
}

/** Metodo attivato dal merchant (negozio_metodi_pagamento.attivo = true). */
async function metodoAttivatoDalNegozio(negozioId: string, metodo: string): Promise<boolean> {
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("negozio_metodi_pagamento")
      .select("metodo")
      .eq("negozio_id", negozioId)
      .eq("metodo", metodo)
      .eq("attivo", true)
      .limit(1);
    return !error && (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
/**
 * Metodi di pagamento per il checkout del negozio: SEMPRE l'intero catalogo
 * supportato da InCittà, ognuno con il flag `disponibile` reale.
 *
 * - carta/klarna/bonifico_istantaneo: `disponibile = true` SOLO se il metodo
 *   è attivo e il connected account Stripe è pronto;
 * - PayPal richiede inoltre la disponibilità nella configurazione Stripe;
 * - il bonifico ordinario non appartiene al catalogo checkout.
 */
export async function getMetodiPagamentoPubblici(
  negozioId: string
): Promise<EsitoMetodiPubblici> {
  if (!negozioId) return { ok: false, errore: "Negozio non valido." };

  // Metodi ATTIVATI dal merchant (negozio_metodi_pagamento.attivo = true).
  // È la scelta di attivazione del negozio, distinta dalla configurazione
  // gateway: un metodo online è "disponibile" solo se attivato E configurato.
  let attivi: string[] = [];
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("negozio_metodi_pagamento")
      .select("metodo")
      .eq("negozio_id", negozioId)
      .eq("attivo", true)
      .order("ordine_mostra", { ascending: true });
    if (!error && data) {
      attivi = (data ?? []).map((r) => String(r.metodo));
    }
  } catch {
    // Nessun metodo attivato → restano disponibili solo i metodi senza gateway.
  }

  const metodi: MetodoPagamentoCheckout[] = [];
  for (const voce of CATALOGO_METODI_PAGAMENTO) {
    const disponibile = await disponibilitaVoce(voce, negozioId, attivi);

    const item: MetodoPagamentoCheckout = {
      metodo: voce.metodo,
      etichetta: voce.etichetta,
      nomeBreve: voce.nomeBreve,
      descrizione: voce.descrizione,
      disponibile,
    };

    metodi.push(item);
  }

  return { ok: true, metodi };
}

/**
 * Disponibilità reale di UNA voce di catalogo per un negozio.
 * - con gateway Stripe: true SOLO se il metodo è attivo e il connected account
 *   è pronto; Klarna richiede inoltre la capability Stripe attiva.
 */
async function disponibilitaVoce(
  voce: VoceCatalogoMetodo,
  negozioId: string,
  attivi: string[]
): Promise<boolean> {
  if (!voce.richiedeGateway) return true;
  if (!attivi.includes(voce.metodo)) return false;
  if (!voce.provider) return false;
  return isMetodoDisponibile(negozioId, voce.metodo);
}

/**
 * B2 — TRUE se il prodotto appartiene a un negozio che può accettare il
 * METODO richiesto (carta/klarna/bonifico_istantaneo/bonifico). PRE-FLIGHT
 * usato dalle route checkout PRIMA di creare l'intento: il client non può
 * mai selezionare un metodo non realmente disponibile (defense in depth;
 * la UI già filtra i metodi). Fail-closed: errore DB → false.
 */
export async function metodoDisponibilePerProdotto(
  prodottoId: string,
  metodo: string,
  _opts?: { importo?: number }
): Promise<boolean> {
  if (!prodottoId || !/^\d+$/.test(String(prodottoId))) return false;
  try {
    const db = createAdminSupabaseClient();
    const { data } = await db
      .from("prodotti")
      .select("negozio_id")
      .eq("id", Number(prodottoId))
      .single();
    if (!data?.negozio_id) return false;
    return isMetodoDisponibile(String(data.negozio_id), metodo, _opts);
  } catch {
    return false;
  }
}

/**
 * Metodi di pagamento per TUTTI i negozi indicati (intersezione): restituisce
 * SEMPRE l'intero catalogo supportato, con `disponibile = true` solo se il
 * metodo è realmente disponibile in OGNI negozio. Riusa
 * getMetodiPagamentoPubblici (fonte comune di disponibilità) senza duplicare
 * la logica; il bonifico ordinario non appartiene al catalogo checkout.
 */
export async function getMetodiPagamentoPubbliciMulti(
  negozioIds: string[]
): Promise<MetodoPagamentoCheckout[]> {
  const unici = [
    ...new Set(
      (negozioIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean)
    ),
  ];
  if (unici.length === 0) return [];

  const perNegozio = await Promise.all(
    unici.map((id) => getMetodiPagamentoPubblici(id))
  );

  const risultato: MetodoPagamentoCheckout[] = [];
  for (const voce of CATALOGO_METODI_PAGAMENTO) {
    // Disponibile solo se OGNI negozio lo ha disponibile.
    const disponibileOvunque = perNegozio.every(
      (esito) =>
        esito.ok && esito.metodi.some((m) => m.metodo === voce.metodo && m.disponibile)
    );

    const item: MetodoPagamentoCheckout = {
      metodo: voce.metodo,
      etichetta: voce.etichetta,
      nomeBreve: voce.nomeBreve,
      descrizione: voce.descrizione,
      disponibile: voce.richiedeGateway ? disponibileOvunque : true,
    };

    risultato.push(item);
  }

  return risultato;
}
