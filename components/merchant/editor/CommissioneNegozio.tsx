"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Percent, Save } from "lucide-react";
import type { Negozio } from "@/types/negozio";

type Props = {
  storeId: string;
  store: Negozio;
  onDataChanged: () => void;
};

/** Valore massimo configurabile (coerente con il CHECK SQL 0–10). */
const MASSIMO_COMMISSIONE = 10;

/**
 * COMMISSIONE PIATTAFORMA PER NEGOZIO — riservata all'Area Amministratore.
 * Il campo viene renderizzato SOLO quando StoreEditor riceve area="admin"
 * (vedi StepCommerciale); il salvataggio è ulteriormente protetto lato API
 * (solo admin autorizzato). Vuoto = NULL = commissione globale di fallback.
 */
export default function CommissioneNegozio({ storeId, store, onDataChanged }: Props) {
  const [commissione, setCommissione] = useState<string>(() =>
    store.commissione_percentuale == null ? "" : String(store.commissione_percentuale)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sincronizza il campo quando il negozio viene ricaricato (es. dopo un salvataggio).
  useEffect(() => {
    setCommissione(
      store.commissione_percentuale == null ? "" : String(store.commissione_percentuale)
    );
  }, [store.commissione_percentuale]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const testo = commissione.trim();
      let valore: number | null = null;
      if (testo !== "") {
        const n = Number(testo);
        if (!Number.isFinite(n) || n < 0 || n > MASSIMO_COMMISSIONE) {
          setError("Valore non valido: consentito 0,00%–10,00%.");
          return;
        }
        valore = Math.round(n * 100) / 100;
      }

      const risposta = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissione_percentuale: valore }),
      });
      const json = (await risposta.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
      } | null;

      if (!risposta.ok || !json?.success) {
        setError(json?.error?.message ?? "Salvataggio non riuscito.");
        return;
      }

      setSaved(true);
      onDataChanged();
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Errore di connessione durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
          <Percent className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-slate-900">Commissione piattaforma</h3>
          <p className="text-xs leading-5 text-slate-400">
            Percentuale specifica di questo negozio. Vuoto = usa la commissione globale.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4">
        <div className="min-w-0">
          <label
            htmlFor="commissione-percentuale"
            className="block text-xs font-bold uppercase tracking-wider text-slate-500"
          >
            Commissione piattaforma
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="commissione-percentuale"
              type="number"
              inputMode="decimal"
              min={0}
              max={10}
              step={0.01}
              value={commissione}
              onChange={(evento) => setCommissione(evento.target.value)}
              placeholder="globale"
              className="w-44 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 transition focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <span className="text-sm font-semibold text-slate-500">%</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-slate-400">
            0,00%–10,00% · vuoto = commissione globale
          </p>
          {error && (
            <p className="mt-1.5 text-[11px] font-semibold text-red-600">{error}</p>
          )}
          {saved && !error && (
            <p className="mt-1.5 text-[11px] font-semibold text-green-600">
              Commissione salvata.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-yellow-400 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Salva
        </button>
      </div>
    </section>
  );
}
