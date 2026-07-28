export function OrderSummary({
  items,
}: {
  items: Array<{
    nome: string;
    prezzo: number;
    quantita: number;
  }>;
}) {
  console.log("[OrderSummary] rendering, items:", items);
  const subtotale = items.reduce(
    (sum, item) => sum + item.prezzo * item.quantita,
    0,
  );
  console.log("[OrderSummary] subtotale:", subtotale);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">Riepilogo ordine</h3>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between text-sm"
          >
            <span className="flex-1 text-slate-700">
              {item.nome} × {item.quantita}
            </span>
            <span className="font-semibold text-slate-900">
              €{(item.prezzo * item.quantita).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Subtotale</span>
          <span className="text-lg font-black text-slate-900">
            €{subtotale.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
