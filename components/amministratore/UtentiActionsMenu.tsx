"use client";

import { useState } from "react";
import { Eye, Loader2, MoreHorizontal, ShieldCheck, Trash2 } from "lucide-react";
import type { Utente } from "@/lib/amministratore/types";

/**
 * Menu Azioni di una riga Utenti.
 * Le operazioni di ruolo/stato richiedono contesto: vivono nel DETTAGLIO
 * utente (modal completa). Da qui si apre il dettaglio oppure si elimina
 * definitivamente l'account (mai possibile per l'admin autorizzato: il
 * server protegge comunque l'account, qui l'azione è nascosta).
 */
export default function UtentiActionsMenu({
  utente,
  onDettaglio,
  onElimina,
}: {
  utente: Utente;
  onDettaglio?: (utente: Utente) => void;
  onElimina?: (id: string) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [conferma, setConferma] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function elimina() {
    if (eliminando) return;
    setEliminando(true);
    setErrore(null);
    try {
      const response = await fetch(`/api/amministratore/utenti/${utente.id}`, {
        method: "DELETE",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Impossibile eliminare l'utente.");
      }
      onElimina?.(utente.id);
      setAperto(false);
      setConferma(false);
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setEliminando(false);
    }
  }

  if (conferma) {
    return (
      <div className="relative inline-block text-left">
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-2xl border border-red-200 bg-red-50 p-4 text-left shadow-xl">
          <p className="text-sm font-bold text-red-800">
            Eliminare definitivamente «{utente.email}»?
          </p>
          <p className="mt-1 text-xs leading-5 text-red-600">
            L&apos;account verrà rimosso dal database (Auth Admin API). Azione
            irreversibile.
          </p>
          {errore && (
            <p role="alert" className="mt-2 rounded-lg bg-red-100 px-2 py-1.5 text-[11px] font-semibold text-red-700">
              {errore}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void elimina()}
              disabled={eliminando}
              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {eliminando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {eliminando ? "Eliminazione..." : "Elimina"}
            </button>
            <button
              type="button"
              onClick={() => { setConferma(false); setErrore(null); }}
              disabled={eliminando}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
            >
              Annulla
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        aria-label={`Azioni per ${utente.email}`}
        aria-haspopup="menu"
        aria-expanded={aperto}
        onClick={() => setAperto((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {aperto && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-60 rounded-2xl border border-slate-100 bg-white p-1.5 text-left shadow-xl">
          <button
            type="button"
            role="menuitem"
            onClick={() => { onDettaglio?.(utente); setAperto(false); }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-yellow-50"
          >
            <Eye className="h-4 w-4" />
            Visualizza dettaglio
          </button>
          {utente.protetto ? (
            <p className="mx-2 flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Account protetto
            </p>
          ) : (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                role="menuitem"
                onClick={() => { setConferma(true); setErrore(null); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Elimina definitivamente
              </button>
            </>
          )}
          {errore && !conferma && (
            <p role="alert" className="mx-2 mt-1 rounded-lg bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-700">
              {errore}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
