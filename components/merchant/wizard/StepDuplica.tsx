"use client";

import { Search, Copy, AlertCircle } from "lucide-react";

type Props = {
  onBack: () => void;
};

export default function StepDuplica({ onBack }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-900">Duplica negozio esistente</h2>
        <p className="mt-1 text-sm text-slate-500">
          Seleziona un negozio da duplicare. Tutti i dati, i moduli e le configurazioni verranno copiati.
        </p>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-amber-400" />
        <h3 className="mt-3 text-sm font-bold text-amber-700">Duplicazione non ancora disponibile</h3>
        <p className="mt-1 text-xs text-amber-600">
          La funzionalità di duplicazione sarà implementata in una prossima fase.
          Al momento puoi creare un nuovo negozio da template.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
          Indietro
        </button>
      </div>
    </div>
  );
}
