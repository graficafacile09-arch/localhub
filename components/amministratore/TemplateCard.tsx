"use client";

import { Trash2, Pencil, FolderOpen, Calendar } from "lucide-react";

export type TemplateItem = {
  id: string;
  nome: string;
  descrizione: string;
  categoria: string | null;
  is_system: boolean;
  created_at: string;
};

type Props = {
  item: TemplateItem;
  onEdit?: (id: TemplateItem) => void;
  onDelete?: (id: string) => void;
  onUse?: (id: string) => void;
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("it-IT", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function TemplateCard({ item, onEdit, onDelete, onUse }: Props) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-150 hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900 truncate">{item.nome}</h3>
          {item.descrizione && (
            <p className="mt-1 text-xs leading-5 text-slate-500 line-clamp-2">
              {item.descrizione}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.categoria && (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-600">
            {item.categoria}
          </span>
        )}
        {item.is_system && (
          <span className="rounded-full bg-yellow-50 px-2.5 py-0.5 text-[10px] font-semibold text-yellow-600">
            Sistema
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] text-slate-400">
          <Calendar className="h-3 w-3" />
          {formatDate(item.created_at)}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {onUse && (
          <button
            type="button"
            onClick={() => onUse(item.id)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-3.5 py-1.5 text-[11px] font-bold text-blue-800 transition hover:bg-yellow-300"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Usa
          </button>
        )}
        {onEdit && !item.is_system && (
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="rounded-xl border border-slate-200 p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-blue-600"
            title="Modifica"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && !item.is_system && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="rounded-xl border border-slate-200 p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
            title="Elimina"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
