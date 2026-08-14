import Link from "next/link";
import { MapPin, Navigation, MessageCircle, ExternalLink } from "lucide-react";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { normalizzaNumeroWhatsApp } from "@/lib/telefono";
import type { NegozioRicerca } from "@/lib/ricerca-ai";

type ShopResultCardProps = {
  negozio: NegozioRicerca;
  rank: number;
};

function buildWhatsAppUrl(telefono: string, nomeNegozio: string): string {
  const number = normalizzaNumeroWhatsApp(telefono);
  const msg = encodeURIComponent(
    `Ciao! Ho trovato "${nomeNegozio}" su InCittà e vorrei informazioni.`
  );
  return `https://wa.me/${number}?text=${msg}`;
}

function buildMapsUrl(indirizzo: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzo)}`;
}

export default function ShopResultCard({ negozio, rank }: ShopResultCardProps) {
  const imageUrl = getNegozioCardImmagine({
    logo_url: negozio.logo_url,
    categoria: negozio.categoria,
  });

  const hrefNegozio = `/negozio/${negozio.slug}`;

  // Prima di navigare chiude l'Assistente AI (evento globale, stesso pattern
  // di "assistant:open") così il pannello non resta aperto sopra la pagina.
  const chiudiAssistente = () => window.dispatchEvent(new Event("assistant:close"));

  return (
    <article className="group overflow-hidden rounded-xl border border-slate-100 bg-white p-2.5 transition hover:border-blue-200 hover:shadow-md">
      {/* Area principale: l'intera card è cliccabile e apre la pagina del negozio */}
      <Link
        href={hrefNegozio}
        onClick={chiudiAssistente}
        className="flex gap-3"
        aria-label={`Apri la scheda di ${negozio.nome}`}
      >
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
          <div
            role="img"
            aria-label={`Fotografia di ${negozio.nome}`}
            className="h-full w-full bg-cover bg-center transition duration-200 group-hover:scale-105"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-bold text-slate-900 transition group-hover:text-blue-700">
                {negozio.nome}
              </h3>
              {negozio.categoria && (
                <p className="text-[11px] font-semibold text-blue-600">
                  {negozio.categoria}
                </p>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-700">
              #{rank}
            </span>
          </div>

          {negozio.indirizzo && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span className="truncate">{negozio.indirizzo}</span>
            </p>
          )}
        </div>
      </Link>

      {/* Azioni secondarie: scheda, mappa e WhatsApp restano link separati */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Link
          href={hrefNegozio}
          onClick={chiudiAssistente}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-blue-700"
        >
          <ExternalLink className="h-3 w-3" />
          Scheda
        </Link>
        {negozio.indirizzo && (
          <a
            href={buildMapsUrl(negozio.indirizzo)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
          >
            <Navigation className="h-3 w-3" />
            Mappa
          </a>
        )}
        {negozio.telefono && (
          <a
            href={buildWhatsAppUrl(negozio.telefono, negozio.nome)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100"
          >
            <MessageCircle className="h-3 w-3" />
            WA
          </a>
        )}
      </div>
    </article>
  );
}
