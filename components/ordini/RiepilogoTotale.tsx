import type { RigaOrdine } from "@/lib/cliente/types";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

/**
 * RIEPILOGO TOTALE — blocco condiviso (dettaglio cliente e venditore):
 * subtotale prodotti, eventuale costo spedizione e totale ordine MOLTO
 * evidente (gerarchia: totale finale dominate).
 */
export function RiepilogoTotale({
  righe,
  costoSpedizione,
  totale,
}: {
  righe: RigaOrdine[];
  costoSpedizione: number;
  totale: number;
}) {
  const subtotale = (righe ?? []).reduce(
    (acc, r) => acc + (Number(r.prezzoUnitario) || 0) * (Number(r.quantita) || 1),
    0
  );

  return (
    <div className="mt-4 space-y-2 rounded-xl bg-slate-50/80 px-4 py-3.5 ring-1 ring-slate-100">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>Subtotale</span>
        <span className="font-semibold text-slate-700">{formattaPrezzo(subtotale)}</span>
      </div>
      {Number(costoSpedizione) > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Spedizione</span>
          <span className="font-semibold text-slate-700">
            {formattaPrezzo(costoSpedizione)}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-slate-200/70 pt-2.5">
        <span className="text-base font-black text-slate-900">Totale ordine</span>
        <span className="text-2xl font-black tracking-tight text-slate-900">
          {formattaPrezzo(totale)}
        </span>
      </div>
    </div>
  );
}
