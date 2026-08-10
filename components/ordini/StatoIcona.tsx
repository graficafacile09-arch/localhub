import {
  BadgeCheck,
  Ban,
  Bell,
  CircleCheck,
  Hammer,
  PackageCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { configStatoOrdine } from "@/lib/cliente/ordini-format";
import type { StatoOrdine } from "@/lib/cliente/types";

/** Mappa nome icona → componente lucide (configStatoOrdine.icona). */
const ICONE: Record<string, LucideIcon> = {
  bell: Bell,
  "badge-check": BadgeCheck,
  hammer: Hammer,
  "package-check": PackageCheck,
  truck: Truck,
  "circle-check": CircleCheck,
  ban: Ban,
};

/**
 * Icona dello stato ordine (UNICA fonte visiva via configStatoOrdine).
 * Sostituisce l'uso di emoji come elemento grafico principale con icone
 * professionali, mantenendo l'emoji solo dove informativa.
 */
export function StatoIcona({
  stato,
  className,
  ariaHidden = true,
}: {
  stato: StatoOrdine;
  className?: string;
  ariaHidden?: boolean;
}) {
  const config = configStatoOrdine(stato);
  const Icon = ICONE[config.icona] ?? Bell;
  return <Icon className={className} aria-hidden={ariaHidden} />;
}
