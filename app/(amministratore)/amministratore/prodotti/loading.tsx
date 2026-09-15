/**
 * Stato di caricamento della sezione Prodotti Amministratore.
 * Skeleton mostrato durante lo streaming del catalogo prodotti globale.
 */
export default function ProdottiAmministratoreLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento prodotti">
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

      {/* Filtri/ricerca skeleton */}
      <div className="h-12 animate-pulse rounded-xl border border-white/70 bg-white" />

      {/* Griglia prodotti skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-56 animate-pulse card p-5 shadow-sm">
            <div className="aspect-square w-full animate-pulse rounded-xl bg-slate-200" />
            <div className="mt-3 h-5 w-32 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-4 w-full animate-pulse rounded-full bg-slate-100" />
            <div className="mt-2 h-4 w-24 animate-pulse rounded-full bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Paginazione skeleton */}
      <div className="h-12 animate-pulse rounded-xl border border-white/70 bg-white justify-center" />
    </div>
  );
}