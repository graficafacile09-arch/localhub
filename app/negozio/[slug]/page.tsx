import Link from "next/link";
import { permanentRedirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import StoreProductCard from "@/components/negozio/StoreProductCard";
import { OpenAssistantLink } from "@/components/assistant/OpenAssistantButton";
import { risolviNegozioPubblico, getProdottiNegozio } from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import { getSiteUrl } from "@/lib/site";
import { getOffertePubblicheNegozio, type Offerta } from "@/lib/offerte";
import { getEventiPubbliciNegozio, type Evento } from "@/lib/eventi";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import { MapPin, Phone, MessageCircle, ExternalLink, Tag, Calendar, Clock } from "lucide-react";
import OpeningHoursDisplay from "@/components/negozio/OpeningHoursDisplay";

type Params = { slug: string };

// ─── SEO ─────────────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const { negozio } = await risolviNegozioPubblico(slug);
  if (!negozio) return { title: "Negozio non trovato" };

  const nome = (negozio.nome as string) ?? "Negozio";
  const descrizione =
    ((negozio.descrizione as string) ?? (negozio.descrizione_completa as string) ?? "")
      .slice(0, 155) || `Scopri ${nome} su InCittà.`;
  const slugCanonico = ((negozio.slug as string) ?? "").trim();
  const slugOrId = slugCanonico || (negozio.id as string);
  const canonical = `${getSiteUrl()}/negozio/${slugOrId}`;

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

export default async function PaginaNegozio({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

  // Risoluzione: slug canonico oppure UUID legacy (redirect 301/308).
  const { negozio, slugLegacy } = await risolviNegozioPubblico(slug);
  if (slugLegacy) permanentRedirect(slugLegacy);
  if (!negozio) {
    notFound();
  }

  const id = negozio.id as string;
  const slugCanonico = ((negozio.slug as string) ?? "").trim() || id;
  const prodotti = await getProdottiNegozio(id);

  const moduliAttivi: string[] = Array.isArray(negozio.moduli_attivi)
    ? (negozio.moduli_attivi as string[])
    : [];

  let offerte: Offerta[] = [];
  let eventi: Evento[] = [];
  if (moduliAttivi.includes("offerte")) {
    offerte = await getOffertePubblicheNegozio(id);
  }
  if (moduliAttivi.includes("eventi")) {
    eventi = await getEventiPubbliciNegozio(id);
  }

  // Stato preferiti per il pulsante "Salva negozio" e per le card prodotto.
  const statoPreferiti = await getStatoPreferitiPerPagina();

  const imageUrl = getNegozioCardImmagine({
    logo_url: (negozio.logo_url as string) ?? null,
    categoria: (negozio.categoria as string) ?? null,
  });

  const buildWhatsAppUrl = () => {
    const phone = ((negozio.whatsapp as string) || (negozio.telefono as string) || "").replace(/[\s\-().+]/g, "");
    const number = phone.startsWith("39") ? phone : `39${phone}`;
    const msg = encodeURIComponent(
      `Ciao! Ho trovato "${negozio.nome as string}" su InCittà e vorrei informazioni.`
    );
    return `https://wa.me/${number}?text=${msg}`;
  };

  const buildMapsUrl = () => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((negozio.indirizzo as string) || "")}`;
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-400">
          <Link href="/" className="transition hover:text-blue-600">Home</Link>
          <span>/</span>
          <Link href="/negozi" className="transition hover:text-blue-600">Negozi</Link>
          <span>/</span>
          <span className="truncate font-semibold text-slate-600">{negozio.nome as string}</span>
        </nav>

        {/* Hero immagine */}
        <div className="overflow-hidden rounded-xl">
          <div className="relative aspect-video max-h-[240px] overflow-hidden">
            <div
              role="img"
              aria-label={`Fotografia del negozio ${negozio.nome as string}`}
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          </div>
        </div>

        {/* JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              name: negozio.nome,
              description: negozio.descrizione ?? negozio.descrizione_completa ?? undefined,
              url: slugCanonico ? `/negozio/${slugCanonico}` : undefined,
              image: imageUrl,
              address: negozio.indirizzo ? { "@type": "PostalAddress", streetAddress: negozio.indirizzo } : undefined,
              telephone: negozio.telefono ?? undefined,
            }),
          }}
        />

        {/* Info negozio */}
        <div className="mt-3">
          <h1 className="text-xl font-black tracking-tight text-slate-900">
            {negozio.nome as string}
          </h1>
          {negozio.categoria && (
            <p className="mt-0.5 text-xs font-semibold text-blue-600">
              {negozio.categoria as string}
            </p>
          )}
          {negozio.descrizione && (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {negozio.descrizione as string}
            </p>
          )}
        </div>

        {/* Info compatte — piccole pill con accento amber, stessa compattezza */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {negozio.indirizzo && (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
              <MapPin className="h-3 w-3 shrink-0 text-amber-500" />
              <span className="min-w-0 truncate">{negozio.indirizzo as string}</span>
            </span>
          )}
          {negozio.telefono && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
              <Phone className="h-3 w-3 text-amber-500" />
              {negozio.telefono as string}
            </span>
          )}
        </div>

        {negozio.orari && (
          <div className="mt-3">
            <OpeningHoursDisplay orari={negozio.orari as never} />
          </div>
        )}

        {/* Azioni */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FavoritoButton
            tipo="negozio"
            riferimentoId={id}
            attivo={statoPreferiti.chiavi.has(chiavePreferito("negozio", id))}
            autenticato={statoPreferiti.autenticato}
            variante="inline"
            label={String(negozio.nome ?? "")}
          />
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

        {/* Prodotti */}
        {prodotti.length > 0 && (
          <section className="mt-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Prodotti ({prodotti.length})
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {prodotti.map((prodotto: Record<string, unknown>) => {
                const prodottoId = String(prodotto.id);
                return (
                  <StoreProductCard
                    key={prodottoId}
                    id={prodottoId}
                    slug={(prodotto.slug as string) ?? prodottoId}
                    nome={prodotto.nome as string}
                    descrizione={(prodotto.descrizione as string) ?? null}
                    prezzo={prodotto.prezzo as number}
                    categoria={(prodotto.categoria as string) ?? null}
                    immagine_principale={(prodotto.immagine_principale as string) ?? null}
                    preferitoAttivo={statoPreferiti.chiavi.has(chiavePreferito("prodotto", prodottoId))}
                    autenticato={statoPreferiti.autenticato}
                  />
                );
              })}
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

        {/* Offerte */}
        {offerte.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Tag className="h-3.5 w-3.5 text-amber-500" />
              Offerte ({offerte.length})
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {offerte.map((offerta) => (
                <article
                  key={offerta.id}
                  className="overflow-hidden rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white"
                >
                  <div className="flex items-start gap-3 p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                      <Tag className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black text-slate-900">
                        {offerta.titolo}
                      </h3>
                      {offerta.descrizione && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-600">
                          {offerta.descrizione}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {offerta.prezzo_originale !== null && (
                          <span className="text-[11px] text-slate-400 line-through">
                            €{Number(offerta.prezzo_originale).toFixed(2)}
                          </span>
                        )}
                        {offerta.prezzo_offerta !== null && (
                          <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[11px] font-black text-white">
                            €{Number(offerta.prezzo_offerta).toFixed(2)}
                          </span>
                        )}
                        {(offerta.data_inizio || offerta.data_fine) && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Clock className="h-3 w-3" />
                            {offerta.data_inizio
                              ? new Date(offerta.data_inizio).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
                              : ""}
                            {offerta.data_inizio && offerta.data_fine ? " → " : ""}
                            {offerta.data_fine
                              ? new Date(offerta.data_fine).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })
                              : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Eventi */}
        {eventi.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Calendar className="h-3.5 w-3.5 text-blue-500" />
              Eventi ({eventi.length})
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {eventi.map((evento) => (
                <article
                  key={evento.id}
                  className="overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white"
                >
                  <div className="flex items-start gap-3 p-3">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-100 leading-tight">
                      <span className="text-[9px] font-black uppercase tracking-tight text-blue-600">
                        {evento.data_inizio
                          ? new Date(evento.data_inizio).toLocaleDateString("it-IT", { month: "short" }).toUpperCase()
                          : "DATA"}
                      </span>
                      <span className="text-[14px] font-black text-blue-700 leading-none">
                        {evento.data_inizio
                          ? new Date(evento.data_inizio).toLocaleDateString("it-IT", { day: "2-digit" })
                          : "—"}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black text-slate-900">
                        {evento.titolo}
                      </h3>
                      {evento.descrizione && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-600">
                          {evento.descrizione}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                        {evento.luogo && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-blue-500" />
                            <span className="truncate">{evento.luogo}</span>
                          </span>
                        )}
                        {(evento.data_inizio || evento.data_fine) && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {evento.data_inizio
                              ? new Date(evento.data_inizio).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
                              : ""}
                            {evento.data_fine && evento.data_inizio && evento.data_fine !== evento.data_inizio
                              ? " → " + new Date(evento.data_fine).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })
                              : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
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
