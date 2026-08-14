"use client";

import { useState } from "react";
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react";

/**
 * Banner stato pagamento (FASE F1).
 * Mostra il reale payment_status dell'ordine letto dal DB e, per i
 * pagamenti in attesa, il pulsante "Riprova pagamento" che riapre Stripe
 * (POST /api/pagamenti/sessioni → redirect alla sessione).
 */
export function PagamentoStatoBanner({
  ordineId,
  paymentStatus,
  paymentPaidAt,
  paymentRefundedAmount,
  esito,
}: {
  ordineId: string;
  paymentStatus: string | null;
  paymentPaidAt?: string | null;
  paymentRefundedAmount?: number | null;
  /** query ?esito=ok | annullato riportata dal redirect Stripe. */
  esito?: string | null;
}) {
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const riprovaPagamento = async () => {
    if (inviando) return;
    setInviando(true);
    setErrore(null);
    try {
      const res = await fetch("/api/pagamenti/sessioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordineId }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { pagamento?: { redirectUrl?: string } };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data?.pagamento?.redirectUrl) {
        setErrore(json.error?.message ?? "Impossibile riaprire il pagamento. Riprova.");
        setInviando(false);
        return;
      }
      window.location.href = json.data.pagamento.redirectUrl;
    } catch {
      setErrore("Errore di rete. Riprova.");
      setInviando(false);
    }
  };

  if (!paymentStatus) return null;

  // ── Pagato ──────────────────────────────────────────────────────────────
  if (paymentStatus === "paid") {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
        <div>
          <p className="text-sm font-bold text-blue-800">Pagamento confermato ✓</p>
          <p className="mt-0.5 text-xs text-blue-700">
            Il pagamento di questo ordine è stato ricevuto
            {paymentPaidAt
              ? ` il ${new Date(paymentPaidAt).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}`
              : ""}.
          </p>
        </div>
      </div>
    );
  }

  // ── Rimborso ─────────────────────────────────────────────────────────────
  if (paymentStatus === "refunded" || paymentStatus === "partially_refunded") {
    const parziale = paymentStatus === "partially_refunded";
    return (
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <p className="font-bold text-slate-700">
          {parziale ? "Rimborso parziale" : "Ordine rimborsato"}
        </p>
        {parziale && paymentRefundedAmount != null && (
          <p className="mt-0.5 text-xs text-slate-500">
            Importo rimborsato: €{Number(paymentRefundedAmount).toFixed(2)}
          </p>
        )}
      </div>
    );
  }

  // ── Scaduto / fallito / annullato ────────────────────────────────────────
  if (paymentStatus === "expired" || paymentStatus === "failed" || paymentStatus === "canceled") {
    return (
      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm font-bold text-blue-700">
          {paymentStatus === "expired"
            ? "Pagamento scaduto"
            : paymentStatus === "failed"
              ? "Pagamento non riuscito"
              : "Pagamento annullato"}
        </p>
        <p className="mt-0.5 text-xs text-blue-600">
          {paymentStatus === "expired"
            ? "L'ordine è stato annullato e le scorte liberate. Puoi effettuare un nuovo acquisto."
            : "Nessun importo è stato addebitato. Puoi riprovare o effettuare un nuovo acquisto."}
        </p>
      </div>
    );
  }

  // ── In attesa (pending) ──────────────────────────────────────────────────
  const annullatoDalloStripe = esito === "annullato";
  return (
    <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3">
      <p className="text-sm font-bold text-yellow-800">Pagamento in attesa di conferma</p>
      <p className="mt-0.5 text-xs text-yellow-700">
        {annullatoDalloStripe
          ? "Hai interrotto il pagamento: nessun importo è stato addebitato."
          : esito === "ok"
            ? "Hai completato il pagamento: stiamo verificando la conferma (di solito è immediata)."
            : "Il pagamento verrà confermato in pochi istanti."}
      </p>
      {errore && (
        <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{errore}</p>
      )}
      <button
        type="button"
        onClick={riprovaPagamento}
        disabled={inviando}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-yellow-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-yellow-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {inviando ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Apertura pagamento...
          </>
        ) : (
          <>
            <RotateCcw className="h-3.5 w-3.5" /> Riprova pagamento
          </>
        )}
      </button>
    </div>
  );
}
