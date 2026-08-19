import { BellRing } from "lucide-react";
import { AttentionCard } from "./AttentionCard";

/**
 * AVVISO NUOVI ORDINI — AttentionCard rossa dell'area venditore quando ci
 * sono ordini NON LETTI (letto_at null): numero enorme + icona + CTA
 * "Gestisci ordini". Il conteggio usa il sistema letto_at già esistente.
 * Non renderizzata quando il conteggio è zero (nessuno spazio vuoto).
 */
export function AvvisoNuoviOrdini({
  conteggio,
  href,
}: {
  conteggio: number;
  href: string;
}) {
  return (
    <AttentionCard
      icon={BellRing}
      count={conteggio}
      titolo={conteggio === 1 ? "Nuovo ordine" : "Nuovi ordini"}
      descrizione={`${conteggio === 1 ? "Hai 1 ordine" : `Hai ${conteggio} ordini`} che ${
        conteggio === 1 ? "aspetta" : "aspettano"
      } la tua gestione: aprilo per confermarlo o annullarlo.`}
      href={href}
      ctaLabel="Gestisci ordini"
    />
  );
}
