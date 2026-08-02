"use client";

import { ArrowUpDown, Plus, Search, SlidersHorizontal } from "lucide-react";
import type {
  FiltroEvidenzaAttivita,
  FiltroStatoAttivita,
  OrdinaAttivita,
} from "@/lib/amministratore/attivita-types";
import { OPZIONI_ORDINA } from "@/lib/amministratore/attivita-types";

/**
 * Barra superiore del modulo Attività: ricerca, filtro categoria, filtro
 * stato, filtro in evidenza, ordinamento e pulsante "Nuova attività"
 * (placeholder). Componente controllato: lo stato vive nel modulo.
 */
export default function AttivitaToolbar({
  ricerca,
  onRicerca,
  categoria,
  categorie,
  onCategoria,
  stato,
  onStato,
  evidenza,
  onEvidenza,
  ordina,
  onOrdina,
}: {
  ricerca: string;
  onRicerca: (value: string) => void;
  categoria: string;
  categorie: string[];
  onCategoria: (value: string) => void;
  stato: FiltroStatoAttivita;
  onStato: (value: FiltroStatoAttivita) => void;
  evidenza: FiltroEvidenzaAttivita;
  onEvidenza: (value: FiltroEvidenzaAttivita) => void;
  ordina: OrdinaAttivita;
  onOrdina: (value: OrdinaAttivita) => void;
}) {
  const selectClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100";

  return (
    <div className="rounded-[2rem] border border-white/70 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        {/* Ricerca */}
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={ricerca}
            onChange={(event) => onRicerca(event.target.value)}
            placeholder="Cerca per nome, categoria o proprietario…"
            aria-label="Cerca attività"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 placeholder:text-slate-400 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Filtro Categoria */}
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal
            className="hidden h-4 w-4 text-slate-400 xl:block"
            aria-hidden
          />
          <select
            value={categoria}
            onChange={(event) => onCategoria(event.target.value)}
            aria-label="Filtra per categoria"
            className={selectClass}
          >
            <option value="tutte">Tutte le categorie</option>
            {categorie.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>

          {/* Filtro Stato */}
          <select
            value={stato}
            onChange={(event) => onStato(event.target.value as FiltroStatoAttivita)}
            aria-label="Filtra per stato"
            className={selectClass}
          >
            <option value="tutti">Tutti gli stati</option>
            <option value="attivi">Attive</option>
            <option value="disattivati">Disattivate</option>
          </select>

          {/* Filtro In evidenza */}
          <select
            value={evidenza}
            onChange={(event) =>
              onEvidenza(event.target.value as FiltroEvidenzaAttivita)
            }
            aria-label="Filtra per evidenza"
            className={selectClass}
          >
            <option value="tutti">Con/senza evidenza</option>
            <option value="solo-evidenza">Solo in evidenza</option>
          </select>

          {/* Ordina */}
          <div className="relative">
            <ArrowUpDown
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <select
              value={ordina}
              onChange={(event) => onOrdina(event.target.value as OrdinaAttivita)}
              aria-label="Ordina attività"
              className={`${selectClass} pl-8`}
            >
              {(Object.keys(OPZIONI_ORDINA) as OrdinaAttivita[]).map((chiave) => (
                <option key={chiave} value={chiave}>
                  {OPZIONI_ORDINA[chiave]}
                </option>
              ))}
            </select>
          </div>

          {/* Nuova attività (placeholder) */}
          <button
            type="button"
            title="Disponibile in una fase successiva"
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nuova attività
          </button>
        </div>
      </div>
    </div>
  );
}
