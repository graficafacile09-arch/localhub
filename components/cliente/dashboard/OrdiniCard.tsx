import { Package } from "lucide-react";
import ClienteCardBase from "./ClienteCardBase";

/**
 * Card Ordini — dashboard Area Clienti.
 * Mostra il numero di ordini dell'utente (predisposta per la Fase 4).
 */
export default function OrdiniCard({ conteggio = 0 }: { conteggio?: number }) {
  return (
    <ClienteCardBase
      icon={Package}
      value={String(conteggio)}
      label="Ordini"
      description="Storico dei tuoi ordini e stato di spedizione e consegna."
      href="/cliente/ordini"
      hrefLabel="Vedi ordini"
    />
  );
}
