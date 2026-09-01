import { RotateCcw, SlidersHorizontal } from "lucide-react";

export type FiltriDisponibili = {
  categorie: string[];
  sottocategorie: string[];
  marche: string[];
  colori: string[];
};

export const FILTRI_VUOTI: FiltriDisponibili = {
  categorie: [],
  sottocategorie: [],
  marche: [],
  colori: [],
};

export type FiltriCorrenti = {
  q: string;
  categoria?: string;
  sottocategoria?: string;
  marca?: string;
  colore?: string;
  prezzoMin?: string;
  prezzoMax?: string;
  soloDisponibili?: boolean;
};

type Props = {
  /** Path di destinazione del form GET (default: ricerca globale). */
  basePath?: string;
  current: FiltriCorrenti;
  disponibili: FiltriDisponibili;
  /** Mostra il select categoria (falso nel catalogo del singolo negozio). */
  showCategoria?: boolean;
  /** Mostra il select sottocategoria (default true). */
  showSottocategoria?: boolean;
  /** Variante compatta (riga singola, per il catalogo negozio). */
  compact?: boolean;
};

const selectCls =
  "h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300";
const labelCls = "mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500";

function Select({
  name,
  label,
  value,
  options,
  placeholder,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: string[];
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelCls}>{label}</label>
      <select id={name} name={name} defaultValue={value ?? ""} className={selectCls}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

export default function SearchFilters({
  basePath = "/ricerca",
  current,
  disponibili,
  showCategoria = true,
  showSottocategoria = true,
  compact = false,
}: Props) {
  const resetUrl = basePath === "/ricerca" ? `/ricerca${current.q ? `?q=${encodeURIComponent(current.q)}` : ""}` : basePath;

  const campi = (
    <>
      {showCategoria && (
        <Select
          name="categoria"
          label="Categoria"
          value={current.categoria}
          options={disponibili.categorie}
          placeholder="Tutte le categorie"
        />
      )}
      {showSottocategoria && (
        <Select
          name="sottocategoria"
          label="Sottocategoria"
          value={current.sottocategoria}
          options={disponibili.sottocategorie}
          placeholder="Tutte"
        />
      )}
      <Select
        name="marca"
        label="Marca"
        value={current.marca}
        options={disponibili.marche}
        placeholder="Tutte le marche"
      />
      <Select
        name="colore"
        label="Colore"
        value={current.colore}
        options={disponibili.colori}
        placeholder="Tutti i colori"
      />

      <div className={compact ? "flex gap-2" : undefined}>
        <div className={compact ? "w-1/2" : undefined}>
          <label htmlFor="prezzo_min" className={labelCls}>Prezzo min (€)</label>
          <input
            id="prezzo_min"
            name="prezzo_min"
            type="number"
            min="0"
            step="0.01"
            defaultValue={current.prezzoMin ?? ""}
            placeholder="0"
            className={selectCls}
          />
        </div>
        <div className={compact ? "w-1/2" : undefined}>
          <label htmlFor="prezzo_max" className={labelCls}>Prezzo max (€)</label>
          <input
            id="prezzo_max"
            name="prezzo_max"
            type="number"
            min="0"
            step="0.01"
            defaultValue={current.prezzoMax ?? ""}
            placeholder="…"
            className={selectCls}
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
        <input
          type="checkbox"
          name="disponibile"
          value="1"
          defaultChecked={current.soloDisponibili ?? false}
          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-300"
        />
        Solo disponibili
      </label>
    </>
  );

  if (compact) {
    return (
      <form action={basePath} method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="q" value={current.q} />
        {campi}
        <button
          type="submit"
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-yellow-400 px-3 text-xs font-bold text-blue-800 transition hover:bg-yellow-300"
        >
          Applica
        </button>
        <a
          href={resetUrl}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </a>
      </form>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
        <p className="text-xs font-black uppercase tracking-wide text-slate-700">Filtri</p>
      </div>
      <form action={basePath} method="get" className="space-y-3">
        <input type="hidden" name="q" value={current.q} />
        {campi}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="h-8 flex-1 rounded-lg bg-yellow-400 text-xs font-bold text-blue-800 transition hover:bg-yellow-300"
          >
            Applica filtri
          </button>
          <a
            href={resetUrl}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </a>
        </div>
      </form>
    </div>
  );
}
