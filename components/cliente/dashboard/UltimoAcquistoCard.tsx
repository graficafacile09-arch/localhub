import { ReceiptText } from "lucide-react";
import type { StatoOrdine } from "@/lib/cliente/types";
import { StatoBadge } from "@/components/ordini/StatoBadge";
import ClienteCardBase from "./ClienteCardBase";

/**
 * Card Ultimo acquisto — dashboard Area Clienti.
 * Mostra il numero dell'ultimo ordine (KPI), il negozio nella descrizione e
 * lo STATO REALE dell'ultimo ordine (badge condiviso, mai inventato).
 */
export default function UltimoAcquistoCard({
  numero = "—",
  descrizione = "—",
  stato,
}: {
  numero?: string;
  descrizione?: string;
  /** Stato reale dell'ultimo ordine (badge condiviso). */
  stato?: StatoOrdine | null;
}) {
  return (
    <ClienteCardBase
      icon={ReceiptText}
      value={numero}
      label="Ultimo acquisto"
      description={
        descrizione === "—"
          ? "Non hai ancora effettuato acquisti: inizia a esplorare i negozi della tua città."
          : descrizione
      }
      badge={stato ? <StatoBadge stato={stato} /> : undefined}
      href="/cliente/ordini"
      hrefLabel="Vedi dettagli"
    />
  );
}
