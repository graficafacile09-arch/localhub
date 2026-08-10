import Image from "next/image";
import { Package } from "lucide-react";
import type { RigaOrdine } from "@/lib/cliente/types";
import { RiepilogoTotale } from "./RiepilogoTotale";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

/**
 * Righe prodotto dell'ordine (identiche in Area Clienti e Area Venditore):
 * foto se disponibile, nome, quantità × prezzo unitario e totale riga;
 * in coda il riepilogo totale condiviso (RiepilogoTotale).
 */
export function RigheProdotto({
  righe,
  costoSpedizione,
  totale,
}: {
  righe: RigaOrdine[];
  costoSpedizione: number;
  totale: number;
}) {
  return (
    <div>
      <div className="divide-y divide-slate-100">
        {righe.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">Nessun prodotto in questo ordine.</p>
        ) : (
          righe.map((riga) => (
            <div
              key={riga.prodottoId}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              {/* Miniatura (se disponibile) */}
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                {riga.immagineUrl ? (
                  <Image
                    src={riga.immagineUrl}
                    alt={riga.nomeProdotto}
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="48px"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-slate-300">
                    <Package className="h-5 w-5" aria-hidden />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {riga.nomeProdotto}
                </p>
                <p className="text-xs text-slate-500">
                  {Number(riga.quantita) || 1} × {formattaPrezzo(riga.prezzoUnitario)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-slate-900">
                {formattaPrezzo((Number(riga.prezzoUnitario) || 0) * (Number(riga.quantita) || 1))}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Riepilogo importi (componente condiviso) */}
      <RiepilogoTotale
        righe={righe}
        costoSpedizione={costoSpedizione}
        totale={totale}
      />
    </div>
  );
}
