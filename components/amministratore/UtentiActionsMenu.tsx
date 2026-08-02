"use client";

import { useEffect, useRef, useState } from "react";
import {
  Ban,
  Eye,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { Utente } from "@/lib/amministratore/types";

/**
 * Menu Azioni di una riga utente. Tutte le voci sono PLACEHOLDER: non
 * eseguono alcuna operazione, chiudono solo il menu. In futuro ogni voce
 * verrà collegata alle relative funzioni (CRUD + permessi).
 */
export default function UtentiActionsMenu({ utente }: { utente: Utente }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const azioni = [
    { icon: Eye, label: "Visualizza", accent: "text-slate-700 hover:bg-slate-50" },
    { icon: Pencil, label: "Modifica", accent: "text-slate-700 hover:bg-slate-50" },
    {
      icon: ShieldCheck,
      label: "Permessi",
      accent: "text-blue-700 hover:bg-blue-50",
    },
    {
      icon: Ban,
      label: utente.stato === "attivo" ? "Disattiva" : "Riattiva",
      accent: "text-amber-700 hover:bg-amber-50",
    },
    { icon: Trash2, label: "Elimina", accent: "text-red-600 hover:bg-red-50" },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Azioni per ${utente.nome}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl"
        >
          {azioni.map((azione) => {
            const Icon = azione.icon;
            return (
              <button
                key={azione.label}
                type="button"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${azione.accent}`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {azione.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
