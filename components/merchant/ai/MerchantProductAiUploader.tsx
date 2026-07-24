"use client";

import { useRef, useState } from "react";
import { Camera, ImageIcon, Upload, Sparkles } from "lucide-react";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/vision";

type AnalysisResult = {
  suggestion: ProductVisionSuggestion;
  lowConfidence: boolean;
};

type MerchantProductAiUploaderProps = {
  negozioId: string;
  onResult: (result: AnalysisResult) => void;
  onAnalysisStart?: () => void;
};

export default function MerchantProductAiUploader({
  negozioId,
  onResult,
  onAnalysisStart,
}: MerchantProductAiUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraSupported, setCameraSupported] = useState(true);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(selected: File | null | undefined) {
    setError(null);
    if (!selected) {
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(selected);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(selected));
  }

  function handleCameraClick() {
    // Try to use camera - if it fails, show fallback
    try {
      const input = cameraInputRef.current;
      if (input) {
        input.click();
      }
    } catch {
      setCameraSupported(false);
      fileInputRef.current?.click();
    }
  }

  async function handleAnalyzeClick() {
    if (!file) {
      setError("Seleziona prima un'immagine del prodotto.");
      return;
    }

    setLoading(true);
    setError(null);
    onAnalysisStart?.();

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(
        `/api/merchant/stores/${negozioId}/products/vision`,
        { method: "POST", body: formData }
      );

      const data = (await response.json()) as {
        success: boolean;
        suggestion?: ProductVisionSuggestion;
        lowConfidence?: boolean;
        error?: { message?: string };
      };

      if (!response.ok || !data.success || !data.suggestion) {
        throw new Error(data.error?.message ?? "Errore durante l'analisi dell'immagine.");
      }

      onResult({
        suggestion: data.suggestion,
        lowConfidence: data.lowConfidence ?? false,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
      <div className="space-y-5">

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ─── PULSANTE FOTOCAMERA PRINCIPALE ─── */}
        {!preview && !loading && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleCameraClick}
              className="group relative w-full overflow-hidden rounded-[2rem] border-2 border-dashed border-blue-300 bg-gradient-to-b from-blue-50 to-blue-50/60 px-6 py-10 text-center transition-all hover:border-blue-400 hover:shadow-lg hover:shadow-blue-200/50 active:scale-[0.99]"
            >
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-b from-blue-500 to-blue-600 shadow-lg shadow-blue-300/50 transition-transform duration-300 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-blue-400/50">
                <Camera className="h-9 w-9 text-white" />
              </div>
              <p className="mt-5 text-xl font-bold text-slate-800">
                Scatta foto del prodotto
              </p>
              <p className="mt-1.5 text-sm text-slate-500">
                Inquadra il prodotto, l&apos;AI lo riconosce in pochi secondi
              </p>
            </button>

            {/* Input nascosto per fotocamera */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
              className="hidden"
              aria-label="Scatta foto con la fotocamera"
            />

            {/* Input nascosto per file fallback */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
              className="hidden"
              aria-label="Carica immagine dalla galleria"
            />

            {/* Fallback: Carica immagine */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-blue-600"
              >
                <ImageIcon className="h-4 w-4" />
                oppure carica un&apos;immagine
              </button>
            </div>
          </div>
        )}

        {/* ─── ANTEPRIMA ─── */}
        {preview && !loading && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[1.75rem] bg-slate-100 shadow-inner">
              <img
                src={preview}
                alt="Anteprima prodotto"
                className="max-h-72 w-full object-contain"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  if (preview) URL.revokeObjectURL(preview);
                  setPreview(null);
                  setFile(null);
                }}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Rifai foto
              </button>
              <button
                type="button"
                onClick={handleAnalyzeClick}
                className="flex-1 rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98]"
              >
                Analizza con AI
              </button>
            </div>
          </div>
        )}

        {/* ─── CARICAMENTO ─── */}
        {loading && (
          <div className="space-y-4">
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
          </div>
        )}

      </div>
    </div>
  );
}
