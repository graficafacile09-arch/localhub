"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Star, Trash2, ImagePlus, X } from "lucide-react";

type MediaRow = {
  id: string;
  public_url: string | null;
  role: "primary" | "gallery" | "detail";
  position: number;
};

type Props = {
  negozioId: string;
  productId: string;
};

const RUOLO_LABEL: Record<MediaRow["role"], string> = {
  primary: "Principale",
  gallery: "Galleria",
  detail: "Dettaglio",
};

export default function ProductGalleryManager({ negozioId, productId }: Props) {
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const base = `/api/merchant/stores/${negozioId}/products/${productId}/media`;

  const carica = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(base);
      const json = (await res.json()) as {
        success: boolean;
        data?: { media?: MediaRow[] };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? "Impossibile caricare la galleria.");
        return;
      }
      setMedia(json.data.media ?? []);
    } catch {
      setError("Errore di rete durante il caricamento della galleria.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const caricaFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      void inviaDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const inviaDataUrl = async (dataUrl: string) => {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { media?: MediaRow };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? "Impossibile caricare l'immagine.");
        return;
      }
      await carica();
    } catch {
      setError("Errore di rete durante l'upload.");
    } finally {
      setUploading(false);
    }
  };

  const impostaPrincipale = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`${base}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "primary" }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Impossibile impostare l'immagine principale.");
        return;
      }
      await carica();
    } catch {
      setError("Errore di rete.");
    } finally {
      setBusyId(null);
    }
  };

  const elimina = async (id: string) => {
    if (!window.confirm("Eliminare questa immagine dalla galleria?")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`${base}/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Impossibile eliminare l'immagine.");
        return;
      }
      await carica();
    } catch {
      setError("Errore di rete.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Caricamento galleria…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">{error}</div>
      ) : null}

      {media.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {media.map((item) => (
            <div
              key={item.id}
              className={`group relative overflow-hidden rounded-xl border bg-slate-50 ${
                item.role === "primary"
                  ? "border-blue-400 ring-1 ring-blue-300"
                  : "border-slate-200"
              }`}
            >
              {item.public_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.public_url}
                  alt="Immagine prodotto"
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center text-slate-300">
                  <Camera className="h-6 w-6" />
                </div>
              )}

              <div
                className={`absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 px-1.5 py-1 text-[10px] font-bold backdrop-blur-sm ${
                  item.role === "primary" ? "bg-blue-600/90 text-white" : "bg-slate-900/70 text-white"
                }`}
              >
                <span className="truncate">{RUOLO_LABEL[item.role]}</span>
                <div className="flex shrink-0 items-center gap-1">
                  {item.role !== "primary" && (
                    <button
                      type="button"
                      onClick={() => void impostaPrincipale(item.id)}
                      disabled={busyId === item.id}
                      title="Imposta come principale"
                      aria-label="Imposta come principale"
                      className="rounded p-0.5 transition hover:bg-white/20 disabled:opacity-50"
                    >
                      <Star className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void elimina(item.id)}
                    disabled={busyId === item.id}
                    title="Elimina immagine"
                    aria-label="Elimina immagine"
                    className="rounded p-0.5 transition hover:bg-blue-500/80 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <p className="text-xs font-medium text-slate-500">
            Nessuna immagine in galleria. Aggiungi foto extra del prodotto.
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          files.forEach(caricaFile);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {uploading ? "Caricamento…" : "Aggiungi immagini"}
      </button>

      {uploading && (
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Salvataggio immagini in corso…
        </div>
      )}
    </div>
  );
}
