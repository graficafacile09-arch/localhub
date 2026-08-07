"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Image as ImageIcon, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import MediaGrid from "./MediaGrid";
import MediaUploader from "./MediaUploader";

type MediaItem = {
  id: string;
  public_url: string;
  nome: string;
  alt_text: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  created_at: string;
};

type Props = {
  storeId: string;
  /** Percorso di ritorno all'editor (venditore: /merchant/{id}/edit, admin: /amministratore/negozi/{id}/edit). */
  backHref?: string;
};

export default function MediaManagerPage({ storeId, backHref }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const loadMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/media`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data?.media ?? []);
      } else {
        setError(json.error?.message ?? "Errore nel caricamento dei media.");
      }
    } catch {
      setError("Errore di rete.");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    // Caricamento iniziale intenzionale: loadMedia aggiorna lo stato dopo
    // l'await della risposta (pattern di data-fetching standard).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMedia();
  }, [loadMedia]);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/merchant/stores/${storeId}/media`, {
      method: "POST",
      body: formData,
    });

    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: { message?: string };
    } | null;

    if (!json?.success) {
      const message =
        json?.error?.message ??
        (res.status === 413
          ? "Il file supera il limite consentito dalla piattaforma. Riduci la dimensione a 4 MB."
          : `Errore HTTP ${res.status} durante il caricamento.`);
      throw new Error(message);
    }

    await loadMedia();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare definitivamente questo media?")) return;

    setDeleting((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/media/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      } else {
        alert(json.error?.message ?? "Errore nell'eliminazione.");
      }
    } catch {
      alert("Errore di rete.");
    } finally {
      setDeleting((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleRename = async (id: string, nome: string) => {
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const json = await res.json();
      if (json.success) {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, nome } : item))
        );
      }
    } catch {
      // silent
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href={backHref ?? `/merchant/${storeId}/edit`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Torna all&apos;Editor
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5">
            <ImageIcon className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Libreria Media</h1>
            <p className="text-xs text-slate-400">
              Gestisci tutte le immagini del tuo negozio in un unico posto
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <div className="text-xs text-slate-400">
            {items.length} {items.length === 1 ? "file" : "file"}
          </div>
        )}
      </div>

      {/* Uploader */}
      <div className="mb-8">
        <MediaUploader onUpload={handleUpload} />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
          <button
            type="button"
            onClick={loadMedia}
            className="ml-2 underline transition hover:text-red-800"
          >
            Riprova
          </button>
        </div>
      ) : (
        <MediaGrid
          items={items}
          onDelete={handleDelete}
          onRename={handleRename}
        />
      )}
    </div>
  );
}
