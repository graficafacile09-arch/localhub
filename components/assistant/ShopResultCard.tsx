import Link from "next/link";
import { MapPin, Navigation, MessageCircle, ExternalLink } from "lucide-react";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import type { NegozioRicerca } from "@/lib/ricerca-ai";

type ShopResultCardProps = {
  negozio: NegozioRicerca;
  rank: number;
};

function buildWhatsAppUrl(telefono: string, nomeNegozio: string): string {
  const digits = telefono.replace(/[\s\-().+]/g, "");
  const number = digits.startsWith("39") ? digits : `39${digits}`;
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
    immagine: negozio.immagine,
    categoria: negozio.categoria,
  });

  return (
    <article className="flex gap-2.5 overflow-hidden rounded-lg border border-slate-100 bg-white p-2 transition hover:border-blue-200 hover:shadow-sm">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        <div
          role="img"
          aria-label={`Fotografia di ${negozio.nome}`}
          className="h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-900">
              {negozio.nome}
            </h3>
            {negozio.categoria && (
              <p className="text-[10px] font-semibold text-blue-600">
                {negozio.categoria}
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
            #{rank}
          </span>
        </div>

        {negozio.indirizzo && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
            <MapPin className="h-3 w-3 shrink-0 text-blue-500" />
            <span className="truncate">{negozio.indirizzo}</span>
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap gap-1">
          <Link
            href={`/negozio/${negozio.id}`}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white transition hover:bg-blue-700"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            Scheda
          </Link>
          {negozio.indirizzo && (
            <a
              href={buildMapsUrl(negozio.indirizzo)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
            >
              <Navigation className="h-2.5 w-2.5" />
              Mappa
            </a>
          )}
          {negozio.telefono && (
            <a
              href={buildWhatsAppUrl(negozio.telefono, negozio.nome)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 transition hover:bg-emerald-100"
            >
              <MessageCircle className="h-2.5 w-2.5" />
              WA
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
