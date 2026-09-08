"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react";

/**
 * P5 — Pagamento in ATTESA per un checkout PAYMENT-FIRST (intento senza
 * ordine). Mostra lo stato reale della sessione e:
 *  - POLLING sicuro: ogni 5s interroga GET /api/pagamenti/sessioni/[id];
 *    quando il webhook cambia lo stato (paid/expired/refunded...) ricarica
 *    la pagina (server component → renderizza l'ordine o lo stato finale).
 *  - RETRY: "Riprova pagamento" con checkoutId = pagamenti_sessioni.id
 *    (POST /api/pagamenti/sessioni) — MAI crea ordini/riserve, solo la
 *    sessione provider, e solo per intenti ancora created/pending.
 *  - MAI dichiara il pagamento fallito prima che la sessione lo dica.
 */
export function CheckoutInAttesa({
  checkoutId,
  esito,
}: {
  checkoutId: string;
  esito?: string | null;
}) {
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let attivo = true;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/pagamenti/sessioni/${encodeURIComponent(checkoutId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          data?: { checkout?: { status?: string } };
        };
        const status = json.data?.checkout?.status;
        if (status && status !== "created" && status !== "pending") {
          // paid → la pagina renderizza l'ordine; expired/refunded → stato finale.
          if (attivo) window.location.reload();
        }
      } catch {
        // Errore di rete: si ritenta al tick successivo.
      }
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      attivo = false;
      clearInterval(timer);
    };
  }, [checkoutId]);

  const riprovaPagamento = async () => {
    if (inviando) return;
    setInviando(true);
    setErrore(null);
    try {
      const res = await fetch("/api/pagamenti/sessioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          pagamento?: { redirectUrl?: string };
          giaConfermato?: boolean;
          ordineId?: string;
        };
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        setErrore(json.error?.message ?? "Impossibile riaprire il pagamento. Riprova.");
        setInviando(false);
        return;
      }
      if (json.data?.giaConfermato && json.data.ordineId) {
        window.location.href = `/ordini/conferma/${encodeURIComponent(json.data.ordineId)}`;
        return;
      }
      if (!json.data?.pagamento?.redirectUrl) {
        setErrore("Impossibile riaprire il pagamento. Riprova.");
        setInviando(false);
        return;
      }
      window.location.href = json.data.pagamento.redirectUrl;
    } catch {
      setErrore("Errore di rete. Riprova.");
      setInviando(false);
    }
  };

  const annullatoDallUtente = esito === "annullato";

  return (
    <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-bold text-yellow-800">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Pagamento in attesa di conferma
      </p>
      <p className="mt-0.5 text-xs text-yellow-700">
        {annullatoDallUtente
          ? "Hai interrotto il pagamento: nessun importo è stato addebitato. L'ordine verrà creato solo al completamento del pagamento."
          : esito === "ok"
            ? "Hai completato il pagamento: stiamo verificando la conferma (di solito è immediata)."
            : "Stiamo verificando il pagamento: non è stato ancora creato alcun ordine."}
      </p>
      {errore && (
        <p className="mt-2 rounded-lg bg-yellow-100 px-3 py-2 text-xs font-semibold text-yellow-800">
          {errore}
        </p>
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
      <p className="mt-2 flex items-center gap-1 text-[11px] text-yellow-600">
        <ShieldCheck className="h-3 w-3" aria-hidden />
        Nessun importo è stato addebitato finché il pagamento non è confermato.
      </p>
    </div>
  );
}