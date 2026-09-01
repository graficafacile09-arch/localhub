"use client";

import { Minus, Plus } from "lucide-react";

export default function QuantitySelector({
  value,
  onChange,
  max = 99,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-40"
        aria-label="Diminuisci quantità"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="flex h-8 w-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900 tabular-nums">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-40"
        aria-label="Aumenta quantità"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}