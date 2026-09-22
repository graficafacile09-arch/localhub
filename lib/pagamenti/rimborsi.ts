/**
 * PAGAMENTI — SERVIZIO RIMBORSI V1 (solo server).
 *
 * Orchestrazione del rimborso totale/parziale end-to-end riusando
 * l'architettura esistente:
 *
 *   1. `pagamenti_prepara_rimborso` (RPC SECURITY DEFINER, FOR UPDATE):
 *      valida ownership/status/residuo, PRENOTA l'importo (incrementa
 *      payment_refunded_amount) e restituisce i dati pagamento;
 *   2. chiamata al gateway Stripe via
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
const PROVIDER_RIMBORSABILI = ["stripe"] as const;

export type EsitoRimborso =
  | { ok: true; ordineId: string; importoRichiesto: number; importoRimborsato: number; paymentStatus: string; residuo: number; refundId: string | null; pending?: false }
  | { ok: true; pending: true; ordineId: string; importoRichiesto: number; paymentStatus: string; residuo: number; refundId: string | null }
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
  idempotencyKey: string;
}): Promise<EsitoRimborso> {
  if (!opts.ordineId) return { ok: false, codice: "VALIDATION_ERROR", errore: "Ordine non valido.", status: 422 };
  if (!opts.idempotencyKey || opts.idempotencyKey.trim().length > 128) return { ok: false, codice: "VALIDATION_ERROR", errore: "Chiave di idempotenza non valida.", status: 422 };
  if (opts.motivo && opts.motivo.length > MAX_MOTIVO_RIMBORSO) {
    return { ok: false, codice: "VALIDATION_ERROR", errore: `Il motivo supera ${MAX_MOTIVO_RIMBORSO} caratteri.`, status: 422 };
  }

  const db = createAdminSupabaseClient();

  const { data: prepara, error: preparaErr } = await db.rpc("pagamenti_rimborso_operazione_prepara", {
    p_ordine_id: opts.ordineId,
    p_importo: opts.importo,
    p_merchant_user_id: opts.userId,
    p_idempotency_key: opts.idempotencyKey.trim(),
  });
  if (preparaErr) return { ok: false, codice: "SAVE_FAILED", errore: "Impossibile preparare il rimborso.", status: 500 };

  const prep = (prepara ?? null) as RispostaPrepara & {
    esistente?: boolean; operazione_id?: string; stato?: string; refund_id?: string | null; payment_status?: string | null;
  };
  if (!prep || prep.ok !== true || !prep.operazione_id) {
    const codice = String(prep?.codice ?? "SAVE_FAILED");
    const status = codice === "FORBIDDEN" ? 403 : codice === "ORDINE_NON_TROVATO" ? 404 : 422;
    return { ok: false, codice, errore: String(prep?.messaggio ?? "Rimborso non consentito."), status };
  }

  const operazioneId = String(prep.operazione_id);
  const importoRichiesto = Number(prep.importo_richiesto ?? opts.importo);
  const statoOperazione = String(prep.stato ?? "pending");
  const paymentStatus = String(prep.payment_status ?? "");
  const residuo = Number(prep.residuo ?? 0);

  if (statoOperazione === "succeeded" && prep.refund_id) {
    return { ok: true, ordineId: String(prep.ordine_id ?? opts.ordineId), importoRichiesto, importoRimborsato: importoRichiesto, paymentStatus: paymentStatus || "refunded", residuo, refundId: String(prep.refund_id), pending: false };
  }

  const { data: claim, error: claimErr } = await db.rpc("pagamenti_rimborso_operazione_claim", { p_operazione_id: operazioneId });
  if (claimErr) return { ok: false, codice: "SAVE_FAILED", errore: "Impossibile acquisire l'operazione di rimborso.", status: 500 };

  const claimed = (claim ?? null) as {
    ok?: boolean; claimed?: boolean; stato?: string; provider?: string; payment_id?: string | null; idempotency_key?: string; importo_richiesto?: number; refund_id?: string | null;
  };
  if (claimed?.ok !== true) return { ok: false, codice: "SAVE_FAILED", errore: "Impossibile acquisire l'operazione di rimborso.", status: 500 };

  if (claimed.claimed !== true) {
    if (claimed.stato === "succeeded" && claimed.refund_id) {
      return { ok: true, ordineId: String(prep.ordine_id ?? opts.ordineId), importoRichiesto, importoRimborsato: importoRichiesto, paymentStatus: paymentStatus || "refunded", residuo, refundId: claimed.refund_id, pending: false };
    }
    return { ok: true, pending: true, ordineId: String(prep.ordine_id ?? opts.ordineId), importoRichiesto, paymentStatus: paymentStatus || "paid", residuo, refundId: claimed.refund_id ?? null };
  }

  const provider = String(claimed.provider ?? prep.provider ?? "");
  const paymentId = String(claimed.payment_id ?? prep.payment_id ?? "");
  if (provider !== "stripe" || !paymentId) {
    await db.rpc("pagamenti_rimborso_operazione_fallita", { p_operazione_id: operazioneId, p_stato: "failed", p_codice: "PAGAMENTO_NON_RIMBORSABILE", p_dettaglio: "Nessun pagamento Stripe rimborsabile su questo ordine." });
    return { ok: false, codice: "PAGAMENTO_NON_RIMBORSABILE", errore: "Nessun pagamento gateway rimborsabile su questo ordine.", status: 422 };
  }

  const { data: ordineRow } = await db.from("ordini").select("negozio_id").eq("id", opts.ordineId).maybeSingle();
  const negozioId = ordineRow?.negozio_id ? String(ordineRow.negozio_id) : "";
  const risolto = negozioId ? await risolviCredenzialiGateway(negozioId, provider) : { pronto: false as const, cred: null };
  if (!risolto.pronto || !risolto.cred) {
    await db.rpc("pagamenti_rimborso_operazione_fallita", { p_operazione_id: operazioneId, p_stato: "failed", p_codice: "PROVIDER_NON_CONFIGURATO", p_dettaglio: "Il metodo di pagamento non è più configurato per il negozio." });
    return { ok: false, codice: "PROVIDER_NON_CONFIGURATO", errore: "Il metodo di pagamento non è più configurato per il negozio.", status: 422 };
  }

  let refundId: string | null = null;
  try {
    const gateway = getGatewayProvider(provider);
    if (!gateway) throw new Error("Provider non disponibile.");
    const esito = await gateway.rimborsa(paymentId, importoRichiesto, risolto.cred, {
      idempotencyKey: String(claimed.idempotency_key ?? opts.idempotencyKey.trim()),
      operationId: operazioneId,
    });
    refundId = esito.refundId ?? null;
  } catch (err) {
    await db.rpc("pagamenti_rimborso_operazione_fallita", { p_operazione_id: operazioneId, p_stato: "reconciliation_required", p_codice: "RIMBORSO_PROVIDER_INDETERMINATO", p_dettaglio: err instanceof Error ? err.message : "Risposta provider indeterminata." });
    return { ok: true, pending: true, ordineId: String(prep.ordine_id ?? opts.ordineId), importoRichiesto, paymentStatus: paymentStatus || "paid", residuo, refundId: null };
  }

  const { data: completa, error: completaErr } = await db.rpc("pagamenti_rimborso_operazione_completa", { p_operazione_id: operazioneId, p_refund_id: refundId });
  if (completaErr) {
    await db.rpc("pagamenti_rimborso_operazione_fallita", { p_operazione_id: operazioneId, p_stato: "reconciliation_required", p_codice: "STATE_NOT_UPDATED", p_dettaglio: "Refund creato dal provider ma finalizzazione DB non disponibile." });
    return { ok: true, pending: true, ordineId: String(prep.ordine_id ?? opts.ordineId), importoRichiesto, paymentStatus: paymentStatus || "paid", residuo, refundId };
  }

  const finale = (completa ?? null) as { ok?: boolean; stato?: string; codice?: string; refund_id?: string | null; importo_rimborsato?: number; payment_status?: string; residuo?: number };
  if (finale.ok !== true || finale.stato !== "succeeded") {
    if (finale.stato === "reconciliation_required") {
      return { ok: true, pending: true, ordineId: String(prep.ordine_id ?? opts.ordineId), importoRichiesto, paymentStatus: paymentStatus || "paid", residuo: Number(finale.residuo ?? residuo), refundId: finale.refund_id ?? refundId };
    }
    return { ok: false, codice: String(finale.codice ?? "STATE_NOT_UPDATED"), errore: "Impossibile finalizzare il rimborso.", status: 502 };
  }

  await registraEventoStorico({
    ordineId: String(prep.ordine_id ?? opts.ordineId),
    importo: Number(finale.importo_rimborsato ?? importoRichiesto),
    stato: finale.payment_status === "refunded" ? "refunded" : "partially_refunded",
    motivo: opts.motivo,
    autoreId: opts.userId,
  });

  return {
    ok: true,
    ordineId: String(prep.ordine_id ?? opts.ordineId),
    importoRichiesto,
    importoRimborsato: Number(finale.importo_rimborsato ?? importoRichiesto),
    paymentStatus: String(finale.payment_status ?? "partially_refunded"),
    residuo: Number(finale.residuo ?? residuo),
    refundId: finale.refund_id ?? refundId,
    pending: false,
  };
}
