"use client";

import { FilePlus, Copy, LayoutTemplate } from "lucide-react";

type Props = {
  value: "template" | "user-template" | "duplica";
  onChange: (v: "template" | "user-template" | "duplica") => void;
  onNext: () => void;
};

export default function StepModalita({ value, onChange, onNext }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-900">Come vuoi creare il negozio?</h2>
        <p className="mt-1 text-sm text-slate-500">Scegli la modalità più veloce per iniziare.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => { onChange("template"); onNext(); }}
          className={`group relative rounded-2xl border-2 p-5 text-left transition-all ${
            value === "template"
              ? "border-blue-500 bg-blue-50 shadow-sm"
              : "border-slate-100 bg-white hover:border-blue-200 hover:shadow-sm"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <FilePlus className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Template di sistema</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Parti da un modello preconfigurato per la tua categoria.
              </p>
              <span className="mt-3 inline-block rounded-full bg-blue-100 px-3 py-1 text-[10px] font-bold text-blue-700">
                Consigliato
              </span>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => { onChange("user-template"); onNext(); }}
          className={`group relative rounded-2xl border-2 p-5 text-left transition-all ${
            value === "user-template"
              ? "border-blue-500 bg-blue-50 shadow-sm"
              : "border-slate-100 bg-white hover:border-blue-200 hover:shadow-sm"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <LayoutTemplate className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">I miei Template</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Usa un template salvato da un tuo negozio esistente.
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => { onChange("duplica"); onNext(); }}
          className={`group relative rounded-2xl border-2 p-5 text-left transition-all ${
            value === "duplica"
              ? "border-blue-500 bg-blue-50 shadow-sm"
              : "border-slate-100 bg-white hover:border-blue-200 hover:shadow-sm"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <Copy className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Duplica negozio</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Copia un negozio già configurato. Ideale per attività simili.
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
