/**
 * Stato di caricamento della Dashboard Amministratore.
 * Skeleton mostrato durante lo streaming dei KPI e statistiche.
 */
export default function AmministratoreDashboardLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento dashboard amministratore">
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

      {/* KPI cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse card p-5 shadow-sm">
            <div className="h-12 w-12 rounded-2xl bg-slate-200" />
            <div className="mt-4 h-4 w-24 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-8 w-32 animate-pulse rounded-full bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Grafici skeleton */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="h-72 animate-pulse card p-5 shadow-sm">
            <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-4 h-full w-full animate-pulse rounded-xl bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Attività recenti skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-slate-200" />
              <div className="flex-1">
                <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200" />
                <div className="mt-1 h-3 w-20 animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}