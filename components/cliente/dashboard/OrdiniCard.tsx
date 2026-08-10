import { Package, ReceiptText } from "lucide-react";
import ClienteCardBase from "./ClienteCardBase";

/**
 * Card Ordini — dashboard Area Clienti.
 * Mostra il numero di ordini come KPI; la descrizione può riportare lo
 * stato dell'ultimo ordine quando disponibile.
 */
export default function OrdiniCard({
  conteggio = 0,
  descrizione = "Storico dei tuoi ordini e stato di spedizione e consegna.",
}: {
  conteggio?: number;
  descrizione?: string;
}) {
  return (
    <ClienteCardBase
      icon={Package}
      value={String(conteggio)}
      label="Ordini"
      description={descrizione}
      href="/cliente/ordini"
      hrefLabel="Vedi ordini"
      secondaryIcon={ReceiptText}
    />
  );
}
