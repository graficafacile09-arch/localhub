"use client";

import { Users, UserCog, Store, UserRound } from "lucide-react";
import type { FiltroRuoloUtente } from "@/lib/amministratore/types";

type TabDef = {
  id: FiltroRuoloUtente;
  label: string;
  icon: typeof Users;
};

const TAB: TabDef[] = [
  { id: "tutti", label: "Tutti", icon: Users },
  { id: "amministratore", label: "Amministratori", icon: UserCog },
  { id: "commerciante", label: "Venditori", icon: Store },
  { id: "utente", label: "Utenti", icon: UserRound },
];

/**
 * Tab di filtro del modulo Utenti. Componente controllato: lo stato attivo
 * vive nel componente pagina; qui arrivano solo il filtro corrente e il
 * callback di cambio.
 */
export default function UtentiTabs({
  attivo,
  conteggi,
  onChange,
}: {
  attivo: FiltroRuoloUtente;
  conteggi: Record<FiltroRuoloUtente, number>;
  onChange: (filtro: FiltroRuoloUtente) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filtra per ruolo"
      className="flex flex-wrap gap-2"
    >
      {TAB.map((tab) => {
        const Icon = tab.icon;
        const selezionata = attivo === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-utenti-${tab.id}`}
            aria-controls="panel-utenti"
            aria-selected={selezionata}
            tabIndex={selezionata ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-150 ${
              selezionata
                ? "btn-cta"
                : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {tab.label}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${
                selezionata
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {conteggi[tab.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
