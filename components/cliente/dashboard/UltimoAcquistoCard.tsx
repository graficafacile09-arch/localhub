import { ReceiptText } from "lucide-react";
import ClienteCardBase from "./ClienteCardBase";

/**
 * Card Ultimo acquisto — dashboard Area Clienti.
 * Mostra il numero dell'ultimo ordine (KPI) e il negozio nella descrizione.
 */
export default function UltimoAcquistoCard({
  numero = "—",
  descrizione = "—",
}: {
  numero?: string;
  descrizione?: string;
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
      href="/cliente/ordini"
      hrefLabel="Vedi dettagli"
    />
  );
}
