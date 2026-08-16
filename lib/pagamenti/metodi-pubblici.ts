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
 *      processare quel metodo. Calcolata con isProviderProntoPerNegozio()
 *      (configurazione gateway reale, attiva, con webhook secret):
 *        - carta   → Stripe configurato e attivo;
 *        - paypal  → PayPal configurato e attivo (client id + secret + webhook id);
 *        - klarna  → Klarna configurato e attivo;
 *        - bonifico → SEMPRE disponibile (metodo manuale, nessun gateway).
 *
 * Ogni voce espone il flag `disponibile`. Nessun fallback automatico, nessun
 * metodo pre-selezionato, nessun secret letto o esposto (solo dati pubblici
 * via RPC con p_decifra = false). Usato dalle pagine server del buy-now e,
 * tramite getMetodiPagamentoPubbliciMulti, dal checkout carrello.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isProviderProntoPerNegozio } from "./config";
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

/** Legge iban/payee_email del provider bonifico (senza decifratura). */
async function datiBonifico(
  negozioId: string
): Promise<{ iban: string | null; payeeEmail: string | null; configurato: boolean }> {
  try {
    const db = createAdminSupabaseClient();
    const { data } = await db.rpc("pagamenti_credenziali_leggi", {
      p_negozio_id: negozioId,
      p_provider: "bonifico",
      p_decifra: false,
      p_chiave: null,
    });
    const esito = data as {
      ok?: boolean;
      presente?: boolean;
      attivo?: boolean;
      iban?: string | null;
      payee_email?: string | null;
    } | null;
    if (!esito || esito.ok !== true || esito.presente !== true) {
      return { iban: null, payeeEmail: null, configurato: false };
    }
    const iban = typeof esito.iban === "string" && esito.iban.trim() ? esito.iban.trim() : null;
    const payeeEmail =
      typeof esito.payee_email === "string" && esito.payee_email.trim()
        ? esito.payee_email.trim()
        : null;
    return { iban, payeeEmail, configurato: !!iban || !!payeeEmail };
  } catch {
    return { iban: null, payeeEmail: null, configurato: false };
  }
}

/**
 * Metodi di pagamento per il checkout del negozio: SEMPRE l'intero catalogo
 * supportato da InCittà, ognuno con il flag `disponibile` reale.
 *
 * - bonifico: `disponibile = true` (metodo base, non dipende da gateway);
 *   se configurato mostra le coordinate, altrimenti "da concordare".
 * - carta/paypal/klarna: `disponibile = true` SOLO se il metodo è attivo in
 *   `negozio_metodi_pagamento` E il relativo gateway è pronto
 *   (isProviderProntoPerNegozio). Altrimenti restano nel catalogo con
 *   `disponibile = false` (mai mostrati come funzionanti, mai fallback).
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

  const bonifico = await datiBonifico(negozioId);

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

    if (voce.metodo === "bonifico") {
      item.iban = bonifico.iban;
      item.payeeEmail = bonifico.payeeEmail;
      item.descrizione = bonifico.configurato
        ? "Pagamento manuale: ti invieremo le coordinate per il bonifico."
        : voce.descrizione;
    }

    metodi.push(item);
  }

  return { ok: true, metodi };
}

/**
 * Disponibilità reale di UNA voce di catalogo per un negozio.
 * - senza gateway (bonifico): sempre true;
 * - con gateway: true SOLO se attivato dal merchant E provider pronto.
 */
async function disponibilitaVoce(
  voce: VoceCatalogoMetodo,
  negozioId: string,
  attivi: string[]
): Promise<boolean> {
  if (!voce.richiedeGateway) return true;
  if (!attivi.includes(voce.metodo)) return false;
  if (!voce.provider) return false;
  return isProviderProntoPerNegozio(negozioId, voce.provider);
}

/**
 * Metodi di pagamento per TUTTI i negozi indicati (intersezione): restituisce
 * SEMPRE l'intero catalogo supportato, con `disponibile = true` solo se il
 * metodo è realmente disponibile in OGNI negozio. Riusa
 * getMetodiPagamentoPubblici (fonte comune di disponibilità) senza duplicare
 * la logica. Bonifico è sempre presente (metodo base, mai filtrato).
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

    // Dati bonifico: presi dal primo negozio che li espone (coordinate condivise
    // solo se configurate; altrimenti resta la descrizione "da concordare").
    const primo = perNegozio
      .find((esito) => esito.ok)
      ?.metodi.find((m) => m.metodo === voce.metodo);

    const item: MetodoPagamentoCheckout = {
      metodo: voce.metodo,
      etichetta: voce.etichetta,
      nomeBreve: voce.nomeBreve,
      descrizione: voce.descrizione,
      disponibile: voce.richiedeGateway ? disponibileOvunque : true,
      iban: primo?.iban ?? null,
      payeeEmail: primo?.payeeEmail ?? null,
    };

    if (voce.metodo === "bonifico" && (primo?.iban || primo?.payeeEmail)) {
      item.descrizione = "Pagamento manuale: ti invieremo le coordinate per il bonifico.";
    }

    risultato.push(item);
  }

  return risultato;
}
