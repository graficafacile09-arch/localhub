"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Circle, Rocket, Loader2 } from "lucide-react";
import {
  EDITOR_STEPS,
  statoStep,
  getElementiMancanti,
  isProntoPerPubblicazione,
} from "../editor-steps";
import type { StepProps } from "../editor-steps";

export default function StepPubblicazione({ storeId, store, counts, onDataChanged }: StepProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const attivo = store?.attivo !== false;
  const mancanti = getElementiMancanti(store, counts);
  const pronto = isProntoPerPubblicazione(store, counts);

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

  return (
    <div className="space-y-6">
      {/* Riepilogo stato */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-900">Riepilogo del negozio</h3>
        <div className="space-y-2">
          {EDITOR_STEPS.filter((s) => s.id !== "anteprima" && s.id !== "pubblicazione").map((s) => {
            const stato = statoStep(s.id, store, counts);
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-2.5">
                <span className="w-7 shrink-0 text-[11px] font-black text-slate-400">{s.numero}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{s.titolo}</span>
                {stato === "completata" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                    <CheckCircle2 className="h-3 w-3" /> Completata
                  </span>
                ) : stato === "attenzione" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-bold text-yellow-700">
                    <AlertTriangle className="h-3 w-3" /> Da completare
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    <Circle className="h-3 w-3" /> Da completare
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
