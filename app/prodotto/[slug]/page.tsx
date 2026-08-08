import Link from "next/link";
import { permanentRedirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import { risolviProdottoPubblico, getNegozio } from "@/lib/negozi";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import { getSiteUrl } from "@/lib/site";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import { MapPin, Phone, MessageCircle, ArrowLeft, ExternalLink, ShoppingBag } from "lucide-react";

type Params = { slug: string };

// ─── SEO ─────────────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const { prodotto } = await risolviProdottoPubblico(slug);
  if (!prodotto) return { title: "Prodotto non trovato" };

  const nome = (prodotto.nome as string) ?? "Prodotto";
  const descrizione =
    ((prodotto.descrizione_completa as string) ?? (prodotto.descrizione as string) ?? "")
      .slice(0, 155) || `${nome} disponibile su InCittà.`;
  const canonical = `${getSiteUrl()}/prodotto/${prodotto.slug as string}`;

  return {
    title: `${nome} | InCittà`,
    description: descrizione,
    alternates: { canonical },
    openGraph: {
      title: `${nome} | InCittà`,
      description: descrizione,
      url: canonical,
      type: "website",
      siteName: "InCittà",
    },
  };
}

export default async function PaginaProdotto({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

  // Risoluzione: slug canonico oppure id numerico legacy (redirect 301/308).
  const { prodotto, slugLegacy } = await risolviProdottoPubblico(slug);
  if (slugLegacy) permanentRedirect(slugLegacy);
  if (!prodotto) {
    notFound();
  }

  const id = prodotto.id as string;
  const negozio = await getNegozio(String(prodotto.negozio_id));

  // Stato preferiti per il pulsante "Salva" del prodotto.
  const statoPreferiti = await getStatoPreferitiPerPagina();

  const imageUrl = getProdottoImmagine({
    immagine_principale: "immagine_principale" in prodotto ? (prodotto.immagine_principale as string | null) : null,
    categoria: "categoria" in prodotto ? (prodotto.categoria as string | null) : null,
  });

  const prezzo = "prezzo" in prodotto ? Number(prodotto.prezzo) : 0;
  const quantita = "quantita_disponibile" in prodotto ? (prodotto.quantita_disponibile as number | null) : null;
  const stato = "stato_condizione" in prodotto ? (prodotto.stato_condizione as string | null) : null;

  const buildWhatsAppUrl = () => {
    if (!negozio) return "#";
    const phone = ((negozio.whatsapp as string) || (negozio.telefono as string) || "").replace(/[\s\-().+]/g, "");
    const number = phone.startsWith("39") ? phone : `39${phone}`;
    const msg = encodeURIComponent(
      `Ciao! Vorrei informazioni su "${prodotto.nome as string}" visto su InCittà.`
    );
    return `https://wa.me/${number}?text=${msg}`;
  };

  const buildMapsUrl = () => {
    if (!negozio?.indirizzo) return "#";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negozio.indirizzo as string)}`;
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-[11px] text-slate-400">
          <Link href="/" className="transition hover:text-blue-600">Home</Link>
          <span>/</span>
          <Link href="/negozi" className="transition hover:text-blue-600">Negozi</Link>
          <span>/</span>
          <span className="truncate font-semibold text-slate-600">{prodotto.nome as string}</span>
        </nav>

        {/* Back to store */}
        {negozio && (
          <Link
            href={`/negozio/${negozio.slug}`}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-blue-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Torna a {negozio.nome as string}
          </Link>
        )}

        {/* Photo */}
        <div className="overflow-hidden rounded-xl">
          <div className="relative aspect-square max-h-[400px] overflow-hidden bg-slate-100">
            <div
              role="img"
              aria-label={prodotto.nome as string}
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
                {prodotto.nome as string}
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

        {/* Buy button - always visible */}
        <div className="mt-4 space-y-2">
          <Link
            href={`/prodotto/${prodotto.slug}/acquista`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            <ShoppingBag className="h-5 w-5" />
            ACQUISTA
          </Link>
          <FavoritoButton
            tipo="prodotto"
            riferimentoId={id}
            attivo={statoPreferiti.chiavi.has(chiavePreferito("prodotto", id))}
            autenticato={statoPreferiti.autenticato}
            variante="inline"
            className="w-full"
            label={String(prodotto.nome ?? "")}
          />
        </div>

        {/* Store info */}
        {negozio && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <Link
              href={`/negozio/${negozio.slug}`}
              className="text-sm font-bold text-slate-900 transition hover:text-blue-600"
            >
              {negozio.nome as string}
            </Link>
            {negozio.categoria && (
              <p className="mt-px text-[11px] font-semibold text-blue-600">
                {negozio.categoria as string}
              </p>
            )}
            {negozio.descrizione && (
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {negozio.descrizione as string}
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
              {negozio.indirizzo && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-blue-500" />
                  {negozio.indirizzo as string}
                </span>
              )}
              {negozio.telefono && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3 text-blue-500" />
                  {negozio.telefono as string}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/prodotto/${prodotto.slug}/acquista`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700"
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                Acquista
              </Link>
              {negozio?.telefono && (
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
                  href={`tel:${negozio.telefono as string}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Chiama
                </a>
              )}
              {negozio.sito_web && (
                <a
                  href={(negozio.sito_web as string).startsWith("http") ? (negozio.sito_web as string) : `https://${negozio.sito_web as string}`}
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
