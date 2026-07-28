import Link from "next/link";
import Header from "@/components/Header/Header";
import { getProdotto, getNegozio } from "@/lib/negozi";
import { getProdottoDemoById } from "@/lib/negozi-demo";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { MapPin, Phone, MessageCircle, ArrowLeft, ExternalLink } from "lucide-react";
import OpeningHoursDisplay from "@/components/negozio/OpeningHoursDisplay";

export default async function PaginaProdotto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const prodottoReale = await getProdotto(id);
  const prodottoDemo = prodottoReale ? null : getProdottoDemoById(id);
  const prodotto = prodottoReale ?? prodottoDemo;

  if (!prodotto) {
    return (
      <main className="min-h-screen bg-slate-50">
        <Header />
        <div className="mx-auto max-w-5xl py-20 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Prodotto non trovato</h1>
          <Link href="/negozi" className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline">
            Torna ai negozi
          </Link>
        </div>
      </main>
    );
  }

  const negozio = await getNegozio(String(prodotto.negozio_id));

  const imageUrl = getProdottoImmagine({
    immagine_principale: "immagine_principale" in prodotto ? (prodotto.immagine_principale as string | null) : null,
    categoria: "categoria" in prodotto ? (prodotto.categoria as string | null) : null,
  });

  const prezzo = "prezzo" in prodotto ? Number(prodotto.prezzo) : 0;
  const quantita = "quantita_disponibile" in prodotto ? (prodotto.quantita_disponibile as number | null) : null;
  const stato = "stato_condizione" in prodotto ? (prodotto.stato_condizione as string | null) : null;

  const buildWhatsAppUrl = () => {
    if (!negozio) return "#";
    const phone = (negozio.whatsapp || negozio.telefono || "").replace(/[\s\-().+]/g, "");
    const number = phone.startsWith("39") ? phone : `39${phone}`;
    const msg = encodeURIComponent(
      `Ciao! Vorrei informazioni su "${prodotto.nome}" visto su InCittà.`
    );
    return `https://wa.me/${number}?text=${msg}`;
  };

  const buildMapsUrl = () => {
    if (!negozio?.indirizzo) return "#";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negozio.indirizzo)}`;
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
        {/* Back to store */}
        {negozio && (
          <Link
            href={`/negozio/${negozio.id}`}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-blue-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Torna a {negozio.nome}
          </Link>
        )}

        {/* Photo */}
        <div className="overflow-hidden rounded-xl">
          <div className="relative aspect-square max-h-[400px] overflow-hidden bg-slate-100">
            <div
              role="img"
              aria-label={prodotto.nome}
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
          </div>
        </div>

        {/* Product info */}
        <div className="mt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black tracking-tight text-slate-900">
                {prodotto.nome}
              </h1>
              {"categoria" in prodotto && prodotto.categoria && (
                <p className="mt-0.5 text-xs font-semibold text-blue-600">
                  {prodotto.categoria as string}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-black text-emerald-700">
                €{prezzo.toFixed(2)}
              </p>
              {stato && (
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                  {stato}
                </p>
              )}
            </div>
          </div>

          {"descrizione" in prodotto && prodotto.descrizione && (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {prodotto.descrizione as string}
            </p>
          )}

          {"descrizione_completa" in prodotto && (prodotto as Record<string, unknown>).descrizione_completa && (
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {(prodotto as Record<string, unknown>).descrizione_completa as string}
            </p>
          )}

          {/* Availability */}
          {quantita !== null && (
            <div className="mt-3 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${quantita > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${quantita > 0 ? "bg-emerald-500" : "bg-red-500"}`} />
                {quantita > 0 ? `${quantita} disponibili` : "Non disponibile"}
              </span>
            </div>
          )}
        </div>

        {/* Store info */}
        {negozio && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <Link
              href={`/negozio/${negozio.id}`}
              className="text-sm font-bold text-slate-900 transition hover:text-blue-600"
            >
              {negozio.nome}
            </Link>
            {negozio.categoria && (
              <p className="mt-px text-[11px] font-semibold text-blue-600">
                {negozio.categoria}
              </p>
            )}
            {negozio.descrizione && (
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {negozio.descrizione}
              </p>
            )}

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

            {/* Actions */}
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
          </div>
        )}
      </div>
    </main>
  );
}
