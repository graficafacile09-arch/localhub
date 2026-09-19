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
import { getGatewayProvider } from "./registry";

/** Stato di pagamento finale/parziale di un rimborso (macchina a stati esistente). */
export type StatoRimborso = "refunded" | "partially_refunded";

/** Max lunghezza del motivo del rimborso (nota nello storico). */
export const MAX_MOTIVO_RIMBORSO = 200;

/** Provider gateway rimborsabili via API. */
const PROVIDER_RIMBORSABILI = ["stripe"] as const;

export type EsitoRimborso =
  | {
      ok: true;
      pending: false;
      ordineId: string;
      importoRichiesto: number;
      importoRimborsato: number;
      paymentStatus: string;
      residuo: number;
      refundId: string | null;
      nuovaOperazione: boolean;
    }
  | {
      ok: true;
      pending: true;
      ordineId: string;
      importoRichiesto: number;
      paymentStatus: string;
      residuo: number;
      refundId: string | null;
      nuovaOperazione: boolean;
    }
  | { ok: false; codice: string; errore: string; status: number };

type RispostaOperazione = {
  ok?: boolean;
  codice?: string;
  messaggio?: string;
  esistente?: boolean;
  operazione_id?: string;
  ordine_id?: string;
  provider?: string | null;
  payment_id?: string | null;
  idempotency_key?: string | null;
  importo_richiesto?: number | null;
  payment_status?: string | null;
  payment_refunded_amount?: number | null;
  residuo?: number | null;
  stato?: string | null;
  refund_id?: string | null;
};

type RispostaFinalizzazione = {
  ok?: boolean;
  codice?: string;
  messaggio?: string;
  stato?: string | null;
  refund_id?: string | null;
  payment_status?: string | null;
  residuo?: number | null;
  importo_rimborsato?: number | null;
};

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

/** Registra lo stato durevole dell'operation dopo un errore provider. */
async function aggiornaStatoOperazione(
  db: ReturnType<typeof createAdminSupabaseClient>,
  operationId: string,
  stato: "failed" | "reconciliation_required",
  codice: string,
  dettaglio: string
): Promise<void> {
  try {
    await db.rpc("pagamenti_rimborso_operazione_fallita", {
      p_operazione_id: operationId,
      p_stato: stato,
      p_codice: codice.trim().slice(0, 100) || "RIMBORSO_PROVIDER_FALLITO",
      p_dettaglio: dettaglio.slice(0, 1000),
    });
  } catch {
    // La reconciliation successiva può recuperare l'operation dallo stato
    // ancora presente nel DB.
  }
}

function erroreProviderDeterministico(error: unknown): boolean {
  const e = error as { statusCode?: unknown };
  const statusCode = Number(e?.statusCode);
  return Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 500;
}

function messaggioErroreProvider(error: unknown): string {
  const e = error as { message?: unknown; type?: unknown; code?: unknown };
  const message = typeof e?.message === "string" ? e.message : "";
  const type = typeof e?.type === "string" ? e.type : "";
  const code = typeof e?.code === "string" ? e.code : "";
  return [type, code, message].filter(Boolean).join(": ").slice(0, 1000) ||
    "Errore del provider di pagamento.";
}

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
  if (!opts.ordineId) {
    return { ok: false, codice: "VALIDATION_ERROR", errore: "Ordine non valido.", status: 422 };
  }
  if (!opts.idempotencyKey || opts.idempotencyKey.length > 128) {
    return { ok: false, codice: "VALIDATION_ERROR", errore: "Chiave di idempotenza non valida.", status: 422 };
  }
  if (opts.motivo && opts.motivo.length > MAX_MOTIVO_RIMBORSO) {
    return {
      ok: false,
      codice: "VALIDATION_ERROR",
      errore: "Il motivo supera " + MAX_MOTIVO_RIMBORSO + " caratteri.",
      status: 422,
    };
  }

  const db = createAdminSupabaseClient();

  // 1. Operation durevole: nessun incremento preventivo di payment_refunded_amount.
  const { data: preparata, error: preparaError } = await db.rpc(
    "pagamenti_rimborso_operazione_prepara",
    {
      p_ordine_id: opts.ordineId,
      p_importo: opts.importo,
      p_merchant_user_id: opts.userId,
      p_idempotency_key: opts.idempotencyKey,
    }
  );
  if (preparaError) {
    return { ok: false, codice: "SAVE_FAILED", errore: "Impossibile preparare il rimborso.", status: 500 };
  }

  const prep = (preparata ?? null) as RispostaOperazione | null;
  if (!prep || prep.ok !== true) {
    const codice = String(prep?.codice ?? "SAVE_FAILED");
    const status =
      codice === "FORBIDDEN" ? 403 :
      codice === "ORDINE_NON_TROVATO" ? 404 :
      codice === "IDEMPOTENCY_CONFLICT" ? 409 : 422;
    return {
      ok: false,
      codice,
      errore: String(prep?.messaggio ?? "Rimborso non consentito."),
      status,
    };
  }

  const ordineId = String(prep.ordine_id ?? opts.ordineId);
  const operationId = String(prep.operazione_id ?? "");
  const provider = String(prep.provider ?? "");
  const paymentId = String(prep.payment_id ?? "");
  const operationImporto = Number(prep.importo_richiesto ?? opts.importo);
  const residuo = Number(prep.residuo ?? 0);
  const stato = String(prep.stato ?? "");
  const refundIdEsistente = prep.refund_id ? String(prep.refund_id) : null;
  const operationEsistente = prep.esistente === true;

  if (!operationId || !Number.isFinite(operationImporto) || operationImporto <= 0) {
    return { ok: false, codice: "SAVE_FAILED", errore: "Operazione di rimborso non valida.", status: 500 };
  }

  if (stato === "succeeded") {
    return {
      ok: true,
      pending: false,
      ordineId,
      importoRichiesto: operationImporto,
      importoRimborsato: operationImporto,
      paymentStatus: String(prep.payment_status ?? "refunded"),
      residuo,
      refundId: refundIdEsistente,
      nuovaOperazione: false,
    };
  }

  if (!PROVIDER_RIMBORSABILI.includes(provider as (typeof PROVIDER_RIMBORSABILI)[number]) || !paymentId) {
    await aggiornaStatoOperazione(db, operationId, "failed", "PAGAMENTO_NON_RIMBORSABILE",
      "Nessun pagamento Stripe rimborsabile associato all'operation.");
    return {
      ok: false,
      codice: "PAGAMENTO_NON_RIMBORSABILE",
      errore: "Nessun pagamento gateway rimborsabile su questo ordine.",
      status: 422,
    };
  }

  const gateway = getGatewayProvider(provider);
  if (!gateway) {
    await aggiornaStatoOperazione(db, operationId, "failed", "PROVIDER_NON_DISPONIBILE",
      "Gateway non disponibile.");
    return {
      ok: false,
      codice: "PROVIDER_NON_DISPONIBILE",
      errore: "Il provider di pagamento non è disponibile.",
      status: 422,
    };
  }

  // 2. Connected account risolto server-side.
  const { data: ordineRow, error: ordineError } = await db
    .from("ordini")
    .select("negozio_id")
    .eq("id", ordineId)
    .maybeSingle();
  if (ordineError) {
    await aggiornaStatoOperazione(db, operationId, "reconciliation_required",
      "ORDINE_LOOKUP_FAILED", ordineError.message);
    return {
      ok: true,
      pending: true,
      ordineId,
      importoRichiesto: operationImporto,
      paymentStatus: String(prep.payment_status ?? "pending"),
      residuo,
      refundId: refundIdEsistente,
      nuovaOperazione: !operationEsistente,
    };
  }

  const negozioId = ordineRow?.negozio_id ? String(ordineRow.negozio_id) : "";
  const risolto = negozioId
    ? await risolviCredenzialiGateway(negozioId, provider)
    : { pronto: false as const, cred: null };

  if (!risolto.pronto || !risolto.cred) {
    await aggiornaStatoOperazione(db, operationId, "failed", "PROVIDER_NON_CONFIGURATO",
      "Il metodo di pagamento non è più configurato per il negozio.");
    return {
      ok: false,
      codice: "PROVIDER_NON_CONFIGURATO",
      errore: "Il metodo di pagamento non è più configurato per il negozio.",
      status: 422,
    };
  }

  // 3. Claim atomico. Un lease scaduto può essere ripreso con la stessa
  // idempotency key Stripe.
  const { data: claimData, error: claimError } = await db.rpc(
    "pagamenti_rimborso_operazione_claim",
    { p_operazione_id: operationId }
  );
  if (claimError) {
    return {
      ok: true,
      pending: true,
      ordineId,
      importoRichiesto: operationImporto,
      paymentStatus: String(prep.payment_status ?? "pending"),
      residuo,
      refundId: refundIdEsistente,
      nuovaOperazione: !operationEsistente,
    };
  }

  const claim = (claimData ?? null) as {
    ok?: boolean;
    claimed?: boolean;
    stato?: string;
    refund_id?: string | null;
  } | null;

  if (!claim || claim.ok !== true) {
    return { ok: false, codice: "CLAIM_FAILED", errore: "Impossibile prendere in carico il rimborso.", status: 500 };
  }

  if (claim.claimed !== true) {
    if (claim.stato === "succeeded") {
      return {
        ok: true,
        pending: false,
        ordineId,
        importoRichiesto: operationImporto,
        importoRimborsato: operationImporto,
        paymentStatus: "refunded",
        residuo,
        refundId: claim.refund_id ? String(claim.refund_id) : refundIdEsistente,
        nuovaOperazione: false,
      };
    }
    return {
      ok: true,
      pending: true,
      ordineId,
      importoRichiesto: operationImporto,
      paymentStatus: String(prep.payment_status ?? "pending"),
      residuo,
      refundId: refundIdEsistente,
      nuovaOperazione: !operationEsistente,
    };
  }

  // 4. Stripe Direct Charge: application fee rimborsata nello stesso refund.
  let refundId: string | null = null;
  try {
    const esito = await gateway.rimborsa(
      paymentId,
      operationImporto,
      risolto.cred,
      {
        idempotencyKey: String(prep.idempotency_key ?? opts.idempotencyKey),
        operationId,
      }
    );
    refundId = esito.refundId ?? null;
  } catch (error) {
    // Esito indeterminato: prima cerchiamo su Stripe lo stesso operation_id.
    try {
      const giaCreato = gateway.riconciliaRimborso
        ? await gateway.riconciliaRimborso(paymentId, operationImporto, risolto.cred, operationId)
        : null;
      if (giaCreato?.refundId) refundId = giaCreato.refundId;
    } catch {
      // Resta reconciliation_required: il webhook o un retry con la stessa
      // idempotency key possono chiudere l'operation senza doppio refund.
    }

    if (!refundId) {
      const dettaglio = messaggioErroreProvider(error);
      const statoErrore = erroreProviderDeterministico(error) ? "failed" : "reconciliation_required";
      await aggiornaStatoOperazione(db, operationId, statoErrore,
        "RIMBORSO_PROVIDER_FALLITO", dettaglio);

      if (statoErrore === "reconciliation_required") {
        return {
          ok: true,
          pending: true,
          ordineId,
          importoRichiesto: operationImporto,
          paymentStatus: String(prep.payment_status ?? "pending"),
          residuo,
          refundId: null,
          nuovaOperazione: !operationEsistente,
        };
      }

      return {
        ok: false,
        codice: "RIMBORSO_PROVIDER_FALLITO",
        errore: "Il provider ha rifiutato il rimborso.",
        status: 502,
      };
    }
  }

  if (!refundId) {
    await aggiornaStatoOperazione(db, operationId, "reconciliation_required",
      "REFUND_ID_MANCANTE", "Stripe ha risposto senza un Refund ID.");
    return {
      ok: true,
      pending: true,
      ordineId,
      importoRichiesto: operationImporto,
      paymentStatus: String(prep.payment_status ?? "pending"),
      residuo,
      refundId: null,
      nuovaOperazione: !operationEsistente,
    };
  }

  // 5. Finalizzazione atomica: operation + ordine + payment_status.
  const { data: finalData, error: finalError } = await db.rpc(
    "pagamenti_rimborso_operazione_completa",
    {
      p_operazione_id: operationId,
      p_refund_id: refundId,
    }
  );

  if (finalError) {
    return {
      ok: true,
      pending: true,
      ordineId,
      importoRichiesto: operationImporto,
      paymentStatus: String(prep.payment_status ?? "pending"),
      residuo,
      refundId,
      nuovaOperazione: !operationEsistente,
    };
  }

  const finale = (finalData ?? null) as RispostaFinalizzazione | null;
  if (!finale || finale.ok !== true) {
    return {
      ok: true,
      pending: true,
      ordineId,
      importoRichiesto: operationImporto,
      paymentStatus: String(finale?.payment_status ?? prep.payment_status ?? "pending"),
      residuo: Number(finale?.residuo ?? residuo),
      refundId,
      nuovaOperazione: !operationEsistente,
    };
  }

  const paymentStatus = String(
    finale.payment_status ??
      (Number(finale.residuo ?? 0) <= 0 ? "refunded" : "partially_refunded")
  );
  const importoRimborsato = Number(finale.importo_rimborsato ?? operationImporto);
  const residuoFinale = Number(finale.residuo ?? Math.max(0, residuo));

  await registraEventoStorico({
    ordineId,
    importo: importoRimborsato,
    stato: paymentStatus === "refunded" ? "refunded" : "partially_refunded",
    motivo: opts.motivo,
    autoreId: opts.userId,
  });

  return {
    ok: true,
    pending: false,
    ordineId,
    importoRichiesto: operationImporto,
    importoRimborsato,
    paymentStatus,
    residuo: residuoFinale,
    refundId: String(finale.refund_id ?? refundId),
    nuovaOperazione: !operationEsistente,
  };
}

