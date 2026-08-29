import Link from "next/link";
import { permanentRedirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import StoreProductCard from "@/components/negozio/StoreProductCard";
import { OpenAssistantLink } from "@/components/assistant/OpenAssistantButton";
import SearchFilters from "@/components/ricerca/SearchFilters";
import SearchSort from "@/components/ricerca/SearchSort";
import SearchPagination from "@/components/ricerca/SearchPagination";
import { risolviNegozioPubblico, getFiltriDisponibiliProdotti, isOrdinamentoProdottiPubblici, type OrdinamentoProdottiPubblici } from "@/lib/negozi";
import { getModuliAttiviNegozio } from "@/lib/profili-attivita";
import { search } from "@/lib/search-service";
import { prodottoEsaurito } from "@/lib/prodotti-disponibilita";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import { getSiteUrl } from "@/lib/site";
import { normalizzaNumeroWhatsApp } from "@/lib/telefono";
import { getOffertePubblicheNegozio, type Offerta } from "@/lib/offerte";
import { getEventiPubbliciNegozio, type Evento } from "@/lib/eventi";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import { MapPin, Phone, MessageCircle, Tag, Calendar, Clock, Globe, Sparkles } from "lucide-react";
import OpeningHoursDisplay from "@/components/negozio/OpeningHoursDisplay";
import RichiestaInfoButton from "@/components/negozio/RichiestaInfoButton";
import PrenotazioneButton from "@/components/negozio/PrenotazioneButton";
import { getConfigRichiestaInfo } from "@/lib/negozio/richiesta-info";
import { getConfigPrenotazioni } from "@/lib/prenotazioni";
import type { Negozio, ServizioStrutturato } from "@/types/negozio";

type Params = { slug: string };

const PER_PAGINA = 12;

function parseNum(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return !Number.isNaN(n) && n > 0 ? n : undefined;
}

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

export default async function PaginaNegozio({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  };

  const qCatalogo = get("q").trim();
  const sottocategoria = get("sottocategoria").trim();
  const marca = get("marca").trim();
  const colore = get("colore").trim();
  const prezzoMin = parseNum(get("prezzo_min"));
  const prezzoMax = parseNum(get("prezzo_max"));
  const soloDisponibili = get("disponibile") === "1";
  const ordina: OrdinamentoProdottiPubblici = isOrdinamentoProdottiPubblici(get("ordina"))
    ? (get("ordina") as OrdinamentoProdottiPubblici)
    : "rilevanza";
  const pagina = Math.max(1, Number.parseInt(get("pagina"), 10) || 1);

  // Risoluzione: slug canonico oppure UUID legacy (redirect 301/308).
  const { negozio, slugLegacy } = await risolviNegozioPubblico(slug);
  if (slugLegacy) permanentRedirect(slugLegacy);
  if (!negozio) {
    notFound();
  }

  const id = negozio.id as string;
  const slugCanonico = ((negozio.slug as string) ?? "").trim() || id;

  // Catalogo del negozio: stessa query della ricerca pubblica, con negozioId.
  const catalogo = await search(qCatalogo, {
    negozioId: id,
    sottocategoria: sottocategoria || undefined,
    marca: marca || undefined,
    colore: colore || undefined,
    prezzoMin,
    prezzoMax,
    soloDisponibili: soloDisponibili || undefined,
    ordina,
    pagina,
    perPagina: PER_PAGINA,
  });
  const prodotti = catalogo.prodotti as Record<string, unknown>[];
  const totalCatalogo = catalogo.total;
  const filtriDisponibili = await getFiltriDisponibiliProdotti();

  // Moduli attivi effettivi: STESSA risoluzione dell'editor
  // (getModuliAttiviNegozio dà priorità a data.tipo_attivita → profilo,
  // con fallback su negozi.moduli_attivi). Evita che un servizio salvato
  // dall'editor (es. profilo "medico" con modulo servizi) resti nascosto
  // nella scheda pubblica perché assente nei moduli_attivi grezzi.
  const moduliAttivi: string[] = getModuliAttiviNegozio(negozio as Negozio) ?? [];

  let offerte: Offerta[] = [];
  let eventi: Evento[] = [];
  if (moduliAttivi.includes("offerte")) {
    offerte = await getOffertePubblicheNegozio(id);
  }
  if (moduliAttivi.includes("eventi")) {
    eventi = await getEventiPubbliciNegozio(id);
  }

  // Richiesta informazioni (negozi.data.richiesta_info): CTA solo se il
  // modulo è attivo nei moduli_attivi E la configurazione ha attiva === true.
  const configRichiestaInfo = moduliAttivi.includes("richiesta_info")
    ? getConfigRichiestaInfo((negozio.data ?? {}) as Record<string, unknown> | null)
    : null;
  const mostraRichiestaInfo =
    !!configRichiestaInfo && configRichiestaInfo.attiva === true;

  // Servizi strutturati (negozi.data.servizi_strutturati): solo attivi,
  // ordinati per `ordinamento` (fallback: ordine dell'array, sort stabile).
  const serviziStrutturati: ServizioStrutturato[] = (() => {
    const raw = (negozio.data as Record<string, unknown> | null | undefined)
      ?.servizi_strutturati;
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[])
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .filter((s) => s.attivo !== false)
      .sort((a, b) => {
        const oa = typeof a.ordinamento === "number" ? a.ordinamento : Number.MAX_SAFE_INTEGER;
        const ob = typeof b.ordinamento === "number" ? b.ordinamento : Number.MAX_SAFE_INTEGER;
        return oa - ob;
      }) as unknown as ServizioStrutturato[];
  })();

  // Prenotazioni (negozi.data.prenotazioni_config): CTA solo se il modulo è
  // attivo nei moduli_attivi E la configurazione ha attiva === true E c'è
  // almeno un servizio attivo prenotabile (durata_min 5–480).
  const configPrenotazioni = moduliAttivi.includes("prenotazioni")
    ? getConfigPrenotazioni((negozio.data ?? {}) as Record<string, unknown> | null)
    : null;
  const prenotazioniAttive =
    !!configPrenotazioni && configPrenotazioni.attiva === true;
  const serviziPrenotabili = prenotazioniAttive
    ? serviziStrutturati.filter((s) => {
        const d = s.durata_min;
        return typeof d === "number" && Number.isFinite(d) && d >= 5 && d <= 480;
      })
    : [];

  // Stato preferiti per il pulsante "Salva negozio" e per le card prodotto.
  const statoPreferiti = await getStatoPreferitiPerPagina();

  const imageUrl = getNegozioCardImmagine({
    logo_url: (negozio.logo_url as string) ?? null,
    categoria: (negozio.categoria as string) ?? null,
  });

  const buildWhatsAppUrl = () => {
    const number = normalizzaNumeroWhatsApp((negozio.whatsapp as string) || (negozio.telefono as string));
    const msg = encodeURIComponent(
      `Ciao! Ho trovato "${negozio.nome as string}" su InCittà e vorrei informazioni.`
    );
    return `https://wa.me/${number}?text=${msg}`;
  };

  const buildMapsUrl = () => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((negozio.indirizzo as string) || "")}`;
  };

  return (
    <main className="min-h-screen bg-[#eef3f8]">
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

        {/* Hero — copertina con identità sovrapposta */}
        <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white shadow-sm">
          <div className="relative aspect-[16/9] max-h-[230px] w-full overflow-hidden sm:aspect-[21/9]">
            <div
              role="img"
              aria-label={`Fotografia del negozio ${negozio.nome as string}`}
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/25 to-transparent" />

            {/* Identità sovrapposta */}
            <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-5">
              {negozio.categoria && (
                <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-yellow-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-yellow-950 shadow-sm">
                  <Tag className="h-3 w-3" aria-hidden />
                  {negozio.categoria as string}
                </span>
              )}
              <h1 className="truncate text-2xl font-black tracking-tight text-white drop-shadow-md sm:text-3xl">
                {negozio.nome as string}
              </h1>
              {negozio.descrizione && (
                <p className="mt-1 line-clamp-1 max-w-2xl text-xs leading-5 text-white/85 drop-shadow-sm sm:text-sm">
                  {negozio.descrizione as string}
                </p>
              )}
            </div>
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

        {/* Info compatte — pill cliccabili (mappa / telefono) */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {negozio.indirizzo && (
            <a
              href={buildMapsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-700"
            >
              <MapPin className="h-3 w-3 shrink-0 text-yellow-500" aria-hidden />
              <span className="min-w-0 truncate">{negozio.indirizzo as string}</span>
            </a>
          )}
          {negozio.telefono && (
            <a
              href={`tel:${negozio.telefono as string}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-700"
            >
              <Phone className="h-3 w-3 text-yellow-500" aria-hidden />
              {negozio.telefono as string}
            </a>
          )}
        </div>

        {/* Orari di apertura — compatti */}
        {negozio.orari && (
          <div className="mt-2">
            <OpeningHoursDisplay orari={negozio.orari as never} />
          </div>
        )}

        {/* Azioni */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-whatsapp px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-whatsapp-dark hover:shadow-md"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          )}
          {mostraRichiestaInfo && configRichiestaInfo && (
            <RichiestaInfoButton
              slug={slugCanonico ?? slug}
              titolo={configRichiestaInfo.titolo}
              testo={configRichiestaInfo.testo}
              tipo={configRichiestaInfo.tipo}
              emailObbligatoria={configRichiestaInfo.email_obbligatoria}
              telefonoObbligatoria={configRichiestaInfo.telefono_obbligatorio}
              messaggioObbligatoria={configRichiestaInfo.messaggio_obbligatorio}
            />
          )}
          {serviziPrenotabili.length > 0 && configPrenotazioni && (
            <PrenotazioneButton
              slug={slugCanonico ?? slug}
              servizi={serviziPrenotabili}
              config={configPrenotazioni}
              etichetta="Prenota ora"
            />
          )}
          {negozio.indirizzo && (
            <a
              href={buildMapsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 hover:shadow"
            >
              <MapPin className="h-4 w-4" />
              Mappa
            </a>
          )}
          {negozio.telefono && (
            <a
              href={`tel:${negozio.telefono as string}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 hover:shadow"
            >
              <Phone className="h-4 w-4" />
              Chiama
            </a>
          )}
          {negozio.sito_web && (
            <a
              href={(negozio.sito_web as string).startsWith("http") ? (negozio.sito_web as string) : `https://${negozio.sito_web as string}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 hover:shadow"
            >
              <Globe className="h-4 w-4" />
              Sito web
            </a>
          )}
        </div>

        {/* Catalogo prodotti del negozio (Fase C: filtri/ordinamento/paginazione) */}
        <section className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Prodotti
            </h2>
            <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-black text-slate-600">
              {totalCatalogo}
            </span>
            <span className="ml-auto">
              <SearchSort basePath={`/negozio/${slugCanonico}`} value={ordina} />
            </span>
          </div>

          {/* Filtri compatti (desktop inline, mobile sotto) */}
          <div className="mb-3 hidden lg:block">
            <SearchFilters
              basePath={`/negozio/${slugCanonico}`}
              current={{
                q: qCatalogo,
                sottocategoria: sottocategoria || undefined,
                marca: marca || undefined,
                colore: colore || undefined,
                prezzoMin: prezzoMin !== undefined ? String(prezzoMin) : undefined,
                prezzoMax: prezzoMax !== undefined ? String(prezzoMax) : undefined,
                soloDisponibili: soloDisponibili || undefined,
              }}
              disponibili={filtriDisponibili}
              showCategoria={false}
              compact
            />
          </div>
          <details className="mb-3 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold text-slate-600 [&::-webkit-details-marker]:hidden">
              Filtri e ricerca nel catalogo
            </summary>
            <div className="mt-2">
              <SearchFilters
                basePath={`/negozio/${slugCanonico}`}
                current={{
                  q: qCatalogo,
                  sottocategoria: sottocategoria || undefined,
                  marca: marca || undefined,
                  colore: colore || undefined,
                  prezzoMin: prezzoMin !== undefined ? String(prezzoMin) : undefined,
                  prezzoMax: prezzoMax !== undefined ? String(prezzoMax) : undefined,
                  soloDisponibili: soloDisponibili || undefined,
                }}
                disponibili={filtriDisponibili}
                showCategoria={false}
                compact
              />
            </div>
          </details>

          {prodotti.length > 0 ? (
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
                    esaurito={prodottoEsaurito(
                      prodotto.quantita_disponibile != null ? Number(prodotto.quantita_disponibile) : null,
                      prodotto.quantita_riservata != null ? Number(prodotto.quantita_riservata) : null
                    )}
                    haVarianti={Boolean(prodotto.ha_varianti)}
                    preferitoAttivo={statoPreferiti.chiavi.has(chiavePreferito("prodotto", prodottoId))}
                    autenticato={statoPreferiti.autenticato}
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-white p-4 text-center">
              <p className="text-xs text-slate-400">
                {qCatalogo || sottocategoria || marca || colore || prezzoMin !== undefined || prezzoMax !== undefined || soloDisponibili
                  ? "Nessun prodotto trovato con questi filtri."
                  : "Nessun prodotto pubblicato. Torna a trovarci presto!"}
              </p>
            </div>
          )}

          <SearchPagination
            basePath={`/negozio/${slugCanonico}`}
            params={{
              q: qCatalogo || undefined,
              sottocategoria: sottocategoria || undefined,
              marca: marca || undefined,
              colore: colore || undefined,
              prezzo_min: prezzoMin !== undefined ? String(prezzoMin) : undefined,
              prezzo_max: prezzoMax !== undefined ? String(prezzoMax) : undefined,
              disponibile: soloDisponibili ? "1" : undefined,
              ordina: ordina === "rilevanza" ? undefined : ordina,
            }}
            pagina={pagina}
            totale={totalCatalogo}
            perPagina={PER_PAGINA}
          />
        </section>

        {/* Offerte */}
        {offerte.length > 0 && (
          <section className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Tag className="h-3.5 w-3.5 text-yellow-500" />
                Offerte
              </h2>
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-black text-yellow-700">
                {offerte.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {offerte.map((offerta) => (
                <article
                  key={offerta.id}
                  className="overflow-hidden rounded-xl border border-yellow-100 bg-gradient-to-br from-yellow-50 to-white"
                >
                  <div className="flex items-start gap-3 p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-100">
                      <Tag className="h-5 w-5 text-yellow-600" />
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
                          <span className="rounded-md bg-yellow-500 px-1.5 py-0.5 text-[11px] font-black text-white">
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
          <section className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Calendar className="h-3.5 w-3.5 text-blue-500" />
                Eventi
              </h2>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
                {eventi.length}
              </span>
            </div>
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

        {/* Servizi strutturati */}
        {moduliAttivi.includes("servizi") && serviziStrutturati.length > 0 && (
          <section className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                Servizi
              </h2>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
                {serviziStrutturati.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {serviziStrutturati.map((servizio) => (
                <article
                  key={servizio.id ?? servizio.nome}
                  className="overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white"
                >
                  <div className="flex items-start gap-3 p-3">
                    {servizio.immagine ? (
                      <img
                        src={servizio.immagine}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg border border-white object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                        <Sparkles className="h-5 w-5 text-blue-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black text-slate-900">
                        {servizio.nome}
                      </h3>
                      {servizio.descrizione && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-600">
                          {servizio.descrizione}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {servizio.prezzo != null && (
                          <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[11px] font-black text-white">
                            {servizio.prezzo_da ? "A partire da €" : "€"}
                            {Number(servizio.prezzo).toFixed(2)}
                          </span>
                        )}
                        {servizio.durata_min != null && servizio.durata_min > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Clock className="h-3 w-3" />
                            {servizio.durata_min} min
                          </span>
                        )}
                      </div>
                    </div>
                    {(() => {
                      const d = servizio.durata_min;
                      const prenotabile =
                        typeof d === "number" && Number.isFinite(d) && d >= 5 && d <= 480;
                      return prenotabile && configPrenotazioni ? (
                        <PrenotazioneButton
                          slug={slugCanonico ?? slug}
                          servizi={serviziPrenotabili}
                          config={configPrenotazioni}
                          servizioIniziale={servizio.id}
                          etichetta="Prenota"
                          compatto
                        />
                      ) : null;
                    })()}
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
