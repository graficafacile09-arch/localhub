/**
 * Stato di caricamento della sezione Negozi Amministratore.
 * Skeleton mostrato durante lo streaming della lista negozi.
 */
export default function NegoziAmministratoreLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento negozi">
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

      {/* Card negozi skeleton */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-52 animate-pulse card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="h-12 w-12 rounded-2xl bg-slate-200" />
              <div className="h-10 w-16 rounded-full bg-slate-200" />
            </div>
            <div className="mt-5 h-4 w-32 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-slate-100" />
            <div className="mt-2 h-3 w-3/4 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Paginazione skeleton */}
      <div className="h-12 animate-pulse rounded-xl border border-white/70 bg-white justify-center" />
    </div>
  );
}