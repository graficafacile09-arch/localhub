"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Copy,
  ExternalLink,
  Eye,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  UserCog,
} from "lucide-react";
import type { AttivitaRow } from "@/lib/amministratore/attivita-types";
import DuplicaNegozioWizard from "@/components/merchant/media/DuplicaNegozioWizard";

/**
 * Menu Azioni di una riga Attività.
 *
 * Azioni funzionali:
 * - Visualizza → pagina pubblica del negozio (/negozio/[slug])
 * - Apri negozio → dashboard commerciante del negozio (/merchant/[id])
 * - Modifica → editor del negozio (/merchant/[id]/edit)
 * - Duplica → duplica il negozio (stesso wizard del commerciante)
 * - Elimina → cestina il negozio (conferma + API amministratore)
 *
 * Azioni placeholder (in attesa di implementazione):
 * - Gestisci proprietario, Metti/Togli evidenza, Disattiva/Riattiva
 */
export default function AttivitaActionsMenu({
  attivita,
  onElimina,
}: {
  attivita: AttivitaRow;
  onElimina?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [erroreElimina, setErroreElimina] = useState<string | null>(null);
  const [showDuplica, setShowDuplica] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
        setConfermaElimina(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setConfermaElimina(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleElimina = useCallback(async () => {
    setEliminando(true);
    setErroreElimina(null);
    try {
      const res = await fetch(`/api/amministratore/negozi/${attivita.id}/cestina`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Errore durante l'eliminazione.");
      }
      setOpen(false);
      setConfermaElimina(false);
      onElimina?.(attivita.id);
    } catch (caught) {
      setErroreElimina(
        caught instanceof Error ? caught.message : "Errore sconosciuto."
      );
    } finally {
      setEliminando(false);
    }
  }, [attivita.id, onElimina]);

  // ── Conferma eliminazione ────────────────────────────────────────────────
  if (confermaElimina) {
    return (
      <div className="relative" ref={menuRef}>
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-xl">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-bold text-red-800">
                Eliminare &ldquo;{attivita.nome}&rdquo;?
              </p>
              <p className="mt-1 text-xs leading-5 text-red-600">
                Il negozio verrà spostato nel Cestino. Potrai ripristinarlo dalla
                pagina Cestino. Questa azione è riservata agli amministratori.
              </p>
              {erroreElimina && (
                <p className="mt-2 rounded-lg bg-red-100 px-2.5 py-1.5 text-xs font-semibold text-red-800">
                  {erroreElimina}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleElimina}
                  disabled={eliminando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {eliminando ? "Eliminazione..." : "Elimina"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfermaElimina(false);
                    setErroreElimina(null);
                  }}
                  disabled={eliminando}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-red-100 disabled:opacity-60"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Menu principale ───────────────────────────────────────────────────────
  return (
    <div className="relative" ref={menuRef}>
      {showDuplica && (
        <DuplicaNegozioWizard
          storeId={attivita.id}
          storeName={attivita.nome}
          onClose={() => setShowDuplica(false)}
        />
      )}

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
          className="absolute right-0 top-full z-30 mt-1 w-60 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl"
        >
          {/* Visualizza — pagina pubblica (solo se ha slug) */}
          {attivita.slug && (
            <a
              href={`/negozio/${attivita.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Eye className="h-4 w-4 shrink-0" aria-hidden />
              Visualizza
            </a>
          )}

          {/* Apri negozio — dashboard commerciante */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push(`/merchant/${attivita.id}`);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            Apri dashboard
          </button>

          {/* Modifica — editor del negozio */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push(`/merchant/${attivita.id}/edit`);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Pencil className="h-4 w-4 shrink-0" aria-hidden />
            Modifica
          </button>

          {/* Duplica — apre wizard */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setShowDuplica(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Copy className="h-4 w-4 shrink-0" aria-hidden />
            Duplica negozio
          </button>

          <div className="my-1 border-t border-slate-100" />

          {/* Gestisci proprietario — placeholder */}
          <button
            type="button"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            <UserCog className="h-4 w-4 shrink-0" aria-hidden />
            Gestisci proprietario
          </button>

          {/* Metti / Togli evidenza — placeholder */}
          <button
            type="button"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
          >
            <Star className="h-4 w-4 shrink-0" aria-hidden />
            {attivita.in_evidenza ? "Togli evidenza" : "Metti in evidenza"}
          </button>

          {/* Disattiva / Riattiva — placeholder */}
          <button
            type="button"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
          >
            <Ban className="h-4 w-4 shrink-0" aria-hidden />
            {attivita.attivo ? "Disattiva" : "Riattiva"}
          </button>

          <div className="my-1 border-t border-slate-100" />

          {/* Elimina — funzionale: apre conferma */}
          <button
            type="button"
            role="menuitem"
            onClick={() => setConfermaElimina(true)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
            Elimina
          </button>
        </div>
      )}
    </div>
  );
}
