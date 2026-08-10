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
    <div className="mt-4 space-y-2 rounded-2xl bg-slate-50/80 px-4 py-4 ring-1 ring-slate-100">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>Subtotale</span>
        <span className="font-semibold text-slate-700 tabular-nums">{formattaPrezzo(subtotale)}</span>
      </div>
      {Number(costoSpedizione) > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Spedizione</span>
          <span className="font-semibold text-slate-700 tabular-nums">
            {formattaPrezzo(costoSpedizione)}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-3 ring-1 ring-slate-200/70">
        <span className="text-sm font-black uppercase tracking-wide text-slate-900">
          Totale ordine
        </span>
        <span className="font-mono text-3xl font-black leading-none tracking-tight text-slate-900 tabular-nums">
          {formattaPrezzo(totale)}
        </span>
      </div>
    </div>
  );
}
