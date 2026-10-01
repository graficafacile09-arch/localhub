"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verificaAccessoProdotto18 } from "@/lib/age-gate";

type Props = {
  prodottoId: string;
  bloccato: boolean;
};

export default function ProductAgeGate({ prodottoId, bloccato }: Props) {
  const [mese, setMese] = useState("");
  const [anno, setAnno] = useState("");
  const [errore, setErrore] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrore("");

    if (!mese || !anno) {
      setErrore("Inserisci mese e anno di nascita.");
      return;
    }

    startTransition(async () => {
      const result = await verificaAccessoProdotto18(prodottoId, mese, anno);

      if (result.ok) {
        router.refresh();
        return;
      }

      if (result.reason === "underage") {
        setErrore("Accesso negato. Questo prodotto è riservato ai maggiorenni.");
      } else if (result.reason === "unavailable") {
        setErrore("Non è stato possibile verificare il prodotto. Riprova.");
      } else {
        setErrore("Inserisci una data di nascita valida.");
      }
    });
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-10">
        <section className="w-full rounded-2xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">
            🔞
          </div>
          <h1 className="mt-4 text-center text-2xl font-black tracking-tight text-slate-900">
            Verifica dell'età
          </h1>
          <p className="mt-2 text-center text-sm leading-6 text-slate-600">
            Questo prodotto è riservato alle persone maggiorenni. Per visualizzarlo,
            inserisci mese e anno di nascita.
          </p>

          {bloccato ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm font-semibold text-red-800">
              Accesso negato. La verifica ha rilevato un'età inferiore ai 18 anni.
              Potrai riprovare dopo il periodo di blocco.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Mese
                  </span>
                  <select
                    value={mese}
                    onChange={(e) => setMese(e.target.value)}
                    disabled={isPending}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Seleziona</option>
                    {Array.from({ length: 12 }, (_, index) => {
                      const value = String(index + 1);
                      return <option key={value} value={value}>{value.padStart(2, "0")}</option>;
                    })}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Anno
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1900"
                    max={new Date().getFullYear()}
                    value={anno}
                    onChange={(e) => setAnno(e.target.value)}
                    disabled={isPending}
                    placeholder="2000"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>

              {errore && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-800">
                  {errore}
                </p>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-blue-900 shadow-sm transition hover:bg-yellow-300 disabled:cursor-wait disabled:opacity-60"
              >
                {isPending ? "Verifica in corso…" : "CONTINUA"}
              </button>

              <p className="text-center text-[11px] leading-4 text-slate-400">
                La data inserita viene utilizzata solo per determinare se hai almeno 18 anni.
                Non viene salvata nel profilo.
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
