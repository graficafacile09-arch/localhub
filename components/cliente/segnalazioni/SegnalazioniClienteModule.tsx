"use client";

import { useState } from "react";
import { Flag, Loader2, Send, ShieldAlert } from "lucide-react";
import type { SegnalazioneTipo } from "@/lib/segnalazioni/types";
import { TIPO_LABELS } from "@/lib/segnalazioni/types";

export default function SegnalazioniClienteModule() {
  const [tipo, setTipo] = useState<SegnalazioneTipo>("altro");
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [inviando, setInviando] = useState(false);
  const [messaggio, setMessaggio] = useState<{ tipo: "ok" | "errore"; testo: string } | null>(null);

  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titolo.trim() || !descrizione.trim()) return;

    setInviando(true);
    setMessaggio(null);

    try {
      const res = await fetch("/api/cliente/segnalazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          titolo: titolo.trim(),
          descrizione: descrizione.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Impossibile inviare la segnalazione.");
      }

      setMessaggio({
        tipo: "ok",
        testo: "Segnalazione inviata con successo! Un amministratore la prenderà in carico al più presto.",
      });
      setTitolo("");
      setDescrizione("");
      setTipo("altro");
    } catch (err) {
      setMessaggio({
        tipo: "errore",
        testo: err instanceof Error ? err.message : "Si è verificato un errore.",
      });
    } finally {
      setInviando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <Flag className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Supporto & Segnalazioni
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Segnala un problema
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Hai riscontrato un problema tecnico, un errore nei dati di un negozio o un contenuto non idoneo? Invia una segnalazione al team di InCittà.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        {messaggio && (
          <div
            className={`mb-6 rounded-2xl p-4 text-sm font-semibold flex items-start gap-3 ${
              messaggio.tipo === "ok"
                ? "bg-blue-50 text-blue-800 border border-blue-200"
                : "bg-blue-50 text-blue-800 border border-blue-200"
            }`}
          >
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{messaggio.testo}</p>
          </div>
        )}

        <form onSubmit={invia} className="space-y-5 max-w-2xl">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Tipo di segnalazione
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as SegnalazioneTipo)}
              className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {Object.entries(TIPO_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Oggetto / Titolo <span className="text-blue-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Es. Orari errati per la Pizzeria Da Luigi"
              className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Descrizione dettagliata <span className="text-blue-500">*</span>
            </label>
            <textarea
              required
              rows={5}
              maxLength={5000}
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Descrivi in dettaglio il problema riscontrato..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <button
            type="submit"
            disabled={inviando || !titolo.trim() || !descrizione.trim()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-yellow-300 to-yellow-400 px-6 text-sm font-bold text-slate-800 shadow-md shadow-yellow-400/30 ring-1 ring-yellow-300 transition hover:from-yellow-200 hover:to-yellow-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {inviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Invia segnalazione
          </button>
        </form>
      </div>
    </div>
  );
}