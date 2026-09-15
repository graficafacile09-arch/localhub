/**
 * Stato di caricamento del dettaglio negozio amministratore.
 * Skeleton mostrato durante lo streaming dei dati del negozio.
 */
export default function NegozioAmministratoreDetailLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento dettaglio negozio">
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

      {/* Info negozio skeleton */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 shadow-sm lg:col-span-2">
          <div className="h-4 w-20 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
            <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
            <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
            <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
            <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
            <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
          </div>
        </div>
        <div className="card p-5 shadow-sm">
          <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-4 h-10 w-40 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-3 h-8 w-32 animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>

      {/* Prodotti negozio skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="h-4 w-20 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse card p-5 shadow-sm">
              <div className="aspect-square w-full animate-pulse rounded-xl bg-slate-200" />
              <div className="mt-3 h-5 w-32 animate-pulse rounded-full bg-slate-200" />
              <div className="mt-2 h-4 w-full animate-pulse rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      </div>

      {/* Ordini negozio skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="h-4 w-20 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse flex items-center gap-4">
              <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200" />
              <div className="h-5 w-32 animate-pulse rounded-full bg-slate-200" />
              <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}