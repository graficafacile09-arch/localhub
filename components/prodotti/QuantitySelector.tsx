"use client";

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
      >
        −
      </button>
      <span className="flex h-8 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
