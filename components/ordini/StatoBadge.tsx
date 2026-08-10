import type { StatoOrdine } from "@/lib/cliente/types";
import { configStatoOrdine, etichettaStato } from "@/lib/cliente/ordini-format";

/**
 * Badge compatto dello stato ordine — UNICA fonte visiva (configStatoOrdine).
 * Stessa identità grafica di banner e timeline, in cliente e venditore:
 * un ordine ANNULLATO ha sempre il badge rosso, mai quello di confermato.
 */
export function StatoBadge({
  stato,
  className = "",
}: {
  stato: StatoOrdine;
  className?: string;
}) {
  const config = configStatoOrdine(stato);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${config.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} aria-hidden />
      {etichettaStato(stato)}
    </span>
  );
}
