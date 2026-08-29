"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Circle, Rocket, Loader2 } from "lucide-react";
import {
  getElementiMancantiDinamici,
  isProntoPerPubblicazioneDinamico,
  getSezioniVisibili,
} from "../editor-sections";
import type { StepProps } from "../editor-steps";

export type PubblicazioneProps = StepProps & {
  /** Numero di servizi strutturati attivi (per i controlli per-modulo). */
  servizi?: number;
};

export default function StepPubblicazione({
  storeId,
  store,
  counts,
  onDataChanged,
  servizi = 0,
}: PubblicazioneProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const attivo = store?.attivo !== false;
  const conte = { ...counts, servizi };
  const mancanti = getElementiMancantiDinamici(store, conte);
  const pronto = isProntoPerPubblicazioneDinamico(store, conte);

  async function handlePublish(target: boolean) {
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attivo: target }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Operazione non riuscita.");
        return;
      }
      setDone(true);
      onDataChanged();
    } catch {
      setError("Errore di connessione.");
    } finally {
      setSaving(false);
    }
  }

  const sezioni = getSezioniVisibili(store);

  return (
    <div className="space-y-6">
      {/* Riepilogo stato */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-900">Riepilogo del negozio</h3>
        <div className="space-y-2">
          {sezioni
            .filter((s) => s.sezione.id !== "pubblicazione")
            .map(({ sezione, blocchi }) => {
              const haBlocchi = blocchi.length > 0;
              return (
                <div
                  key={sezione.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-2.5"
                >
                  <span className="w-7 shrink-0 text-[11px] font-black text-slate-400">
                    {sezione.numero}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                    {sezione.titolo}
                    {sezione.id === "catalogo" && haBlocchi && (
                      <span className="ml-2 text-[10px] font-medium text-slate-400">
                        {conte.prodotti > 0 || conte.servizi > 0
                          ? `${conte.prodotti + conte.servizi} elementi`
                          : "vuoto"}
                      </span>
                    )}
                  </span>
                  {!haBlocchi ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                      Non richiesta
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      <CheckCircle2 className="h-3 w-3" /> Configurabile
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      </section>

      {/* Cosa manca */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-900">
          {pronto ? "Tutto pronto!" : "Per pubblicare servono ancora:"}
        </h3>
        {mancanti.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
            <CheckCircle2 className="h-4 w-4" /> Il negozio ha tutti i contenuti essenziali.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {mancanti.map((m) => (
              <li key={m} className="flex items-center gap-2 text-xs text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                {m}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
          {error}
        </p>
      )}
      {done && (
        <p className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
          <CheckCircle2 className="h-4 w-4" />
          {attivo ? "Negozio aggiornato e pubblicato." : "Negozio messo in bozza."}
        </p>
      )}

      {/* Azioni */}
      <div className="flex flex-col gap-2 sm:flex-row">
        {attivo ? (
          <>
            <button
              type="button"
              onClick={() => handlePublish(true)}
              disabled={saving}
              className="btn-cta h-12 flex-1 gap-2 px-6 text-sm disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Aggiorna negozio
            </button>
            <button
              type="button"
              onClick={() => handlePublish(false)}
              disabled={saving}
              className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Metti in bozza
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => handlePublish(true)}
            disabled={saving || !pronto}
            className="btn-cta h-12 flex-1 gap-2 px-6 text-sm disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Pubblica negozio
          </button>
        )}
      </div>
      {!pronto && !attivo && (
        <p className="text-center text-[11px] text-slate-400">
          Completa gli elementi mancanti prima di pubblicare il negozio.
        </p>
      )}
    </div>
  );
}