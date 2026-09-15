/**
 * Stato di caricamento della sezione Ordini Amministratore.
 * Skeleton mostrato durante lo streaming della lista ordini globali.
 */
export default function OrdiniAmministratoreLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento ordini amministratore">
      {/* Header skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-8 w-64 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-4 w-full max-w-md animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-10 w-24 animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>

      {/* Filtri skeleton */}
      <div className="h-12 animate-pulse rounded-xl border border-white/70 bg-white" />

      {/* Tabella ordini skeleton */}
      <div className="card overflow-hidden shadow-sm">
        <div className="h-12 animate-pulse border-b border-slate-200 px-5 bg-slate-50" />
        <div className="space-y-1 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse flex items-center gap-4 px-5">
              <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
              <div className="h-5 w-32 animate-pulse rounded-full bg-slate-200" />
              <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      </div>

      {/* Paginazione skeleton */}
      <div className="h-12 animate-pulse rounded-xl border border-white/70 bg-white justify-center" />
    </div>
  );
}