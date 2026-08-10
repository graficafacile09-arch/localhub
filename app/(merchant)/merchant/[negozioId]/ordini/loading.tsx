export default function MerchantOrdiniLoading() {
  return (
    <div className="space-y-5">
      <div className="h-32 animate-pulse rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm" />
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-slate-100" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-[1.75rem] bg-white shadow-sm" />
        ))}
      </div>
    </div>
  );
}
