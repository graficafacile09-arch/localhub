import { BadgePercent } from "lucide-react";
import ClienteCardBase from "./ClienteCardBase";

/**
 * Card Offerte consigliate — dashboard Area Clienti.
 * Mostra le offerte suggerite in base ai tuoi interessi (predisposta per le fasi successive).
 */
export default function OfferteConsigliateCard({
  conteggio = 0,
}: {
  conteggio?: number;
}) {
  return (
    <ClienteCardBase
      icon={BadgePercent}
      value={String(conteggio)}
      label="Offerte consigliate"
      description="Promozioni e sconti selezionati per te dai negozi della piattaforma."
      href="/ricerca"
      hrefLabel="Scopri le offerte"
      accent="text-amber-500"
    />
  );
}
