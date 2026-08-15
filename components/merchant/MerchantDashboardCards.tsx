"use client";

import { useState } from "react";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";

export default function MerchantDashboardCards({
  totals,
}: {
  totals: {
    prodotti: number;
    attivi: number;
    inVetrina: number;
  };
}) {
  const [open, setOpen] = useState(false);

  const cards = [
    { label: "Prodotti totali", value: totals.prodotti, accent: "text-blue-700" },
    { label: "Prodotti attivi", value: totals.attivi, accent: "text-blue-700" },
    { label: "Pubblicati manualmente", value: totals.inVetrina, accent: "text-yellow-700" },
  ];

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold text-slate-500 transition hover:text-slate-700"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Statistiche
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="grid gap-3 border-t border-slate-100 px-5 pb-5 pt-4 md:grid-cols-3">
          {cards.map((card) => (
            <div key={card.label} className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                {card.label}
              </p>
              <p className={`mt-2 text-3xl font-black tracking-tight ${card.accent}`}>
                {card.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
