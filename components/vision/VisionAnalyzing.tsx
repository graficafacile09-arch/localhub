"use client";

import { Sparkles } from "lucide-react";

/**
 * Stato di analisi in corso, condiviso con il percorso venditori.
 *
 * Copia presentazionale del blocco presente in
 * components/merchant/ai/MerchantProductAiUploader.tsx, non collegata.
 */
export default function VisionAnalyzing() {
  return (
    <div className="flex min-h-[200px] items-center justify-center rounded-[1.75rem] bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute h-16 w-16 animate-ping rounded-full bg-blue-200 opacity-30" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 shadow-lg">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-slate-800">
            L&apos;AI sta analizzando il prodotto
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Riconoscimento in corso...
          </p>
        </div>
      </div>
    </div>
  );
}
