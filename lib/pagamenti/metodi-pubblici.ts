/**
 * PAGAMENTI — METODI PUBBLICI CHECKOUT (FASE F1, solo server).
 *
 * Calcola i metodi di pagamento che un negozio offre DAVVERO al checkout:
 *   - solo i metodi con `negozio_metodi_pagamento.attivo = true`;
 *   - "carta" SOLO se Stripe è configurato, attivo e con webhook secret
 *     (senza, il metodo NON viene mostrato: niente finte);
 *   - "bonifico" SOLO se il negozio ha configurato iban/payee_email;
 *   - paypal/klarna/scalapay → NON implementati in F1 → mai mostrati.
 *
 * Nessun secret viene letto o esposto (solo dati pubblici via RPC con
 * p_decifra = false). Usato dalle pagine server di checkout.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isStripeProntoPerNegozio } from "./config";

export type MetodoPagamentoCheckout = {
  metodo: "carta" | "bonifico";
  etichetta: string;
  descrizione: string;
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
 * Metodi di pagamento realmente disponibili per il checkout del negozio.
 * I metodi attivi sono ordinati per `ordine_mostra`; carta/bonifico vengono
 * esclusi se non configurati (mai mostrare metodi non funzionanti).
 */
export async function getMetodiPagamentoPubblici(
  negozioId: string
): Promise<EsitoMetodiPubblici> {
  if (!negozioId) return { ok: false, errore: "Negozio non valido." };

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
      attivi = (data ?? [])
        .map((r) => String(r.metodo))
        .filter((m) => m === "carta" || m === "bonifico");
    }
  } catch {
    // Nessun metodo configurato → lista vuota.
  }

  const metodi: MetodoPagamentoCheckout[] = [];

  if (attivi.includes("carta")) {
    const stripePronto = await isStripeProntoPerNegozio(negozioId);
    if (stripePronto) {
      metodi.push({
        metodo: "carta",
        etichetta: "Carta di credito/debito",
        descrizione: "Pagamento sicuro con Stripe (carte principali).",
      });
    }
  }

  if (attivi.includes("bonifico")) {
    const bonifico = await datiBonifico(negozioId);
    if (bonifico.configurato) {
      metodi.push({
        metodo: "bonifico",
        etichetta: "Bonifico bancario",
        descrizione: "Pagamento manuale: ti invieremo le coordinate per il bonifico.",
        iban: bonifico.iban,
        payeeEmail: bonifico.payeeEmail,
      });
    }
  }

  return { ok: true, metodi };
}
