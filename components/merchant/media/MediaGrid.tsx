"use client";

import { useState } from "react";
import { Trash2, Pencil, Check, X, FileImage, File, Video } from "lucide-react";

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
  items: MediaItem[];
  onDelete: (id: string) => void;
  onRename: (id: string, nome: string) => void;
  onSelect?: (item: MediaItem) => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("it-IT", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage className="h-8 w-8 text-blue-400" />;
  if (mime.startsWith("video/")) return <Video className="h-8 w-8 text-purple-400" />;
  return <File className="h-8 w-8 text-slate-400" />;
}

export default function MediaGrid({ items, onDelete, onRename, onSelect }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (item: MediaItem) => {
    setEditingId(item.id);
    setEditValue(item.nome);
  };

  const saveEdit = (id: string) => {
    if (editValue.trim()) {
      onRename(id, editValue.trim());
    }
    setEditingId(null);
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <FileImage className="mb-3 h-12 w-12" />
        <p className="text-sm font-medium">Nessun media caricato</p>
        <p className="text-xs">Trascina file qui o usa il pulsante Carica</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item) => {
        const isImage = item.mime_type.startsWith("image/") && item.mime_type !== "image/svg+xml";
        const isEditing = editingId === item.id;

        return (
          <div
            key={item.id}
            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-150 hover:border-blue-200 hover:shadow-md"
          >
            {onSelect && (
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="absolute inset-0 z-10 cursor-pointer"
                aria-label="Seleziona"
              />
            )}

            {/* Thumbnail */}
            <div className="flex aspect-square items-center justify-center bg-slate-50">
              {isImage ? (
                <img
                  src={item.public_url}
                  alt={item.alt_text || item.nome}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <FileIcon mime={item.mime_type} />
              )}
            </div>

            {/* Info overlay */}
            <div className="p-2">
              {isEditing ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(item.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="min-w-0 flex-1 rounded-md border border-blue-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 outline-none focus:border-blue-400"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => saveEdit(item.id)}
                    className="shrink-0 rounded p-0.5 text-emerald-600 hover:bg-emerald-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <p className="truncate text-[11px] font-medium text-slate-700">
                  {item.nome}
                </p>
              )}

              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                <span>{formatSize(item.file_size)}</span>
                {item.width && item.height && (
                  <span>{item.width}×{item.height}</span>
                )}
                <span>{formatDate(item.created_at)}</span>
              </div>
            </div>

            {/* Actions (hidden, shown on hover) */}
            {!onSelect && (
              <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="rounded-lg bg-white/90 p-1.5 text-slate-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-blue-600"
                  title="Rinomina"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="rounded-lg bg-white/90 p-1.5 text-slate-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-red-600"
                  title="Elimina"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
