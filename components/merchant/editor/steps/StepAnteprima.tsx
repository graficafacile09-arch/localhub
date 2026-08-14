"use client";

import { ExternalLink } from "lucide-react";
import type { StepProps } from "../editor-steps";

export default function StepAnteprima({ store }: StepProps) {
  const slug = (store?.slug ?? "").trim() || store.id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Ecco come i clienti vedono il tuo negozio. Salva le modifiche negli step precedenti
          prima di controllare qui.
        </p>
        <a
          href={`/negozio/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
        >
          Apri in nuova scheda <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 truncate rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
            {typeof window !== "undefined" ? `${window.location.origin}/negozio/${slug}` : `/negozio/${slug}`}
          </span>
        </div>
        <iframe
          src={`/negozio/${slug}`}
          title="Anteprima negozio"
          className="h-[70vh] w-full border-0"
        />
      </div>
    </div>
  );
}
