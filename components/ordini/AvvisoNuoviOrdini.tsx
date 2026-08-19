import { BellRing } from "lucide-react";
import { AttentionCard } from "./AttentionCard";

/**
 * AVVISO NUOVI ORDINI — AttentionCard rossa dell'area venditore quando ci
 * sono ordini NON LETTI (letto_at null): numero enorme + icona + CTA
 * "Gestisci ordini". Il conteggio usa il sistema letto_at già esistente.
 * Non renderizzata quando il conteggio è zero (nessuno spazio vuoto).
 *
 * Se viene passato `onOpen` (invece di `href`) la card diventa un bottone che
 * apre/chiude un contenuto (es. riepilogo ordini in dashboard) senza navigare.
 */
export function AvvisoNuoviOrdini({
  conteggio,
  href,
  onOpen,
  ctaLabel = "Gestisci ordini",
}: {
  conteggio: number;
  href?: string;
  onOpen?: () => void;
  ctaLabel?: string;
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
      onOpen={onOpen}
      ctaLabel={ctaLabel}
    />
  );
}
