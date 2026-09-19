"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, FileText } from "lucide-react";

const VERSIONE = "2026-09-v1";

export default function VenditoreTermini({ storeId }: { storeId: string }) {
  const [accettati, setAccettati] = useState(false);
  const [checked, setChecked] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/merchant/stores/${storeId}/termini-venditore`)
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        setAccettati(j?.data?.accettati === true);
        setAcceptedAt(j?.data?.accettazione?.accettato_at ?? null);
      })
      .catch(() => mounted && setError("Impossibile verificare i termini."))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [storeId]);

  async function accept() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/merchant/stores/${storeId}/termini-venditore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accetta: true, versione: VERSIONE }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error?.message ?? "Impossibile registrare l'accettazione.");
      setAccettati(true);
      setAcceptedAt(j.data?.accettazione?.accettato_at ?? new Date().toISOString());
      setChecked(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile registrare l'accettazione.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Verifica termini…</p>;

  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-4 ${accettati ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        {accettati ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" /> : <CircleAlert className="mt-0.5 h-5 w-5 text-amber-700" />}
        <div>
          <p className="font-bold text-slate-900">{accettati ? "Termini accettati" : "Accettazione necessaria"}</p>
          <p className="mt-1 text-sm text-slate-600">
            Versione {VERSIONE}{acceptedAt ? ` · accettata il ${new Date(acceptedAt).toLocaleString("it-IT")}` : ""}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
        <div className="mb-3 flex items-center gap-2 font-bold text-slate-900">
          <FileText className="h-4 w-4 text-blue-700" /> Condizioni operative del venditore
        </div>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Il venditore è responsabile dei prodotti o servizi pubblicati, dei relativi prezzi e della loro disponibilità.</li>
          <li>Il venditore è responsabile degli obblighi fiscali, commerciali e informativi applicabili alla propria attività.</li>
          <li>Il venditore gestisce gli ordini, la consegna o il ritiro e gli adempimenti relativi a resi, rimborsi e reclami di propria competenza.</li>
          <li>Il venditore deve mantenere corretti e aggiornati i propri dati identificativi e di contatto.</li>
          <li>InCittà fornisce la piattaforma digitale e le funzionalità tecniche di intermediazione; l'accettazione non trasferisce a InCittà gli obblighi propri del venditore.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">Questa schermata registra la versione accettata. Il testo contrattuale definitivo dovrà essere allineato ai documenti legali pubblicati da InCittà prima dell'attivazione commerciale.</p>
      </div>

      {!accettati && (
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>Dichiaro di aver letto e di accettare le condizioni operative del venditore, versione {VERSIONE}.</span>
        </label>
      )}

      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      {!accettati && (
        <button type="button" disabled={!checked || saving} onClick={accept} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {saving ? "Registrazione…" : "Accetta e registra"}
        </button>
      )}
    </div>
  );
}
