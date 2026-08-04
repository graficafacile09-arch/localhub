import { ReceiptText } from "lucide-react";
import ClienteCardBase from "./ClienteCardBase";

/**
 * Card Ultimo acquisto — dashboard Area Clienti.
 * Mostra il riepilogo dell'ultimo ordine effettuato (predisposta per la Fase 4).
 */
export default function UltimoAcquistoCard({
  descrizione = "—",
}: {
  descrizione?: string;
}) {
  return (
    <ClienteCardBase
      icon={ReceiptText}
      value="—"
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
