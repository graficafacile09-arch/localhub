import type { StatoOrdine } from "@/lib/cliente/types";
import { configStatoOrdine, etichettaStato } from "@/lib/cliente/ordini-format";
import { StatoIcona } from "./StatoIcona";

/**
 * Badge compatto dello stato ordine — UNICA fonte visiva (configStatoOrdine).
 * Icona + etichetta: lo stato non è comunicato SOLO tramite colore
 * (accessibilità). Stessa identità grafica di banner e timeline.
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
      <StatoIcona stato={stato} className="h-3 w-3" ariaHidden />
      {etichettaStato(stato)}
    </span>
  );
}
