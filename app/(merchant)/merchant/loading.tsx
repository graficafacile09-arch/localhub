export default function MerchantLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento area venditore">
      <div className="card p-6 shadow-sm">
        <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-3 h-8 w-56 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-3 h-4 w-full max-w-lg animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="h-56 animate-pulse card p-6 shadow-sm">
            <div className="h-4 w-28 rounded-full bg-slate-200" />
            <div className="mt-5 h-7 w-48 rounded-full bg-slate-200" />
            <div className="mt-3 h-4 w-32 rounded-full bg-slate-100" />
            <div className="mt-6 h-10 w-36 rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
