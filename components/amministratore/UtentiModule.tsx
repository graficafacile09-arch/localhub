"use client";

import { useState } from "react";
import { Plus, Sparkles, UserRound } from "lucide-react";
import type {
  FiltroRuoloUtente,
  Utente,
} from "@/lib/amministratore/types";
import UtentiTabs from "./UtentiTabs";
import UtentiTable from "./UtentiTable";

/**
 * Modulo Utenti (/amministratore/utenti) — parte interattiva.
 * Lo stato della tab vive qui; i dati arrivano come prop dal server (in
 * futuro dal database, tramite il servizio in lib/amministratore/service.ts).
 */
export default function UtentiModule({
  utenti,
  conteggi,
}: {
  utenti: Utente[];
  conteggi: Record<FiltroRuoloUtente, number>;
}) {
  const [filtro, setFiltro] = useState<FiltroRuoloUtente>("tutti");

  const visibili =
    filtro === "tutti" ? utenti : utenti.filter((u) => u.ruolo === filtro);

  return (
    <div className="space-y-5">
      {/* ── Intestazione modulo ─────────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 ring-1 ring-violet-100">
              <UserRound className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-700">
                Sistema Ruoli e Permessi
              </p>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                Utenti
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Centro di gestione degli utenti LocalHub: commercianti, utenti
                e amministratori. I dati mostrati sono dimostrativi: il
                collegamento al database arriverà con le prossime fasi.
              </p>
            </div>
          </div>

          <button
            type="button"
            title="Disponibile in una fase successiva"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nuovo utente
          </button>
        </div>
      </div>

      {/* ── Tab di filtro ────────────────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-4 shadow-sm md:p-5">
        <UtentiTabs attivo={filtro} conteggi={conteggi} onChange={setFiltro} />
      </div>

      {/* ── Tabella (tabpanel) ─────────────────────────────────────────────── */}
      <div role="tabpanel" id="panel-utenti" aria-labelledby="tab-utenti-tutti">
        <UtentiTable utenti={visibili} />
      </div>

      {/* ── Nota di stato ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-3xl border border-violet-100 bg-violet-50/60 px-5 py-4 text-sm text-violet-900">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden />
        <p className="leading-6">
          <span className="font-bold">Stato attuale:</span> infrastruttura del
          sistema Ruoli e Permessi pronta. Le azioni (Visualizza, Modifica,
          Permessi, Disattiva, Elimina) e il pulsante Nuovo utente sono
          placeholder.
        </p>
      </div>
    </div>
  );
}
