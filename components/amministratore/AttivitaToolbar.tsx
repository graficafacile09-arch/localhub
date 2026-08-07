"use client";

import { Search, SlidersHorizontal } from "lucide-react";

/**
 * Barra superiore del modulo "Gestione Negozi": ricerca e filtro categoria.
 * Ricerca su nome, categoria e slug. Componente controllato: lo stato vive
 * nel modulo.
 */
export default function AttivitaToolbar({
  ricerca,
  onRicerca,
  categoria,
  categorie,
  onCategoria,
}: {
  ricerca: string;
  onRicerca: (value: string) => void;
  categoria: string;
  categorie: string[];
  onCategoria: (value: string) => void;
}) {
  const selectClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100";

  return (
    <div className="rounded-[2rem] border border-white/70 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
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
            placeholder="Cerca negozio..."
            aria-label="Cerca negozio"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm font-medium text-slate-700 placeholder:text-slate-400 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Filtro Categoria */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal
            className="hidden h-4 w-4 text-slate-400 md:block"
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
        </div>
      </div>
    </div>
  );
}