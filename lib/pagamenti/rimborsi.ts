/**
 * PAGAMENTI — SERVIZIO RIMBORSI V1 (solo server).
 *
 * Orchestrazione del rimborso totale/parziale end-to-end riusando
 * l'architettura esistente:
 *
 *   1. `pagamenti_prepara_rimborso` (RPC SECURITY DEFINER, FOR UPDATE):
 *      valida ownership/status/residuo, PRENOTA l'importo (incrementa
 *      payment_refunded_amount) e restituisce i dati pagamento;
 *   2. chiamata al GATEWAY del provider (Stripe/PayPal/Klarna) via
 *      `gateway.rimborsa()` — il provider è la fonte del rimborso (refundId);
 *   3. `aggiorna_payment_status` (RPC esistente, macchina a stati già in
 *      produzione) porta lo stato a refunded/partially_refunded;
 *   4. in caso di errore del provider: `pagamenti_rimborso_annulla` rilascia
 *      la prenotazione (niente stato fittizio "rimborsato").
 *
 * Il webhook del provider resta la fonte AUTOREVOLE definitiva (evento
 * idempotente in pagamenti_eventi): l'API qui è sincrona perché i tre
 * gateway confermano il refund in risposta; un eventuale evento webhook
 * successivo è idempotente (stesso stato → no-op, importo sovrascritto con
 * quello autoritativo del provider).
 *
 * Regole:
 *   - importi SEMPRE validati server-side (mai dal browser);
 *   - residuo rimborsabile = payment_amount − payment_refunded_amount;
 *   - 0 < importo ≤ residuo; massimo 2 decimali (EUR);
 *   - idempotenza: la prenotazione atomica rende un retry identico un
 *     OVER_REFUND (il residuo è già diminuito) → niente doppio rimborso;
 *   - ordine NON rimborsabile (stato/provider/legacy) → rifiutato;
 *   - Stripe Connect: il refund passa dall'header Stripe-Account; Stripe
 *     rimborsa automaticamente anche l'application_fee (nessun reversal
 *     manuale della commissione — nessun doppio conteggio).
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { risolviCredenzialiGateway } from "./config";
import { getGatewayProvider, providerGatewayImplementato } from "./registry";

/** Stato di pagamento finale/parziale di un rimborso (macchina a stati esistente). */
export type StatoRimborso = "refunded" | "partially_refunded";

/** Max lunghezza del motivo del rimborso (nota nello storico). */
export const MAX_MOTIVO_RIMBORSO = 200;

/** Provider gateway rimborsabili via API. */
const PROVIDER_RIMBORSABILI = ["stripe", "paypal", "klarna", "scalapay"] as const;

export type EsitoRimborso =
  | {
      ok: true;
      ordineId: string;
      importoRichiesto: number;
      importoRimborsato: number;
      paymentStatus: string;
      residuo: number;
      refundId: string | null;
    }
  | { ok: false; codice: string; errore: string; status: number };

type RispostaPrepara = {
  ok?: boolean;
  codice?: string;
  messaggio?: string;
  ordine_id?: string;
  provider?: string | null;
  payment_id?: string | null;
  payment_amount?: number | null;
  payment_refunded_amount?: number | null;
  importo_richiesto?: number | null;
  residuo?: number | null;
  stato_nuovo?: string | null;
};

/**
 * Valida l'importo del rimborso lato server:
 *   - numerico finito;
 *   - > 0;
 *   - al massimo 2 decimali (normalizzazione EUR);
 *   - non oltre il residuo (controllato anche atomicamente dalla RPC).
 * `null` quando NON valido. Nessun valore dal client è mai fidato.
 */
export function validaImportoRimborso(
  importo: unknown,
  residuo: number
): number | null {
  if (typeof importo !== "number" || !Number.isFinite(importo)) return null;
  // Normalizza a 2 decimali: un valore con più di 2 decimali viene rifiutato
  // (mai arrotondato silenziosamente in favore dell'operatore).
  const normalizzato = Math.round(importo * 100) / 100;
  if (Math.abs(normalizzato - importo) > 1e-9) return null;
  if (normalizzato <= 0) return null;
  const residuoOk = Number.isFinite(residuo) ? residuo : 0;
  if (normalizzato > residuoOk + 1e-9) return null;
  return normalizzato;
}

/**
 * Stato pagamento risultante da un rimborso (regola V1):
 *   importo == residuo → refunded (totale);
 *   importo < residuo  → partially_refunded.
 */
export function statoDopoRimborso(
  residuoPrima: number,
  importo: number
): "refunded" | "partially_refunded" {
  return residuoPrima - importo <= 1e-9 ? "refunded" : "partially_refunded";
}

/** Rilascia la prenotazione se la chiamata al provider fallisce. */
async function rilasciaPrenotazione(ordineId: string, importo: number): Promise<void> {
  try {
    const db = createAdminSupabaseClient();
    await db.rpc("pagamenti_rimborso_annulla", {
      p_ordine_id: ordineId,
      p_importo: importo,
    });
  } catch {
    // Best-effort: la prenotazione resta; il webhook/riconciliazione è la
    // fonte definitiva e non sono mai stati addebitati importi al provider.
  }
}

/** Registra l'operazione nello storico ordine (ordini_eventi, non duplicato
 *  con pagamenti_eventi: quello è il timeline del provider via webhook). */
async function registraEventoStorico(opts: {
  ordineId: string;
  importo: number;
  stato: StatoRimborso;
  motivo?: string | null;
  autoreId: string;
}): Promise<void> {
  try {
    const db = createAdminSupabaseClient();
    await db.from("ordini_eventi").insert({
      ordine_id: opts.ordineId,
      evento: "rimborso",
      dettaglio: `Rimborso di €${opts.importo.toFixed(2)} (${opts.stato === "refunded" ? "totale" : "parziale"})`,
      motivo: "rimborso",
      nota: opts.motivo ?? null,
      autore_id: opts.autoreId,
    });
  } catch {
    // Best-effort: il rimborso è già avvenuto; lo storico non deve bloccare.
  }
}

/**
 * Esegue il rimborso (totale o parziale) di un ordine.
 * Chi chiama deve aver già verificato l'autorizzazione (requireApiArea);
 * la RPC ri-verifica comunque ownership/admin (difesa in profondità).
 */
export async function rimborsaOrdine(opts: {
  ordineId: string;
  importo: unknown;
  motivo?: string | null;
  userId: string;
}): Promise<EsitoRimborso> {
  if (!opts.ordineId) {
    return { ok: false, codice: "VALIDATION_ERROR", errore: "Ordine non valido.", status: 422 };
  }
  if (opts.motivo && opts.motivo.length > MAX_MOTIVO_RIMBORSO) {
    return {
      ok: false,
      codice: "VALIDATION_ERROR",
      errore: `Il motivo supera ${MAX_MOTIVO_RIMBORSO} caratteri.`,
      status: 422,
    };
  }

  const db = createAdminSupabaseClient();

  // ── 1. Prenotazione atomica (validazioni + residuo + over-refund) ─────
  const { data: prepara, error: rpcErr } = await db.rpc("pagamenti_prepara_rimborso", {
    p_ordine_id: opts.ordineId,
    p_importo: opts.importo,
    p_merchant_user_id: opts.userId,
  });
  if (rpcErr) {
    return { ok: false, codice: "SAVE_FAILED", errore: "Impossibile preparare il rimborso.", status: 500 };
  }
  const prep = (prepara ?? null) as RispostaPrepara | null;
  if (!prep || prep.ok !== true) {
    const codice = String(prep?.codice ?? "SAVE_FAILED");
    const status =
      codice === "FORBIDDEN" ? 403 : codice === "ORDINE_NON_TROVATO" ? 404 : 422;
    return {
      ok: false,
      codice,
      errore: String(prep?.messaggio ?? "Rimborso non consentito."),
      status,
    };
  }

  const ordineId = String(prep.ordine_id ?? opts.ordineId);
  const provider = String(prep.provider ?? "");
  const paymentId = String(prep.payment_id ?? "");
  const importoRichiesto = Number(prep.importo_richiesto ?? opts.importo);
  const residuoNuovo = Number(prep.residuo ?? 0);
  const statoAtteso = (prep.stato_nuovo ?? "partially_refunded") as StatoRimborso;

  // ── 2. Provider gateway + credenziali (fail-closed) ───────────────────
  if (!provider || !PROVIDER_RIMBORSABILI.includes(provider as never) || !paymentId) {
    await rilasciaPrenotazione(ordineId, importoRichiesto);
    return {
      ok: false,
      codice: "PAGAMENTO_NON_RIMBORSABILE",
      errore: "Nessun pagamento gateway rimborsabile su questo ordine.",
      status: 422,
    };
  }
  if (!providerGatewayImplementato(provider)) {
    await rilasciaPrenotazione(ordineId, importoRichiesto);
    return {
      ok: false,
      codice: "PROVIDER_NON_DISPONIBILE",
      errore: "Il provider di pagamento non è disponibile.",
      status: 422,
    };
  }
  const gateway = getGatewayProvider(provider);
  if (!gateway) {
    await rilasciaPrenotazione(ordineId, importoRichiesto);
    return {
      ok: false,
      codice: "PROVIDER_NON_DISPONIBILE",
      errore: "Il provider di pagamento non è disponibile.",
      status: 422,
    };
  }

  // Credenziali: Stripe Connect (account collegato) oppure direct (secret).
  // Il negozioId serve per risolvere la config; lo leggiamo dall'ordine.
  const { data: ordineRow } = await db
    .from("ordini")
    .select("negozio_id")
    .eq("id", ordineId)
    .maybeSingle();
  const negozioId = ordineRow?.negozio_id ? String(ordineRow.negozio_id) : "";
  const risolto = negozioId
    ? await risolviCredenzialiGateway(negozioId, provider)
    : { pronto: false as const, cred: null };
  if (!risolto.pronto || !risolto.cred) {
    await rilasciaPrenotazione(ordineId, importoRichiesto);
    return {
      ok: false,
      codice: "PROVIDER_NON_CONFIGURATO",
      errore: "Il metodo di pagamento non è più configurato per il negozio.",
      status: 422,
    };
  }

  // ── 3. Chiamata al provider (fonte del rimborso) ──────────────────────
  let refundId: string | null = null;
  try {
    const esito = await gateway.rimborsa(paymentId, importoRichiesto, risolto.cred);
    refundId = esito.refundId ?? null;
  } catch {
    await rilasciaPrenotazione(ordineId, importoRichiesto);
    return {
      ok: false,
      codice: "RIMBORSO_PROVIDER_FALLITO",
      errore: "Il provider ha rifiutato il rimborso. Nessun importo è stato addebitato.",
      status: 502,
    };
  }

  // ── 4. Stato pagamento via RPC esistente (macchina a stati) ───────────
  const { data: statoRes, error: statoErr } = await db.rpc("aggiorna_payment_status", {
    p_ordine_id: ordineId,
    p_nuovo_stato: statoAtteso,
    p_payment_id: null,
    p_transaction_id: refundId,
    p_importo: null,
    p_valuta: null,
    p_expires_at: null,
  });
  if (statoErr || (statoRes as { ok?: boolean } | null)?.ok !== true) {
    // Il rimborso al provider È avvenuto: NON rilasciamo la prenotazione
    // (l'importo risulta già rimborsato al provider). Registriamo l'evento
    // e ritorniamo un errore transitorio: il webhook del provider farà la
    // riconciliazione definitiva.
    await registraEventoStorico({
      ordineId,
      importo: importoRichiesto,
      stato: statoAtteso,
      motivo: opts.motivo,
      autoreId: opts.userId,
    });
    return {
      ok: false,
      codice: "STATO_NON_AGGIORNATO",
      errore: "Rimborso eseguito dal provider ma stato non aggiornato: verrà riconciliato dal webhook.",
      status: 502,
    };
  }

  // ── 5. Storico ordine (operazione admin) + risposta ───────────────────
  await registraEventoStorico({
    ordineId,
    importo: importoRichiesto,
    stato: statoAtteso,
    motivo: opts.motivo,
    autoreId: opts.userId,
  });

  return {
    ok: true,
    ordineId,
    importoRichiesto,
    importoRimborsato: importoRichiesto,
    paymentStatus: statoAtteso,
    residuo: residuoNuovo,
    refundId,
  };
}
