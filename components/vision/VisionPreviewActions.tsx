"use client";

/**
 * Anteprima + azioni (rifai foto / analizza con AI), condivisa.
 *
 * Copia presentazionale del blocco presente in
 * components/merchant/ai/MerchantProductAiUploader.tsx, non collegata.
 */
type VisionPreviewActionsProps = {
  previewUrl: string;
  onRetry: () => void;
  onAnalyze: () => void;
  analysisLabel?: string;
};

export default function VisionPreviewActions({
  previewUrl,
  onRetry,
  onAnalyze,
  analysisLabel = "Analizza con AI",
}: VisionPreviewActionsProps) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[1.75rem] bg-slate-100 shadow-inner">
        <img src={previewUrl} alt="Anteprima prodotto" className="max-h-72 w-full object-contain" />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Rifai foto
        </button>
        <button
          type="button"
          onClick={onAnalyze}
          className="flex-1 rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98]"
        >
          {analysisLabel}
        </button>
      </div>
    </div>
  );
}
