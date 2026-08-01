"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2, FileImage } from "lucide-react";

type Props = {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  maxSize?: number;
};

export default function MediaUploader({ onUpload, accept = "image/*", maxSize = 10 }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);

    if (maxSize && file.size > maxSize * 1024 * 1024) {
      setError(`Il file non può superare ${maxSize} MB.`);
      return;
    }

    setIsUploading(true);
    try {
      await onUpload(file);
    } catch {
      setError("Errore durante il caricamento.");
    } finally {
      setIsUploading(false);
    }
  }, [onUpload, maxSize]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }, [handleFile]);

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
        {isUploading ? (
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
              JPEG, PNG, WebP, GIF, SVG — Max {maxSize} MB
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleInputChange}
          disabled={isUploading}
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
