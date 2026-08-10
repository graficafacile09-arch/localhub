import { AlertTriangle } from "lucide-react";
import { AttentionCard } from "./AttentionCard";

/**
 * AVVISO RECLAMI APERTI — AttentionCard rossa dell'area venditore quando ci
 * sono reclami ATTIVI (aperto/in gestione): numero enorme + icona + CTA
 * "Gestisci reclami". Non renderizzata quando il conteggio è zero.
 */
export function AvvisoReclamiAperti({
  conteggio,
  href,
}: {
  conteggio: number;
  href: string;
}) {
  return (
    <AttentionCard
      icon={AlertTriangle}
      count={conteggio}
      titolo={conteggio === 1 ? "Reclamo aperto" : "Reclami aperti"}
      descrizione={`Un cliente ha segnalato un problema su ${
        conteggio === 1 ? "un ordine" : `${conteggio} ordini`
      }: aprilo per prenderlo in carico.`}
      href={href}
      ctaLabel="Gestisci reclami"
    />
  );
}
