/**
 * Stato di caricamento dell'Area Venditore (negozio specifico).
 * Skeleton mostrato durante lo streaming dei dati del negozio.
 */
export default function MerchantStoreLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento dashboard negozio">
      {/* Header skeleton */}
      <div className="card p-5 shadow-sm">
        <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-3 h-8 w-64 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded-full bg-slate-100" />
      </div>

      {/* Card statistiche skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse card p-5 shadow-sm">
            <div className="h-12 w-12 rounded-2xl bg-slate-200" />
            <div className="mt-4 h-4 w-24 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-8 w-32 animate-pulse rounded-full bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Azioni rapide skeleton */}
      <div className="h-16 animate-pulse rounded-2xl border border-white/70 bg-white" />

      {/* Card prodotti skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-48 animate-pulse card p-5 shadow-sm">
            <div className="h-24 w-full animate-pulse rounded-xl bg-slate-200" />
            <div className="mt-3 h-5 w-32 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-4 w-full animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}