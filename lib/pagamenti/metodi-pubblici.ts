/**
 * PAGAMENTI — METODI PUBBLICI CHECKOUT (FASE F1, solo server).
 *
 * Calcola i metodi di pagamento che un negozio offre DAVVERO al checkout:
 *   - solo i metodi con `negozio_metodi_pagamento.attivo = true`;
 *   - "carta" SOLO se Stripe è configurato, attivo e con webhook secret
 *     (senza, il metodo NON viene mostrato: niente finte);
 *   - "klarna" SOLO se Klarna è configurato, attivo e con webhook secret
 *     (stessa regola di "carta": disponibilità determinata SOLO server-side
 *     dalla configurazione reale del negozio — mai mostrato "per default");
 *   - "bonifico" SEMPRE presente (metodo base, non dipende da alcun gateway):
 *     con iban/payee_email configurati mostra le coordinate, altrimenti resta
 *     il metodo esplicito "da concordare in negozio" (stesso comportamento del
 *     checkout carrello). Mai pre-selezionato: la scelta resta esplicita;
 *   - "paypal" SOLO se PayPal è configurato, attivo e con webhook id
 *     (stessa regola di carta/klarna);
 *   - scalapay → NON implementato → mai mostrato.
 *
 * Nessun secret viene letto o esposto (solo dati pubblici via RPC con
 * p_decifra = false). Usato dalle pagine server di checkout.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isProviderProntoPerNegozio, isStripeProntoPerNegozio } from "./config";

export type MetodoPagamentoCheckout = {
  metodo: "carta" | "bonifico" | "klarna" | "paypal";
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
        .filter((m) => m === "carta" || m === "bonifico" || m === "klarna" || m === "paypal");
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

  if (attivi.includes("klarna")) {
    // Disponibilità DETERMINATA SERVER-SIDE dalla configurazione reale del
    // negozio (stessa regola di "carta"): senza Klarna configurato e attivo
    // il metodo NON compare nel checkout. Mai mostrato "per default".
    const klarnaPronto = await isProviderProntoPerNegozio(negozioId, "klarna");
    if (klarnaPronto) {
      metodi.push({
        metodo: "klarna",
        etichetta: "Klarna",
        descrizione: "Dividi il tuo acquisto in 3 rate, se disponibile.",
      });
    }
  }

  if (attivi.includes("paypal")) {
    // Disponibilità DETERMINATA SERVER-SIDE dalla configurazione reale del
    // negozio (stessa regola di carta/klarna): senza PayPal configurato e
    // attivo (client id + secret + webhook id) il metodo NON compare. Mai
    // mostrato "per default", mai un fallback su Stripe/Klarna.
    const paypalPronto = await isProviderProntoPerNegozio(negozioId, "paypal");
    if (paypalPronto) {
      metodi.push({
        metodo: "paypal",
        etichetta: "PayPal",
        descrizione: "Paga con il tuo conto PayPal o con una carta.",
      });
    }
  }

  // BONIFICO — metodo base, SEMPRE disponibile e selezionabile: non dipende
  // da alcun gateway online. Con iban/payee_email configurati mostra le
  // coordinate; altrimenti resta il metodo esplicito "da concordare in negozio"
  // (stesso comportamento del checkout carrello, dove il bonifico è sempre
  // selezionabile anche senza configurazione). Mai pre-selezionato: la scelta
  // resta esplicita lato client (SpedizioneForm).
  {
    const bonifico = await datiBonifico(negozioId);
    metodi.push({
      metodo: "bonifico",
      etichetta: "Bonifico bancario",
      descrizione: bonifico.configurato
        ? "Pagamento manuale: ti invieremo le coordinate per il bonifico."
        : "Pagamento da concordare direttamente con il negozio.",
      iban: bonifico.iban,
      payeeEmail: bonifico.payeeEmail,
    });
  }

  return { ok: true, metodi };
}

/**
 * Metodi di pagamento disponibili per TUTTI i negozi indicati (intersezione):
 * un metodo è disponibile solo se lo è in OGNI negozio. Riusa
 * getMetodiPagamentoPubblici (fonte comune di disponibilità) senza duplicare
 * la logica. Usata dal checkout carrello multi-negozio per mostrare la STESSA
 * disponibilità reale del buy-now. Bonifico è sempre presente in ogni negozio
 * (metodo base, mai filtrato) → sempre nell'intersezione.
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

  // Ordine canonico (identico a getMetodiPagamentoPubblici): carta, klarna, paypal, bonifico.
  const ordine = ["carta", "klarna", "paypal", "bonifico"] as const;
  const risultato: MetodoPagamentoCheckout[] = [];
  for (const metodo of ordine) {
    const presenteOvunque = perNegozio.every(
      (esito) => esito.ok && esito.metodi.some((m) => m.metodo === metodo)
    );
    if (!presenteOvunque) continue;
    const primo = perNegozio
      .find((esito) => esito.ok)
      ?.metodi.find((m) => m.metodo === metodo);
    if (primo) risultato.push(primo);
  }
  return risultato;
}
