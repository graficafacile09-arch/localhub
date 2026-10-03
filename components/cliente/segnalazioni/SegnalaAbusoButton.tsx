"use client";

import { useState } from "react";
import { Flag, Loader2, Send, ShieldAlert, X } from "lucide-react";

type TargetType = "negozio" | "prodotto";

type Props = {
  targetType: TargetType;
  targetId?: string | null;
  targetName: string;
  negozioId?: string | null;
  className?: string;
};

const MOTIVI = [
  ["contenuto_non_conforme", "Prodotto o contenuto non conforme"],
  ["informazioni_false", "Informazioni false o fuorvianti"],
  ["comportamento_scorretto", "Comportamento commerciale scorretto"],
  ["tentata_truffa", "Tentata truffa o comportamento sospetto"],
  ["contenuto_vietato", "Contenuto vietato o contrario alle regole"],
  ["altro", "Altro"],
] as const;

export default function SegnalaAbusoButton({
  targetType,
  targetId,
  targetName,
  negozioId,
  className = "",
}: Props) {
  const [aperto, setAperto] = useState(false);
  const [motivo, setMotivo] = useState<string>(MOTIVI[0][0]);
  const [descrizione, setDescrizione] = useState("");
  const [inviando, setInviando] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const chiudi = () => {
    if (!inviando) {
      setAperto(false);
      setMessaggio(null);
    }
  };

  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descrizione.trim()) return;

    setInviando(true);
    setMessaggio(null);

    const motivoLabel =
      MOTIVI.find(([value]) => value === motivo)?.[1] ?? "Altro";

    try {
      const res = await fetch("/api/cliente/segnalazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "comportamento",
          titolo: `Segnalazione abuso/violazione — ${targetName}`,
          descrizione: `Motivo: ${motivoLabel}\n\n${descrizione.trim()}`,
          target_type: targetType,
          // I prodotti di InCittà hanno ID bigint mentre target_id della
          // tabella segnalazioni è UUID: per i prodotti manteniamo il
          // riferimento leggibile in target_name e nel negozio_id.
          target_id: targetType === "negozio" ? targetId ?? null : null,
          target_name: targetName.trim().slice(0, 200),
          negozio_id: negozioId ?? (targetType === "negozio" ? targetId ?? null : null),
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.status === 401 || res.status === 403) {
        throw new Error("Per inviare una segnalazione devi accedere al tuo account InCittà.");
      }
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Impossibile inviare la segnalazione.");
      }

      setMessaggio("Segnalazione inviata. Il team InCittà la prenderà in carico.");
      setDescrizione("");
    } catch (err) {
      setMessaggio(err instanceof Error ? err.message : "Si è verificato un errore.");
    } finally {
      setInviando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessaggio(null);
          setAperto(true);
        }}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 ${className}`}
        aria-label={`Segnala abuso o violazione per ${targetName}`}
      >
        <Flag className="h-3.5 w-3.5" aria-hidden />
        Segnala abuso / violazione
      </button>

      {aperto && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="segnala-abuso-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) chiudi();
          }}
        >
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
              <div>
                <div className="flex items-center gap-2 text-red-700">
                  <ShieldAlert className="h-5 w-5" aria-hidden />
                  <p className="text-[11px] font-black uppercase tracking-[0.18em]">
                    Segnalazione
                  </p>
                </div>
                <h2 id="segnala-abuso-title" className="mt-1 text-xl font-black text-slate-900">
                  Abuso o violazione delle regole
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Stai segnalando <strong>{targetName}</strong>. La segnalazione sarà valutata dall'amministrazione.
                </p>
              </div>
              <button
                type="button"
                onClick={chiudi}
                disabled={inviando}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Chiudi"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <form onSubmit={invia} className="space-y-5 p-5">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Motivo
                </label>
                <select
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={inviando}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                >
                  {MOTIVI.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Descrivi cosa hai riscontrato <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={6}
                  value={descrizione}
                  onChange={(e) => setDescrizione(e.target.value)}
                  disabled={inviando}
                  placeholder="Indica i fatti e, se possibile, cosa non rispetta le regole."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Non inserire password, dati bancari o altre informazioni sensibili.
                </p>
              </div>

              {messaggio && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm font-semibold leading-5 text-blue-800">
                  {messaggio}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={chiudi}
                  disabled={inviando}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Chiudi
                </button>
                <button
                  type="submit"
                  disabled={inviando || descrizione.trim().length < 10}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {inviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Invia segnalazione
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
