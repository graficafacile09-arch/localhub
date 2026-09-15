/**
 * Stato di caricamento della sezione Impostazioni Venditore.
 * Skeleton mostrato durante lo streaming delle impostazioni.
 */
export default function ImpostazioniVenditoreLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento impostazioni">
      {/* Header skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-8 w-48 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-4 w-40 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-10 w-24 animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>

      {/* Sezioni impostazioni skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="card p-5 shadow-sm">
            <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-10 w-full animate-pulse rounded-full bg-slate-200 flex-1" />
                  <div className="h-10 w-20 animate-pulse rounded-full bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Zona pericolosa skeleton */}
      <div className="card p-5 shadow-sm border-red-200">
        <div className="h-4 w-24 animate-pulse rounded-full bg-red-100" />
        <div className="mt-4 h-10 w-32 animate-pulse rounded-full bg-red-100" />
      </div>
    </div>
  );
}