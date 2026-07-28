"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Loader2, Plus, Trash2, GripVertical, AlertTriangle } from "lucide-react";
import { useSettingsContext } from "./SettingsShell";

const MAX_IMAGES = 12;

export default function StoreGallery({
  storeId,
  initial,
}: {
  storeId: string;
  initial: string[];
}) {
  const { setFormDirty } = useSettingsContext();
  const [images, setImages] = useState<string[]>(initial);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialRef = useRef(initial);

  useEffect(() => {
    const dirty = JSON.stringify(images) !== JSON.stringify(initialRef.current);
    setIsDirty(dirty);
  }, [images]);

  useEffect(() => {
    setFormDirty("gallery", isDirty);
  }, [isDirty, setFormDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function moveImage(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    setImages((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function handleFileSelect(file: File | undefined) {
    if (!file) return;
    if (images.length >= MAX_IMAGES) {
      setError(`Hai raggiunto il limite di ${MAX_IMAGES} immagini.`);
      return;
    }
    setUploading(true);
    setError(null);

    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    const res = await fetch(`/api/merchant/stores/${storeId}/gallery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, name: "galleria" }),
    });

    const json = (await res.json()) as { success: boolean; data?: { url?: string }; error?: { message?: string } };

    if (!res.ok || !json.success) {
      setError(json.error?.message ?? "Upload fallito.");
      setUploading(false);
      return;
    }

    if (json.data?.url) {
      setImages((prev) => [...prev, json.data!.url!]);
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSaveGallery() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ galleria: images }),
    });

    const json = (await res.json()) as { success: boolean; error?: { message?: string } };

    if (!res.ok || !json.success) {
      setError(json.error?.message ?? "Errore nel salvataggio.");
      setSaving(false);
      return;
    }

    initialRef.current = images;
    setIsDirty(false);
    setFormDirty("gallery", false);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const atLimit = images.length >= MAX_IMAGES;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
          {error}
        </div>
      )}

      {/* Counter */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">
          {images.length} / {MAX_IMAGES} immagini
        </span>
        {atLimit && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            Limite raggiunto
          </span>
        )}
      </div>

      {/* Griglia immagini */}
      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((url, idx) => (
            <div key={`${url}-${idx}`} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <img src={url} alt={`Galleria ${idx + 1}`} className="h-full w-full object-cover" />

              {/* Overlay */}
              <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/0 transition group-hover:bg-black/40">
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => moveImage(idx, idx - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-slate-700 opacity-0 transition hover:bg-white group-hover:opacity-100"
                    title="Sposta a sinistra"
                  >
                    <GripVertical className="h-3.5 w-3.5 -rotate-90" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/90 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100"
                  title="Rimuovi"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                {idx < images.length - 1 && (
                  <button
                    type="button"
                    onClick={() => moveImage(idx, idx + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-slate-700 opacity-0 transition hover:bg-white group-hover:opacity-100"
                    title="Sposta a destra"
                  >
                    <GripVertical className="h-3.5 w-3.5 rotate-90" />
                  </button>
                )}
              </div>

              {/* Badge posizione */}
              <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-[9px] font-bold text-white backdrop-blur-sm">
                {idx + 1}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-8 text-center">
          <p className="text-sm font-medium text-slate-400">Nessuna immagine nella galleria</p>
          <p className="mt-1 text-xs text-slate-300">Carica foto del tuo negozio per attirare più clienti</p>
        </div>
      )}

      {/* Upload + Salva */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || atLimit}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {uploading ? "Caricamento..." : "Aggiungi foto"}
        </button>

        <button
          type="button"
          onClick={handleSaveGallery}
          disabled={saving || uploading || !isDirty}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saving ? "Salvataggio..." : saved ? "Salvato!" : "Salva galleria"}
        </button>

        {isDirty && !saving && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Non salvato
          </span>
        )}
      </div>
    </div>
  );
}
