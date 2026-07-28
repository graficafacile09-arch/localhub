import Link from "next/link";
import Header from "@/components/Header/Header";
import StoreProductCard from "@/components/negozio/StoreProductCard";
import { OpenAssistantLink } from "@/components/assistant/OpenAssistantButton";
import { getNegozio, getProdottiNegozio } from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import {
  getNegozioDemoById,
  getProdottiDemoByNegozioId,
} from "@/lib/negozi-demo";
import { MapPin, Phone, MessageCircle, ExternalLink } from "lucide-react";
import OpeningHoursDisplay from "@/components/negozio/OpeningHoursDisplay";

export default async function PaginaNegozio({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const negozioReale = await getNegozio(id);
  const negozioDemoVal = negozioReale ? null : getNegozioDemoById(id);
  const negozio = negozioReale ?? negozioDemoVal;

  if (!negozio) {
    return (
      <main className="min-h-screen bg-slate-50">
        <Header />
        <div className="mx-auto max-w-5xl py-20 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Negozio non trovato</h1>
          <Link href="/negozi" className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline">
            Torna ai negozi
          </Link>
        </div>
      </main>
    );
  }

  const prodotti = negozioReale
    ? await getProdottiNegozio(id)
    : getProdottiDemoByNegozioId(id);

  const imageUrl = getNegozioCardImmagine({
    immagine: negozio.immagine,
    categoria: negozio.categoria,
  });

  const buildWhatsAppUrl = () => {
    const phone = (negozio.whatsapp || negozio.telefono || "").replace(/[\s\-().+]/g, "");
    const number = phone.startsWith("39") ? phone : `39${phone}`;
    const msg = encodeURIComponent(
      `Ciao! Ho trovato "${negozio.nome}" su InCittà e vorrei informazioni.`
    );
    return `https://wa.me/${number}?text=${msg}`;
  };

  const buildMapsUrl = () => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negozio.indirizzo || "")}`;
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
        {/* Hero immagine */}
        <div className="overflow-hidden rounded-xl">
          <div className="relative aspect-video max-h-[240px] overflow-hidden">
            <div
              role="img"
              aria-label={`Fotografia del negozio ${negozio.nome}`}
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          </div>
        </div>

        {/* Info negozio */}
        <div className="mt-3">
          <h1 className="text-xl font-black tracking-tight text-slate-900">
            {negozio.nome}
          </h1>
          {negozio.categoria && (
            <p className="mt-0.5 text-xs font-semibold text-blue-600">
              {negozio.categoria}
            </p>
          )}
          {negozio.descrizione && (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {negozio.descrizione}
            </p>
          )}
        </div>

        {/* Info compatte */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {negozio.indirizzo && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 text-blue-500" />
              {negozio.indirizzo}
            </span>
          )}
          {negozio.telefono && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3 text-blue-500" />
              {negozio.telefono}
            </span>
          )}
        </div>

        {negozio.orari && (
          <div className="mt-3">
            <OpeningHoursDisplay orari={negozio.orari} />
          </div>
        )}

        {/* Azioni */}
        <div className="mt-3 flex flex-wrap gap-2">
          {negozio.telefono && (
            <a
              href={buildWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          )}
          {negozio.indirizzo && (
            <a
              href={buildMapsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
            >
              <MapPin className="h-3.5 w-3.5" />
              Mappa
            </a>
          )}
          {negozio.telefono && (
            <a
              href={`tel:${negozio.telefono}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
            >
              <Phone className="h-3.5 w-3.5" />
              Chiama
            </a>
          )}
          {negozio.sito_web && (
            <a
              href={negozio.sito_web.startsWith("http") ? negozio.sito_web : `https://${negozio.sito_web}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Sito web
            </a>
          )}
        </div>

        {/* Prodotti */}
        {prodotti.length > 0 && (
          <section className="mt-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Prodotti ({prodotti.length})
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {prodotti.map((prodotto: Record<string, unknown>) => (
                <StoreProductCard
                  key={prodotto.id as string}
                  id={prodotto.id as string}
                  nome={prodotto.nome as string}
                  descrizione={(prodotto.descrizione as string) ?? null}
                  prezzo={prodotto.prezzo as number}
                  categoria={(prodotto.categoria as string) ?? null}
                  immagine_principale={(prodotto.immagine_principale as string) ?? null}
                />
              ))}
            </div>
          </section>
        )}

        {prodotti.length === 0 && (
          <section className="mt-4 rounded-xl border border-slate-100 bg-white p-4 text-center">
            <p className="text-xs text-slate-400">
              Nessun prodotto pubblicato. Torna a trovarci presto!
            </p>
          </section>
        )}

        {/* CTA AI */}
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-center">
          <p className="text-xs text-slate-600">
            Hai una domanda su questo negozio?
          </p>
          <OpenAssistantLink label="Chiedi all'AI" />
        </div>
      </div>
    </main>
  );
}
