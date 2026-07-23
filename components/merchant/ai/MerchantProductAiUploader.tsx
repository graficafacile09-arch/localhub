"use client";

import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, Upload } from "lucide-react";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/vision";

type AnalysisResult = {
  suggestion: ProductVisionSuggestion;
  lowConfidence: boolean;
};

type MerchantProductAiUploaderProps = {
  negozioId: string;
  /** Chiamato quando l'analisi restituisce un risultato (suggestion + lowConfidence) */
  onResult: (result: AnalysisResult) => void;
  /** Chiamato appena parte la richiesta al server (prima della risposta) */
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

  // Due input separati: uno forza la fotocamera (capture), l'altro apre la galleria
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(selected: File | null | undefined) {
    setError(null);

    if (!selected) {
      setFile(null);
      setPreview(null);
      return;
    }

    setFile(selected);

    // Revoca l'object URL precedente per evitare memory leak
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(selected));
  }

  function handleCameraChange(event: React.ChangeEvent<HTMLInputElement>) {
    handleFileSelected(event.target.files?.[0]);
  }

  function handleGalleryChange(event: React.ChangeEvent<HTMLInputElement>) {
    handleFileSelected(event.target.files?.[0]);
  }

  async function handleAnalyzeClick() {
    if (!file) {
      setError("Seleziona prima un'immagine del prodotto.");
      return;
    }

    setLoading(true);
    setError(null);

    // Notifica il wizard che l'analisi è partita (per avanzare allo step 2)
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
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
            Step 1 — Fotografia prodotto
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            Scatta o seleziona un&apos;immagine
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Il sistema AI riconosce il prodotto e compila automaticamente tutti i campi dell&apos;annuncio.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* Pulsanti selezione immagine */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          {/* Bottone Fotocamera — usa capture="environment" per aprire la fotocamera sul mobile */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={loading}
            className="flex flex-col items-center gap-3 rounded-[1.75rem] border border-dashed border-blue-300 bg-blue-50/60 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
              <Camera className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Fotocamera</p>
              <p className="mt-0.5 text-xs text-slate-500">Scatta una foto ora</p>
            </div>
          </button>
          {/* Input nascosto con capture="environment" — forza la fotocamera posteriore */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraChange}
            className="hidden"
            aria-label="Scatta foto con la fotocamera"
          />

          {/* Bottone Galleria — senza capture, apre la galleria o il file picker */}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={loading}
            className="flex flex-col items-center gap-3 rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <ImageIcon className="h-6 w-6 text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Galleria</p>
              <p className="mt-0.5 text-xs text-slate-500">Scegli dalla galleria</p>
            </div>
          </button>
          {/* Input nascosto senza capture — apre la galleria / file picker */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={handleGalleryChange}
            className="hidden"
            aria-label="Seleziona immagine dalla galleria"
          />
        </div>

        {/* Anteprima immagine selezionata */}
        {preview ? (
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">
              Anteprima
              {file ? <span className="ml-2 text-xs font-normal text-slate-400">— {file.name}</span> : null}
            </p>
            <div className="mt-3 flex max-h-64 items-center justify-center overflow-hidden rounded-3xl bg-white shadow-sm">
              <img
                src={preview}
                alt="Anteprima prodotto selezionato"
                className="max-h-64 w-full object-contain"
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-[100px] items-center justify-center rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50/60">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Upload className="h-6 w-6" />
              <p className="text-sm">Nessuna immagine selezionata</p>
            </div>
          </div>
        )}

        {/* Pulsante analisi — mostra spinner durante l'attesa */}
        <button
          type="button"
          onClick={handleAnalyzeClick}
          disabled={loading || !file}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-amber-400 via-yellow-400 to-amber-500 px-6 text-sm font-bold text-slate-900 shadow-lg shadow-amber-400/40 transition hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900"
                aria-hidden
              />
              Analisi in corso…
            </>
          ) : (
            "Analizza con AI"
          )}
        </button>

        {/* Messaggio di attesa durante step 2 */}
        {loading && (
          <p className="text-center text-xs text-slate-500">
            L&apos;AI sta analizzando il prodotto. Potrebbe richiedere qualche secondo…
          </p>
        )}
      </div>
    </div>
  );
}
