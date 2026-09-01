"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { RotateCcw, X } from "lucide-react";

type Props = {
  ordineId: string;
  totale: number;
  paymentStatus: string | null;
  paymentAmount: number | null;
  paymentRefundedAmount: number | null;
  commissionePercentuale: number | null;
  commissioneImporto: number | null;
  nettoVenditore: number | null;
};

function formattaEuro(v: number | null): string {
  return `€${(v || 0).toFixed(2).replace(".", ",")}`;
}

/**
 * Sezione Rimborso (Area Amministratore): riepilogo pagamento + pulsante
 * "Rimborsa" con dialog (totale preselezionato / parziale, motivo opzionale,
 * importo massimo indicato). Tutta la validazione è server-side (API + RPC);
 * qui il client disabilita il pulsante quando l'ordine non è rimborsabile e
 * previene il doppio click durante la richiesta.
 */
export default function RimborsoSection({
  ordineId,
  totale,
  paymentStatus,
  paymentAmount,
  paymentRefundedAmount,
  commissionePercentuale,
  commissioneImporto,
  nettoVenditore,
}: Props) {
  const router = useRouter();
  const giaRimborsato = paymentRefundedAmount ?? 0;
  const pagato = paymentAmount ?? totale;
  const residuo = Math.max(0, Math.round((pagato - giaRimborsato) * 100) / 100);

  const rimborsabile =
    (paymentStatus === "paid" || paymentStatus === "partially_refunded") &&
    residuo > 0;

  const [aperto, setAperto] = useState(false);
  const [importo, setImporto] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);

  const apriDialog = useCallback(() => {
    setImporto(residuo.toFixed(2));
    setMotivo("");
    setErrore(null);
    setSuccesso(null);
    setAperto(true);
  }, [residuo]);

  const importoNum = Number(importo);
  const importoValido =
    Number.isFinite(importoNum) &&
    importoNum > 0 &&
    Math.round(importoNum * 100) / 100 === importoNum &&
    importoNum <= residuo;

  const conferma = async () => {
    if (!importoValido || inviando) return;
    setInviando(true);
    setErrore(null);
    setSuccesso(null);
    try {
      const res = await fetch(`/api/amministratore/ordini/${ordineId}/rimborso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(importoNum * 100) / 100,
          reason: motivo.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: { code?: string; message?: string };
        data?: {
          success?: boolean;
          importoRimborsato?: number;
          paymentStatus?: string;
          residuo?: number;
        };
      };
      if (!res.ok || !json.data?.success) {
        setErrore(json.error?.message ?? "Rimborso non riuscito.");
        return;
      }
      setSuccesso(
        `Rimborso di ${formattaEuro(json.data.importoRimborsato ?? 0)} registrato (${json.data.paymentStatus === "refunded" ? "totale" : "parziale"}).`
      );
      setAperto(false);
      router.refresh();
    } catch {
      setErrore("Errore di rete. Riprova.");
    } finally {
      setInviando(false);
    }
  };

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <RotateCcw className="h-4 w-4" aria-hidden />
        </span>
        Rimborso
      </p>

      {/* Riepilogo economico */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Totale ordine</span>
          <span className="font-semibold text-slate-800">{formattaEuro(pagato)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Già rimborsato</span>
          <span className="font-semibold text-slate-800">{formattaEuro(giaRimborsato)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Residuo rimborsabile</span>
          <span className="font-bold text-slate-900">{formattaEuro(residuo)}</span>
        </div>
        {commissionePercentuale != null && commissioneImporto != null && (
          <>
            <div className="flex justify-between">
              <span className="text-slate-500">Commissione piattaforma</span>
              <span className="font-semibold text-slate-800">
                {formattaEuro(commissioneImporto)}
                <span className="ml-1 text-[11px] text-slate-400">({commissionePercentuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%)</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Netto venditore</span>
              <span className="font-semibold text-slate-800">{formattaEuro(nettoVenditore)}</span>
            </div>
          </>
        )}
      </div>

      {/* Azione */}
      {rimborsabile ? (
        <button
          type="button"
          onClick={apriDialog}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-500 active:bg-red-700"
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> Rimborsa
        </button>
      ) : (
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-500 ring-1 ring-slate-200">
          {paymentStatus === "refunded"
            ? "Ordine già rimborsato: nessun importo residuo."
            : paymentStatus === "paid" || paymentStatus === "partially_refunded"
              ? "Nessun importo residuo da rimborsare."
              : `Rimborso non disponibile (stato pagamento: ${paymentStatus ?? "nessun pagamento"}).`}
        </div>
      )}

      {successo && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
          {successo}
        </p>
      )}

      {/* ── Dialog rimborso ─────────────────────────────────────────────── */}
      {aperto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !inviando && setAperto(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
            <button
              type="button"
              onClick={() => !inviando && setAperto(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Chiudi"
            >
              <X className="h-4 w-4" />
            </button>

            <p className="text-sm font-black uppercase tracking-wide text-slate-900">
              Rimborso
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Rimborso totale preselezionato. Puoi inserire un importo parziale.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700" htmlFor="rimborso-importo">
                  Importo (EUR)
                </label>
                <input
                  id="rimborso-importo"
                  type="number"
                  min="0.01"
                  max={residuo}
                  step="0.01"
                  value={importo}
                  onChange={(e) => setImporto(e.target.value)}
                  disabled={inviando}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Importo massimo rimborsabile: {formattaEuro(residuo)}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700" htmlFor="rimborso-motivo">
                  Motivo (opzionale)
                </label>
                <textarea
                  id="rimborso-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={inviando}
                  rows={2}
                  maxLength={200}
                  placeholder="Es. articolo non disponibile, richiesta cliente…"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Riepilogo prima della conferma */}
              <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs ring-1 ring-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-500">Importo da rimborsare</span>
                  <span className="font-bold text-slate-900">{formattaEuro(importoNum)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-slate-500">Residuo dopo il rimborso</span>
                  <span className="font-semibold text-slate-700">
                    {formattaEuro(Math.max(0, Math.round((residuo - (importoNum || 0)) * 100) / 100))}
                  </span>
                </div>
              </div>

              {errore && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                  {errore}
                </p>
              )}
              {!importoValido && importo !== "" && (
                <p className="text-[11px] text-red-600">
                  Importo non valido: deve essere maggiore di 0, con massimo 2 decimali e non oltre {formattaEuro(residuo)}.
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => !inviando && setAperto(false)}
                  disabled={inviando}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={conferma}
                  disabled={!importoValido || inviando}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {inviando ? "Rimborso in corso…" : "Conferma rimborso"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
