"use client";

/**
 * Coppia di campi data "Da → A" COMPRIMIBILE, condivisa da tutte le barre
 * filtro (incassi, ordini admin, payout admin/venditore).
 *
 * I due input type=date hanno un min-content intrinseco (~150px l'uno) che,
 * affiancati in un flex row con "w-full", forzava il contenitore a diventare
 * più largo del viewport. Qui la coppia è una griglia `minmax(0,1fr)/auto/minmax(0,1fr)`
 * con `min-w-0` sugli input: i campi si adattano realmente alla larghezza
 * disponibile senza mai allargare la pagina.
 */
type FiltroDataRangeProps = {
  dataDa: string;
  dataA: string;
  onDataDa: (value: string) => void;
  onDataA: (value: string) => void;
  idDa?: string;
  idA?: string;
  className?: string;
};

export default function FiltroDataRange({
  dataDa,
  dataA,
  onDataDa,
  onDataA,
  idDa,
  idA,
  className = "",
}: FiltroDataRangeProps) {
  const inputClass =
    "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100";

  return (
    <div
      className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 ${className}`}
    >
      <input
        id={idDa}
        type="date"
        value={dataDa}
        onChange={(e) => onDataDa(e.target.value)}
        aria-label="Data da"
        className={inputClass}
      />
      <span className="shrink-0 text-slate-400" aria-hidden>
        →
      </span>
      <input
        id={idA}
        type="date"
        value={dataA}
        onChange={(e) => onDataA(e.target.value)}
        aria-label="Data a"
        className={inputClass}
      />
    </div>
  );
}
