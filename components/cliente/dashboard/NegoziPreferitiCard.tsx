import { Store } from "lucide-react";
import ClienteCardBase from "./ClienteCardBase";

/**
 * Card Negozi preferiti — dashboard Area Clienti.
 * Mostra i negozi salvati tra i preferiti (predisposta per la Fase 3).
 */
export default function NegoziPreferitiCard({
  conteggio = 0,
}: {
  conteggio?: number;
}) {
  return (
    <ClienteCardBase
      icon={Store}
      value={String(conteggio)}
      label="Negozi preferiti"
      description="I negozi che segui, con le novità e gli aggiornamenti più recenti."
      href="/cliente/preferiti"
      hrefLabel="Vedi i negozi"
      accent="text-blue-600"
    />
  );
}
