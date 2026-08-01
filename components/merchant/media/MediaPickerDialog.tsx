"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Check, Image as ImageIcon, Loader2 } from "lucide-react";

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
  open: boolean;
  storeId: string;
  onClose: () => void;
  onSelect: (url: string, alt: string) => void;
};

export default function MediaPickerDialog({ open, storeId, onClose, onSelect }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/media`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data?.media ?? []);
      } else {
        setError(json.error?.message ?? "Errore nel caricamento.");
      }
    } catch {
      setError("Errore di rete.");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (open) loadMedia();
  }, [open, loadMedia]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-blue-500" />
            <h3 className="text-sm font-bold text-slate-800">Seleziona Media</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <p className="text-center text-sm text-red-500">{error}</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <ImageIcon className="mb-2 h-10 w-10" />
              <p className="text-sm font-medium">Nessun media disponibile</p>
              <p className="text-xs">Carica immagini nella Libreria Media prima di selezionarle.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {items
                .filter((item) => item.mime_type.startsWith("image/"))
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.public_url, item.alt_text || item.nome)}
                    className="group relative overflow-hidden rounded-xl border border-slate-200 transition hover:border-blue-300 hover:shadow-md"
                  >
                    <div className="aspect-square">
                      <img
                        src={item.public_url}
                        alt={item.alt_text || item.nome}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                      <div className="rounded-full bg-white/90 p-1.5 opacity-0 shadow transition group-hover:opacity-100">
                        <Check className="h-4 w-4 text-blue-600" />
                      </div>
                    </div>
                    <p className="truncate px-1.5 py-1 text-[10px] text-slate-500">
                      {item.nome}
                    </p>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
