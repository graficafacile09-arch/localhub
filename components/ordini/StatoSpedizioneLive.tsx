"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, RefreshCw, Truck } from "lucide-react";
import type { StatoSpedizione } from "@/lib/cliente/types";
import { etichettaStatoSpedizione } from "@/lib/merchant/ordini-spedizioni";

const steps: { value: StatoSpedizione; label: string }[] = [
  { value: "non_affidata", label: "Da affidare" },
  { value: "affidata", label: "Affidata al corriere" },
  { value: "in_transito", label: "In transito" },
  { value: "consegnata", label: "Consegnata" },
];

const order = ["non_affidata", "affidata", "in_transito", "consegnata"] as const;

function indexOfState(stato: StatoSpedizione | null) {
  if (!stato) return -1;
  return order.indexOf(stato as (typeof order)[number]);
}

export default function StatoSpedizioneLive({
  ordineId,
  statoIniziale,
  compatto = false,
}: {
  ordineId: string;
  statoIniziale: StatoSpedizione | null;
  compatto?: boolean;
}) {
  const [stato, setStato] = useState<StatoSpedizione | null>(statoIniziale);
  const [problema, setProblema] = useState(false);
  const [aggiornamento, setAggiornamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function aggiorna() {
    setAggiornamento(true);
    try {
      const r = await fetch(`/api/ordini/${ordineId}/stato-spedizione`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Impossibile aggiornare lo stato.");
      const next = (j.data?.statoSpedizione ?? null) as StatoSpedizione | null;
      setProblema(next === "problema");
      if (next) setStato(next);
      setErrore(null);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Aggiornamento non disponibile.");
    } finally {
      setAggiornamento(false);
    }
  }

  useEffect(() => {
    void aggiorna();
    const timer = window.setInterval(() => void aggiorna(), 5000);
    return () => window.clearInterval(timer);
  }, [ordineId]);

  const current = indexOfState(stato);
  const label = etichettaStatoSpedizione(stato);

  return (
    <section className={`rounded-2xl border p-4 ${problema ? "border-amber-200 bg-amber-50" : "border-blue-100 bg-blue-50/40"} ${compatto ? "" : "shadow-sm"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
              <Truck className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[.16em] text-blue-700">Consegna locale</p>
              <p className="text-sm font-black text-slate-900">
                {problema ? "Problema di consegna" : label ?? "In attesa di affidamento"}
              </p>
            </div>
          </div>
        </div>
        <button type="button" onClick={() => void aggiorna()} disabled={aggiornamento} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50" title="Aggiorna stato">
          {aggiornamento ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Aggiorna
        </button>
      </div>

      {problema ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800">
          Il corriere ha segnalato un problema. Lo stato operativo può riprendere quando la consegna viene riattivata.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {steps.map((step, i) => {
            const done = current >= i;
            const active = current === i;
            return (
              <div key={step.value} className="flex items-center gap-2">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? "bg-blue-700 text-white" : "bg-white text-slate-300 ring-1 ring-slate-200"}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </span>
                <span className={`text-xs leading-4 ${active ? "font-black text-blue-800" : done ? "font-semibold text-slate-700" : "text-slate-400"}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {errore && <p className="mt-3 text-xs font-semibold text-slate-500">{errore}</p>}
      <p className="mt-3 text-[11px] text-slate-400">Aggiornamento automatico ogni 5 secondi.</p>
    </section>
  );
}
