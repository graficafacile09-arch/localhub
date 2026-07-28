export function QuantitySelector({
  value,
  min = 1,
  max = 99,
}: {
  value: number;
  min?: number;
  max?: number;
}) {
  const prevDisabled = value <= min;
  const nextDisabled = value >= max;

  return (
    <div className="flex items-center gap-2">
      <form method="get" action="?qty=dec">
        <button
          type="submit"
          name="qty"
          value="dec"
          disabled={prevDisabled}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          −
        </button>
      </form>
      <span className="flex h-8 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900">
        {value}
      </span>
      <form method="get" action="?qty=inc">
        <button
          type="submit"
          name="qty"
          value="inc"
          disabled={nextDisabled}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          +
        </button>
      </form>
    </div>
  );
}
