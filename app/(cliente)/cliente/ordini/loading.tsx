/**
 * Stato di caricamento della sezione Ordini.
 * Skeleton mostrato durante lo streaming dei dati da Supabase.
 */
export default function OrdiniLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento ordini">
      {/* Intestazione skeleton */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 animate-pulse rounded-2xl bg-slate-200" />
          <div className="flex-1">
            <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-3 h-7 w-48 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      </div>

      {/* Card ordini skeleton */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="h-5 w-28 animate-pulse rounded-full bg-slate-200" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
            </div>
            <div className="mt-4 h-4 w-40 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-6 h-3 w-full animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
