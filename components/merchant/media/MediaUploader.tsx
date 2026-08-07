"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2, CheckCircle2 } from "lucide-react";

type Props = {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  maxSize?: number;
};

const MAX_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_DIM = 2048;
const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile leggere l'immagine."));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Impossibile comprimere l'immagine."));
      },
      type,
      quality
    );
  });
}

function hasAlpha(type: string): boolean {
  return type === "image/png" || type === "image/webp";
}

function supportsWebP(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

async function optimizeImage(file: File): Promise<File> {
  const img = await loadImage(file);

  const webpOk = supportsWebP();
  let outType: string;
  if (webpOk) outType = "image/webp";
  else if (hasAlpha(file.type)) outType = "image/png";
  else outType = "image/jpeg";

  const sourceWidth = img.naturalWidth;
  const sourceHeight = img.naturalHeight;
  let dim = MAX_DIM;
  let quality = 0.85;
  let lastBlob: Blob | null = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const ratio = Math.min(dim / sourceWidth, dim / sourceHeight, 1);
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas non disponibile nel browser.");

    if (outType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, outType, quality);
    lastBlob = blob;
    outType = blob.type || outType;

    if (blob.size <= MAX_SIZE_BYTES) break;

    quality -= 0.12;
    if (quality < 0.55) {
      quality = 0.85;
      dim = Math.max(512, Math.round(dim * 0.8));
    }
  }

  if (!lastBlob || lastBlob.size > MAX_SIZE_BYTES) {
    throw new Error(
      "L'immagine supera ancora il limite di 4 MB dopo l'ottimizzazione. Riduci la risoluzione o il peso del file."
    );
  }

  const finalType = lastBlob.type || outType;
  const ext =
    finalType === "image/jpeg"
      ? ".jpg"
      : finalType === "image/png"
        ? ".png"
        : ".webp";
  const baseName = file.name.replace(/\.[^.]+$/, "");

  return new File([lastBlob], `${baseName}${ext}`, { type: finalType });
}

export default function MediaUploader({ onUpload, accept = "image/*", maxSize = 4 }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isOptimized, setIsOptimized] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      const maxBytes = maxSize * 1024 * 1024;

      let fileToUpload = file;

      if (file.size > maxBytes) {
        if (!COMPRESSIBLE_TYPES.has(file.type)) {
          setError(`Il file non può superare ${maxSize} MB.`);
          return;
        }

        setIsOptimizing(true);
        try {
          fileToUpload = await optimizeImage(file);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Errore durante l'ottimizzazione dell'immagine."
          );
          return;
        } finally {
          setIsOptimizing(false);
        }

        if (fileToUpload.size > maxBytes) {
          setError(
            `L'immagine supera ancora il limite di ${maxSize} MB dopo l'ottimizzazione. Riduci la risoluzione o il peso del file.`
          );
          return;
        }

        setIsOptimized(true);
        await new Promise((resolve) => setTimeout(resolve, 400));
        setIsOptimized(false);
      }

      setIsUploading(true);
      try {
        await onUpload(fileToUpload);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore durante il caricamento.");
      } finally {
        setIsUploading(false);
      }
    },
    [onUpload, maxSize]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleFile]
  );

  const busy = isOptimizing || isUploading;

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all duration-150 ${
          isDragOver
            ? "border-blue-400 bg-blue-50"
            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
        }`}
      >
        {isOptimizing ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-xs font-medium text-slate-500">Sto ottimizzando l&apos;immagine…</p>
          </div>
        ) : isOptimized ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="text-xs font-medium text-slate-500">Immagine ottimizzata</p>
          </div>
        ) : isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-xs font-medium text-slate-500">Caricamento in corso...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-slate-400" />
            <p className="text-xs font-medium text-slate-500">
              Trascina un file qui o clicca per caricare
            </p>
            <p className="text-[10px] text-slate-400">
              JPEG, PNG, WebP, GIF, SVG — Max {maxSize} MB (le immagini più grandi vengono
              ottimizzate automaticamente)
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleInputChange}
          disabled={busy}
        />
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          <X className="h-3.5 w-3.5 shrink-0" />
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto rounded p-0.5 hover:bg-red-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
