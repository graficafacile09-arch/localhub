"use client";

import { useRef, useState, useEffect } from "react";
import { Camera, ImageIcon, Sparkles } from "lucide-react";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/vision";

type AnalysisResult = {
  suggestion: ProductVisionSuggestion;
  lowConfidence: boolean;
  photoUrl: string;
};

type MerchantProductAiUploaderProps = {
  negozioId: string;
  onResult: (result: AnalysisResult) => void;
  onAnalysisStart?: () => void;
  autoStart?: boolean;
};

const CAPTURE_WIDTH = 800;
const CAPTURE_HEIGHT = 800;
const PREVIEW_DELAY = 2500;

export default function MerchantProductAiUploader({
  negozioId,
  onResult,
  onAnalysisStart,
  autoStart,
}: MerchantProductAiUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [started, setStarted] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturingRef = useRef(false);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    return () => { stopStream(); };
  }, []);

  useEffect(() => {
    if (autoStart && !autoStartedRef.current) {
      autoStartedRef.current = true;
      handleCameraClick();
    }
  }, [autoStart]);

  function setFileAndPreview(selected: File | null) {
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

  function handleFileSelected(selected: File | null | undefined) {
    if (!selected) return;
    setFileAndPreview(selected);
    if (autoStart) {
      handleAutoAnalyze(selected);
    }
  }

  function handleUploadFromViewfinder() {
    stopStream();
    setShowCamera(false);
    setStarted(false);
    capturingRef.current = false;
    fileInputRef.current?.click();
  }

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: CAPTURE_WIDTH },
          height: { ideal: CAPTURE_HEIGHT },
          facingMode: "environment",
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      return true;
    } catch {
      return false;
    }
  }

  function captureFrame(): Promise<File | null> {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) { resolve(null); return; }

      let width = video.videoWidth;
      let height = video.videoHeight;
      if (width > CAPTURE_WIDTH || height > CAPTURE_HEIGHT) {
        const ratio = Math.min(CAPTURE_WIDTH / width, CAPTURE_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          stopStream();
          if (!blob) {
            fallbackToFileInput();
            resolve(null);
            return;
          }
          const captured = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
          setFileAndPreview(captured);
          resolve(captured);
        },
        "image/jpeg",
        0.85
      );
    });
  }

  function fallbackToFileInput() {
    capturingRef.current = false;
    stopStream();
    try {
      cameraInputRef.current?.click();
    } catch {
      fileInputRef.current?.click();
    }
  }

  async function handleCameraClick() {
    if (capturingRef.current) return;
    capturingRef.current = true;

    setShowCamera(true);
    setStarted(true);
    await new Promise((r) => setTimeout(r, 100));

    const camOk = await startCamera();
    if (!camOk) {
      capturingRef.current = false;
      setShowCamera(false);
      setStarted(false);
      fallbackToFileInput();
      return;
    }

    await new Promise((r) => setTimeout(r, PREVIEW_DELAY));
    const captured = await captureFrame();
    if (!captured) {
      capturingRef.current = false;
      setStarted(false);
      return;
    }

    setShowCamera(false);

    if (autoStart) {
      await handleAutoAnalyze(captured);
    }
    capturingRef.current = false;
    setStarted(false);
  }

  async function handleAutoAnalyze(captured: File) {
    setLoading(true);
    setError(null);
    onAnalysisStart?.();

    const photoUrl = URL.createObjectURL(captured);

    try {
      const { compressImage } = await import("@/lib/client/image-compress");
      const compressed = await compressImage(captured);

      const formData = new FormData();
      formData.append("image", compressed.file);

      const uploadResponse = await fetch(
        `/api/merchant/stores/${negozioId}/products/vision`,
        { method: "POST", body: formData }
      );

      const data = (await uploadResponse.json()) as {
        success: boolean;
        suggestion?: ProductVisionSuggestion;
        lowConfidence?: boolean;
        error?: { code?: string; message?: string };
      };

      if (!uploadResponse.ok || !data.success || !data.suggestion) {
        if (data.error?.code === "AI_PROVIDER_QUOTA_EXCEEDED") {
          setError("Il servizio di riconoscimento AI è temporaneamente non disponibile. Riprova più tardi.");
          return;
        }
        throw new Error(data.error?.message ?? "Errore durante l'analisi dell'immagine.");
      }

      onResult({
        suggestion: data.suggestion,
        lowConfidence: data.lowConfidence ?? false,
        photoUrl,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
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
      const { compressImage } = await import("@/lib/client/image-compress");
      const compressed = await compressImage(file);

      const formData = new FormData();
      formData.append("image", compressed.file);

      const uploadResponse = await fetch(
        `/api/merchant/stores/${negozioId}/products/vision`,
        { method: "POST", body: formData }
      );

      const data = (await uploadResponse.json()) as {
        success: boolean;
        suggestion?: ProductVisionSuggestion;
        lowConfidence?: boolean;
        error?: { code?: string; message?: string };
      };

      if (!uploadResponse.ok || !data.success || !data.suggestion) {
        if (data.error?.code === "AI_PROVIDER_QUOTA_EXCEEDED") {
          setError("Il servizio di riconoscimento AI è temporaneamente non disponibile. Riprova più tardi.");
          return;
        }
        throw new Error(data.error?.message ?? "Errore durante l'analisi dell'immagine.");
      }

      onResult({
        suggestion: data.suggestion,
        lowConfidence: data.lowConfidence ?? false,
        photoUrl: preview ?? "",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }

  const showViewfinder = showCamera && !loading && !preview;
  const showInitial = !showCamera && !preview && !loading && !started;
  const showPreviewOnly = preview && !loading && !autoStart;

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* ─── VIEWFINDER ─── */}
      <div className={`relative bg-black rounded-2xl overflow-hidden pointer-events-none select-none touch-none ${showViewfinder ? '' : 'hidden'}`}>
        <video
          ref={videoRef}
          className="w-full aspect-square object-cover pointer-events-none"
          playsInline
          muted
          disablePictureInPicture
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="aspect-square w-4/5 rounded-xl" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="aspect-square w-4/5 rounded-xl border-2 border-white/70" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="aspect-square w-4/5">
            <div className="absolute top-0 left-0 h-8 w-8 rounded-tl-xl border-t-4 border-l-4 border-white" />
            <div className="absolute top-0 right-0 h-8 w-8 rounded-tr-xl border-t-4 border-r-4 border-white" />
            <div className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-xl border-b-4 border-l-4 border-white" />
            <div className="absolute bottom-0 right-0 h-8 w-8 rounded-br-xl border-b-4 border-r-4 border-white" />
          </div>
        </div>
        <div className="absolute bottom-4 left-0 right-0 text-center">
          <span className="text-xs text-white/70">Inquadra il prodotto...</span>
        </div>
      </div>
      {showViewfinder && (
        <button
          type="button"
          onClick={handleUploadFromViewfinder}
          className="w-full rounded-2xl border-2 border-dashed border-emerald-300 bg-gradient-to-b from-emerald-50 to-emerald-50/60 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-200/50 active:scale-[0.99]"
        >
          <ImageIcon className="mr-2 inline-block h-5 w-5" />
          Carica immagine
        </button>
      )}

      {/* ─── PULSANTI INIZIALI (solo modalità manuale) ─── */}
      {showInitial && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleCameraClick}
            className="group relative w-full overflow-hidden rounded-[2rem] border-2 border-dashed border-blue-300 bg-gradient-to-b from-blue-50 to-blue-50/60 px-4 py-8 text-center transition-all hover:border-blue-400 hover:shadow-lg hover:shadow-blue-200/50 active:scale-[0.99]"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-b from-blue-500 to-blue-700 shadow-lg shadow-blue-300/50 transition-transform duration-300 group-hover:scale-110">
              <Camera className="h-7 w-7 text-white" />
            </div>
            <p className="mt-4 text-lg font-bold text-slate-800">
              Scatta foto
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Usa la fotocamera
            </p>
          </button>
          <label
            htmlFor="ai-file-upload"
            className="group relative w-full cursor-pointer overflow-hidden rounded-[2rem] border-2 border-dashed border-emerald-300 bg-gradient-to-b from-emerald-50 to-emerald-50/60 px-4 py-8 text-center transition-all hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-200/50 active:scale-[0.99]"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-b from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-300/50 transition-transform duration-300 group-hover:scale-110">
              <ImageIcon className="h-7 w-7 text-white" />
            </div>
            <p className="mt-4 text-lg font-bold text-slate-800">
              Carica immagine
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Scegli una foto dal dispositivo
            </p>
          </label>
          </div>
      )}

      {/* Input nascosto per fotocamera (fallback) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
        className="hidden"
        aria-label="Scatta foto con la fotocamera"
      />
      <input
        id="ai-file-upload"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
        className="hidden"
        aria-label="Carica immagine dalla galleria"
      />

      {/* ─── ANTEPRIMA + ANALIZZA (solo modalità manuale) ─── */}
      {showPreviewOnly && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[1.75rem] bg-slate-100 shadow-inner">
            <img src={preview} alt="Anteprima prodotto" className="max-h-72 w-full object-contain" />
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
      )}
    </div>
  );
}
