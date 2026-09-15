export default function AmministratorePagamentiLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento pagamenti amministratore">
      <div className="card p-5 shadow-sm">
        <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-3 h-8 w-56 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-3 h-4 w-48 animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className="card p-5 shadow-sm">
        <div className="h-4 w-40 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-5 h-12 w-full animate-pulse rounded-xl bg-slate-100" />
        <div className="mt-3 h-12 w-full animate-pulse rounded-xl bg-slate-100" />
        <div className="mt-3 h-12 w-3/4 animate-pulse rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}
