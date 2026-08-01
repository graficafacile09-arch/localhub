"use client";

import { useState, useEffect } from "react";
import { Loader2, Check } from "lucide-react";

type UserTemplate = {
  id: string;
  nome: string;
  descrizione: string;
  categoria: string | null;
  is_system: boolean;
  created_at: string;
};

type Props = {
  selectedId: string | null;
  onChange: (t: UserTemplate) => void;
  onBack: () => void;
  onNext: () => void;
};

export default function StepTemplateUser({ selectedId, onChange, onBack, onNext }: Props) {
  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/merchant/templates");
        const json = await res.json();
        if (json.success) {
          const all = (json.data?.templates ?? []) as UserTemplate[];
          setTemplates(all.filter((t) => !t.is_system));
        } else {
          setError(json.error?.message ?? "Errore nel caricamento.");
        }
      } catch {
        setError("Errore di rete.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-black text-slate-900">Nessun template disponibile</h2>
          <p className="mt-1 text-sm text-slate-500">
            Non hai ancora salvato nessun template. Salvane uno dal pannello Manutenzione dell&apos;Editor.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            Indietro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-900">Scegli un tuo template</h2>
        <p className="mt-1 text-sm text-slate-500">
          I template contengono i dati salvati dai tuoi negozi. Tutte le immagini saranno riutilizzate.
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
              <div>
                <h3 className="text-sm font-bold text-slate-900">{t.nome}</h3>
                <p className="mt-0.5 text-xs leading-5 text-slate-500 line-clamp-2">{t.descrizione}</p>
                {t.categoria && (
                  <span className="mt-2 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                    {t.categoria}
                  </span>
                )}
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
