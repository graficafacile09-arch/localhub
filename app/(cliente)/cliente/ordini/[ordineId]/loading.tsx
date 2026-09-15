/**
 * Stato di caricamento del dettaglio ordine cliente.
 * Skeleton mostrato durante lo streaming dei dati dell'ordine.
 */
export default function OrdineClienteDetailLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento dettaglio ordine">
      {/* Header skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-8 w-48 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-4 w-40 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-10 w-28 animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>

      {/* Info ordine skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>

      {/* Righe ordine skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="h-4 w-20 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-slate-200" />
              <div className="flex-1">
                <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200" />
                <div className="mt-1 h-3 w-20 animate-pulse rounded-full bg-slate-100" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      </div>

      {/* Totale e azioni skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-4 w-16 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-1 h-8 w-24 animate-pulse rounded-full bg-slate-200" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>

      {/* Reclami skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="h-4 w-20 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-slate-200" />
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