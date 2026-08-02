"use client";

import { useEffect, useRef, useState } from "react";
import {
  Ban,
  ExternalLink,
  Eye,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  UserCog,
} from "lucide-react";
import type { AttivitaRow } from "@/lib/amministratore/attivita-types";

/**
 * Menu Azioni di una riga Attività. Tutte le voci sono PLACEHOLDER:
 * chiudono solo il menu, senza operazioni. In futuro saranno collegate a
 * CRUD, permessi, audit e storico modifiche.
 */
export default function AttivitaActionsMenu({
  attivita,
}: {
  attivita: AttivitaRow;
}) {
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
      icon: ExternalLink,
      label: "Apri negozio",
      accent: "text-slate-700 hover:bg-slate-50",
    },
    {
      icon: UserCog,
      label: "Gestisci proprietario",
      accent: "text-blue-700 hover:bg-blue-50",
    },
    {
      icon: Star,
      label: attivita.in_evidenza ? "Togli evidenza" : "Metti in evidenza",
      accent: "text-amber-700 hover:bg-amber-50",
    },
    {
      icon: Ban,
      label: attivita.attivo ? "Disattiva" : "Riattiva",
      accent: "text-amber-700 hover:bg-amber-50",
    },
    { icon: Trash2, label: "Elimina", accent: "text-red-600 hover:bg-red-50" },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Azioni per ${attivita.nome}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl"
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
