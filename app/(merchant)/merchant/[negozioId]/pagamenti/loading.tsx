/**
 * Stato di caricamento della sezione Pagamenti Venditore.
 * Skeleton mostrato durante lo streaming delle configurazioni pagamenti.
 */
export default function PagamentiVenditoreLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento configurazione pagamenti">
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

      {/* Metodi pagamento skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card p-5 shadow-sm flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-slate-200 animate-pulse" />
              <div>
                <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
                <div className="mt-1 h-3 w-40 animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
            <div className="h-10 w-24 animate-pulse rounded-full bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Stripe Connect skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 space-y-3">
          <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-48 animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>
    </div>
  );
}