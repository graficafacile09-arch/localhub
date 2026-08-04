import { Heart } from "lucide-react";
import ClienteCardBase from "./ClienteCardBase";

/**
 * Card Preferiti — dashboard Area Clienti.
 * Mostra il numero di elementi salvati (predisposta per la Fase 3).
 */
export default function PreferitiCard({ conteggio = 0 }: { conteggio?: number }) {
  return (
    <ClienteCardBase
      icon={Heart}
      value={String(conteggio)}
      label="Preferiti"
      description="I negozi e i prodotti che hai salvato per non perderli di vista."
      href="/cliente/preferiti"
      hrefLabel="Vedi preferiti"
      accent="text-rose-500"
    />
  );
}
