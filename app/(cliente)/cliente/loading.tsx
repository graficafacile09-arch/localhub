/**
 * Stato di caricamento dell'Area Clienti.
 * Skeleton professionale mostrato durante lo streaming della pagina.
 */
export default function ClienteLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento Area Clienti">
      {/* Intestazione skeleton */}
      <div className="card p-6 md:p-8">
        <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 h-8 w-64 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 h-4 w-full max-w-md animate-pulse rounded-full bg-slate-100" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded-full bg-slate-100" />
      </div>

      {/* Griglia card skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-52 animate-pulse card p-6"
          >
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
    </div>
  );
}
