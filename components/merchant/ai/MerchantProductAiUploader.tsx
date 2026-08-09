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
const RETRY_CONFIDENCE_THRESHOLD = 70;
const IMMAGINE_STORAGE_KEY = "prodotti_ai_immagine";

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

      // Immagine pre-caricata dalla dashboard ("Carica immagine"): entra nello stesso flusso AI dello scanner.
      // Il consumo è gate sul param ?immagine=1 per non dirottare mai il flusso fotocamera con chiavi stale.
      const fromCarica = new URLSearchParams(window.location.search).get("immagine") === "1";
      const stored = fromCarica ? sessionStorage.getItem(IMMAGINE_STORAGE_KEY) : null;
      if (stored) {
        sessionStorage.removeItem(IMMAGINE_STORAGE_KEY);
        handleStoredImage(stored);
        return;
      }

      handleCameraClick();
    }
  }, [autoStart]);

  function dataUrlToFile(dataUrl: string): File {
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], "immagine-prodotto.jpg", { type: mime });
  }

  async function handleStoredImage(dataUrl: string) {
    try {
      const file = dataUrlToFile(dataUrl);
      setFileAndPreview(file);
      await handleAutoAnalyze(file, dataUrl);
    } catch {
      // Fallback sicuro: apri la fotocamera come nel flusso normale.
      handleCameraClick();
    }
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
      // Native label will handle it via htmlFor
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

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function analyzeWithRetry(sourceFile: File, photoUrl: string) {
    setLoading(true);
    setError(null);
    onAnalysisStart?.();

    try {
      const { preprocessImage } = await import("@/lib/client/image-preprocess");
      const { compressImage } = await import("@/lib/client/image-compress");

      const preprocessed = await preprocessImage(sourceFile);
      const compressed = await compressImage(preprocessed.file);

      // First attempt — no crop
      const formData = new FormData();
      formData.append("image", compressed.file);

      const res1 = await fetch(
        `/api/merchant/stores/${negozioId}/products/vision`,
        { method: "POST", body: formData }
      );

      if (!res1.ok) {
        const errData = await res1.json().catch(() => ({}));
        if (errData.error?.code === "AI_PROVIDER_QUOTA_EXCEEDED") {
          setError("Il servizio di riconoscimento AI è temporaneamente non disponibile. Riprova più tardi.");
          return;
        }
        throw new Error(errData.error?.message ?? `Errore HTTP ${res1.status}`);
      }

      const data1 = (await res1.json()) as {
        success: boolean;
        suggestion?: ProductVisionSuggestion;
        lowConfidence?: boolean;
        error?: { code?: string; message?: string };
      };

      if (!data1.success || !data1.suggestion) {
        throw new Error(data1.error?.message ?? "Errore durante l'analisi dell'immagine.");
      }

      if (data1.suggestion.confidenza >= RETRY_CONFIDENCE_THRESHOLD) {
        onResult({
          suggestion: data1.suggestion,
          lowConfidence: data1.lowConfidence ?? false,
          photoUrl,
        });
        return;
      }

      // Second attempt — with crop=1 (sharp attention crop)
      const formData2 = new FormData();
      formData2.append("image", compressed.file);

      const res2 = await fetch(
        `/api/merchant/stores/${negozioId}/products/vision?crop=1`,
        { method: "POST", body: formData2 }
      );

      if (!res2.ok) {
        onResult({
          suggestion: data1.suggestion,
          lowConfidence: true,
          photoUrl,
        });
        return;
      }

      const data2 = (await res2.json()) as {
        success: boolean;
        suggestion?: ProductVisionSuggestion;
        lowConfidence?: boolean;
        error?: { code?: string; message?: string };
      };

      if (!data2.success || !data2.suggestion) {
        onResult({
          suggestion: data1.suggestion,
          lowConfidence: true,
          photoUrl,
        });
        return;
      }

      const best = data2.suggestion.confidenza >= data1.suggestion.confidenza
        ? data2.suggestion
        : data1.suggestion;

      onResult({
        suggestion: best,
        lowConfidence: data2.lowConfidence ?? false,
        photoUrl,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoAnalyze(captured: File, displayUrl?: string) {
    const photoUrl = displayUrl ?? (await fileToDataUrl(captured));
    await analyzeWithRetry(captured, photoUrl);
  }

  async function handleAnalyzeClick() {
    if (!file) {
      setError("Seleziona prima un'immagine del prodotto.");
      return;
    }
    const photoUrl = await fileToDataUrl(file);
    await analyzeWithRetry(file, photoUrl);
  }

  async function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    e.target.value = "";

    stopStream();
    setShowCamera(false);
    setStarted(false);
    capturingRef.current = false;

    setFileAndPreview(selected);

    let displayUrl: string | undefined;
    try {
      displayUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(selected);
      });
    } catch {
      // fallback: blob URL
    }

    handleAutoAnalyze(selected, displayUrl);
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
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 pb-3 pt-8 bg-gradient-to-t from-black/60 to-transparent">
          <span className="text-xs text-white/70">Inquadra il prodotto...</span>
          <label
            htmlFor="ai-file-upload"
            onClick={() => { capturingRef.current = false; }}
            className="pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/30 active:scale-[0.97]"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Carica immagine
          </label>
        </div>
      </div>

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
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (!selected) return;
          e.target.value = "";
          stopStream();
          setShowCamera(false);
          setStarted(false);
          setFileAndPreview(selected);
          handleAutoAnalyze(selected);
        }}
        className="hidden"
        aria-label="Scatta foto con la fotocamera"
      />

      {/* Input file persistente — aperto via <label htmlFor="ai-file-upload"> */}
      <input
        id="ai-file-upload"
        type="file"
        accept="image/*"
        onChange={handleUploadChange}
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
