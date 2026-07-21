export default function MerchantDashboardCards({
  totals,
}: {
  totals: {
    prodotti: number;
    attivi: number;
    inVetrina: number;
  };
}) {
  const cards = [
    {
      label: "Prodotti totali",
      value: totals.prodotti,
      accent: "text-blue-700",
    },
    {
      label: "Prodotti attivi",
      value: totals.attivi,
      accent: "text-emerald-700",
    },
    {
      label: "Pubblicati manualmente",
      value: totals.inVetrina,
      accent: "text-amber-700",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            {card.label}
          </p>
          <p className={`mt-4 text-4xl font-black tracking-tight ${card.accent}`}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
