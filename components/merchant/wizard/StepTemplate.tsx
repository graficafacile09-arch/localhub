"use client";

import { getTemplates, type TemplateNegozio } from "./templates";
import { Check } from "lucide-react";

type Props = {
  selectedId: string | null;
  onChange: (t: TemplateNegozio) => void;
  onBack: () => void;
  onNext: () => void;
};

const templates = getTemplates();

export default function StepTemplate({ selectedId, onChange, onBack, onNext }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-900">Scegli un template</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ogni template ha già i moduli più utili per la tua categoria. Puoi modificarli in qualsiasi momento.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => {
          const isSelected = selectedId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t)}
              className={`group relative rounded-2xl border-2 p-4 text-left transition-all ${
                isSelected
                  ? "border-blue-500 bg-blue-50 shadow-sm"
                  : "border-slate-100 bg-white hover:border-blue-200 hover:shadow-sm"
              }`}
            >
              {isSelected && (
                <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Check className="h-3.5 w-3.5" />
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
                  {t.icone[0]}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900">{t.nome}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{t.descrizione}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.categorieConsigliate.slice(0, 3).map((cat) => (
                      <span key={cat} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
          Indietro
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!selectedId}
          className="rounded-xl bg-blue-600 px-6 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-40"
        >
          Continua
        </button>
      </div>
    </div>
  );
}
