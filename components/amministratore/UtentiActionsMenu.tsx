"use client";

import { useState } from "react";
import { Ban, Loader2, MoreHorizontal, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import type { FiltroRuoloUtente, StatoUtente, Utente } from "@/lib/amministratore/types";

type AggiornamentoUtente = Partial<Pick<Utente, "ruolo" | "stato">>;

export default function UtentiActionsMenu({
  utente,
  onAggiorna,
  onElimina,
}: {
  utente: Utente;
  onAggiorna?: (id: string, aggiornamento: AggiornamentoUtente) => void;
  onElimina?: (id: string) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function aggiorna(payload: Record<string, string>, aggiornamento: AggiornamentoUtente) {
    setCaricamento(true);
    setErrore(null);
    try {
      const response = await fetch(`/api/amministratore/utenti/${utente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Impossibile aggiornare l'utente.");
      onAggiorna?.(utente.id, aggiornamento);
      setAperto(false);
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setCaricamento(false);
    }
  }

  async function elimina() {
    if (!window.confirm(`Eliminare definitivamente ${utente.email}?`)) return;
    setCaricamento(true);
    setErrore(null);
    try {
      const response = await fetch(`/api/amministratore/utenti/${utente.id}`, { method: "DELETE" });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Impossibile eliminare l'utente.");
      onElimina?.(utente.id);
      setAperto(false);
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setCaricamento(false);
    }
  }

  const prossimoStato: StatoUtente = utente.stato === "attivo" ? "disattivato" : "attivo";
  const prossimoRuolo: FiltroRuoloUtente = utente.ruolo === "commerciante" ? "utente" : "commerciante";

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Azioni per ${utente.email}`}
        aria-haspopup="menu"
        aria-expanded={aperto}
        onClick={() => setAperto((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {aperto && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-56 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
          <button type="button" role="menuitem" disabled={caricamento} onClick={() => void aggiorna({ ruolo: prossimoRuolo }, { ruolo: prossimoRuolo })} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {caricamento ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            Ruolo: {prossimoRuolo === "commerciante" ? "Commerciante" : "Utente"}
          </button>
          <button type="button" role="menuitem" disabled={caricamento} onClick={() => void aggiorna({ stato: prossimoStato }, { stato: prossimoStato })} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60">
            <Ban className="h-4 w-4" />
            {utente.stato === "attivo" ? "Disattiva" : "Riattiva"}
          </button>
          <button type="button" role="menuitem" disabled={caricamento} onClick={() => void aggiorna({ ruolo: "amministratore" }, { ruolo: "amministratore" })} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60">
            <ShieldCheck className="h-4 w-4" />
            Rendi amministratore
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button type="button" role="menuitem" disabled={caricamento} onClick={() => void elimina()} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
            <Trash2 className="h-4 w-4" />
            Elimina
          </button>
          {errore && <p role="alert" className="mx-2 mt-1 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700">{errore}</p>}
        </div>
      )}
    </div>
  );
}
