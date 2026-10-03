"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, Truck, X } from "lucide-react";

type Corriere = {
  user_id: string;
  stato: string;
  richiesto_il: string;
  deciso_il: string | null;
  motivo: string | null;
  email: string;
  nome: string;
  cognome: string;
  telefono: string;
};

export default function CorrieriApprovazioni({ iniziali }: { iniziali: Corriere[] }) {
  const [items, setItems] = useState(iniziali);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(userId: string, stato: "approved" | "rejected") {
    setBusy(userId);
    try {
      const response = await fetch("/api/amministratore/corrieri", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, stato }),
      });
      if (!response.ok) throw new Error("Errore");
      setItems((current) => current.map((item) => item.user_id === userId ? { ...item, stato } : item));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Truck className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">Area Corriere Locale</p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">Approvazione corrieri</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Gestisci le richieste dei corrieri locali. L'approvazione usa lo stesso sistema account già presente nella piattaforma.</p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-sm text-slate-500">Nessuna richiesta di corriere locale.</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.user_id} className="card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-base font-black text-slate-900">{item.nome} {item.cognome}</h2>
                  <p className="mt-1 text-sm text-slate-600">{item.email} · {item.telefono || "telefono non indicato"}</p>
                  <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-400"><Clock3 className="h-3.5 w-3.5" />Richiesta {new Date(item.richiesto_il).toLocaleString("it-IT")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{item.stato}</span>
                  {item.stato === "pending" && (
                    <>
                      <button disabled={busy === item.user_id} onClick={() => decide(item.user_id, "approved")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />Approva</button>
                      <button disabled={busy === item.user_id} onClick={() => decide(item.user_id, "rejected")} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"><X className="h-4 w-4" />Rifiuta</button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
