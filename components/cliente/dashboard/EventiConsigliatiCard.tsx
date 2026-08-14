import { CalendarDays } from "lucide-react";
import ClienteCardBase from "./ClienteCardBase";

/**
 * Card Eventi consigliati — dashboard Area Clienti.
 * Mostra gli eventi suggeriti nella tua città (predisposta per le fasi successive).
 */
export default function EventiConsigliatiCard({
  conteggio = 0,
}: {
  conteggio?: number;
}) {
  return (
    <ClienteCardBase
      icon={CalendarDays}
      value={String(conteggio)}
      label="Eventi consigliati"
      description="Appuntamenti e manifestazioni selezionati per te nella tua zona."
      href="/negozi"
      hrefLabel="Esplora gli eventi"
      accent="text-blue-600"
    />
  );
}
