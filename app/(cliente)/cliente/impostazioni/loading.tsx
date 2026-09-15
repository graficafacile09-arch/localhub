/**
 * Stato di caricamento della sezione Impostazioni Cliente.
 * Skeleton mostrato durante lo streaming delle impostazioni.
 */
export default function ImpostazioniClienteLoading() {
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

      {/* Form profilo skeleton */}
      <div className="card p-5 shadow-sm space-y-4">
        <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
        </div>
        <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
        <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
        <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
        <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
      </div>

      {/* Password skeleton */}
      <div className="card p-5 shadow-sm space-y-4">
        <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200" />
        <div className="space-y-3">
          <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>

      {/* Notifiche skeleton */}
      <div className="card p-5 shadow-sm space-y-4">
        <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between">
              <div>
                <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
                <div className="mt-1 h-3 w-40 animate-pulse rounded-full bg-slate-100" />
              </div>
              <div className="h-10 w-12 animate-pulse rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}