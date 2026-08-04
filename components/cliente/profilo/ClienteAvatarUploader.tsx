"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { compressImage } from "@/lib/client/image-compress";

type Props = {
  avatarUrl: string | null;
  nome?: string;
  onAvatarChanged: (url: string) => void;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Impossibile leggere l'immagine."));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploader avatar dell'Area Clienti.
 * Anteprima circolare, compressione client-side (riusa lib/client/image-compress)
 * e caricamento via POST /api/cliente/profilo/avatar.
 */
export default function ClienteAvatarUploader({
  avatarUrl,
  nome,
  onAvatarChanged,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iniziale = (nome ?? "U").trim().charAt(0).toUpperCase();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const compressResult = await compressImage(file);
      const dataUrl = await fileToDataUrl(compressResult.file);
      const response = await fetch("/api/cliente/profilo/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(
          json?.error?.message ?? "Impossibile caricare l'avatar."
        );
      }
      onAvatarChanged(json.data.profilo.avatarUrl);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossibile caricare l'avatar."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:items-start">
      <div className="relative">
        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-100 shadow-md ring-1 ring-slate-200">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Avatar dell'utente"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-4xl font-black text-slate-400">{iniziale}</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="Carica una nuova immagine del profilo"
          className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-white shadow-md transition hover:bg-teal-700 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Camera className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <div className="text-center sm:text-left">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-sm font-semibold text-teal-700 transition hover:text-teal-800 disabled:opacity-60"
        >
          {uploading ? "Caricamento..." : "Cambia avatar"}
        </button>
        <p className="mt-0.5 text-[11px] text-slate-400">
          JPG o PNG, max 280 KB dopo compressione
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
