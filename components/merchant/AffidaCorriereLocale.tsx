"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Truck, UserRound } from "lucide-react";

type Courier = { userId: string; nome: string; cognome: string; email: string };
type Props = { negozioId: string; ordineId: string };

export default function AffidaCorriereLocale({ negozioId, ordineId }: Props) {
  const [corrieri, setCorrieri] = useState<Courier[]>([]);
  const [selected, setSelected] = useState("");
  const [stato, setStato] = useState<"da_assegnare" | "assegnata" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/merchant/stores/${negozioId}/ordini/${ordineId}/corriere-locale`,
        { cache: "no-store" }
      );
      const json = await response.json();
      if (!response.ok) {
        setError(json?.error?.message ?? "Impossibile caricare i corrieri.");
        return;
      }
      setCorrieri(json?.data?.corrieri ?? []);
      setSelected(json?.data?.consegna?.corriere_user_id ?? "");
      setStato(json?.data?.consegna?.stato ?? "da_assegnare");
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [negozioId, ordineId]);

  async function affida() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/merchant/stores/${negozioId}/ordini/${ordineId}/corriere-locale`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ corriereUserId: selected }),
        }
      );
      const json = await response.json();
      if (!response.ok) {
        setError(json?.error?.message ?? "Impossibile affidare la consegna.");
        return;
      }
      setStato("assegnata");
      setMessage("Consegna affidata al corriere. Il corriere può ora gestirla dalla sua area.");
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-[1.75rem] border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-semibold text-blue-800">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Caricamento affidamento corriere…
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[1.75rem] border-2 border-blue-200 bg-gradient-to-br from-blue-50 via-white to-yellow-50 p-5 shadow-sm ring-1 ring-blue-50">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
            <Truck className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Consegna locale</p>
            <h2 className="mt-1 text-xl font-black text-slate-900">Affida corriere</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
              Scegli il corriere locale approvato che dovrà prendere in carico questo ordine.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-600 ring-1 ring-slate-200">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          {stato === "assegnata" ? "Affidato" : "Da assegnare"}
        </span>
      </div>

      {corrieri.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-black">Nessun corriere approvato disponibile</p>
          <p className="mt-1 text-xs leading-5">Un amministratore deve approvare almeno un account corriere prima di poter affidare la consegna.</p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor={`corriere-locale-${ordineId}`} className="text-xs font-black uppercase tracking-wide text-slate-500">
              Corriere approvato
            </label>
            <select
              id={`corriere-locale-${ordineId}`}
              value={selected}
              onChange={(event) => { setSelected(event.target.value); setMessage(null); setError(null); }}
              disabled={saving}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Seleziona un corriere…</option>
              {corrieri.map((courier) => (
                <option key={courier.userId} value={courier.userId}>
                  {courier.nome} {courier.cognome}{courier.email ? ` — ${courier.email}` : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void affida()}
            disabled={!selected || saving}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 text-sm font-black text-blue-900 shadow-sm transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Truck className="h-4 w-4" aria-hidden />}
            {saving ? "Affidamento…" : "Affida corriere"}
          </button>
        </div>
      )}

      {message && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {message}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
