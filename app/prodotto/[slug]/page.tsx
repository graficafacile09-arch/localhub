import Link from "next/link";
import { permanentRedirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import { risolviProdottoPubblico, getNegozio } from "@/lib/negozi";
import { getSessionArea } from "@/lib/auth/session-area";
import { utentePossiedeNegozio } from "@/lib/merchant/data";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { LOGHI_RICONOSCIMENTO, riconoscimentoProdotto } from "@/lib/territori";
import { disponibilitaReale, prodottoEsaurito } from "@/lib/prodotti-disponibilita";
import { getProductMediaPubbliche } from "@/lib/prodotti-media";
import { getVariantiPubblicheProdotto } from "@/lib/varianti-pubbliche";
import ProductGallery, { type GalleryImage } from "@/components/prodotto/ProductGallery";
import ProductVariantSelector from "@/components/prodotto/ProductVariantSelector";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import { getSiteUrl } from "@/lib/site";
import { normalizzaNumeroWhatsApp } from "@/lib/telefono";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import ShareActivityButton from "@/components/negozio/ShareActivityButton";
import SegnalaAbusoButton from "@/components/cliente/segnalazioni/SegnalaAbusoButton";
import AggiungiAlCarrelloButton from "@/components/carrello/AggiungiAlCarrelloButton";
import AvvisamiDisponibilitaButton from "@/components/prodotto/AvvisamiDisponibilitaButton";
import { MapPin, Phone, MessageCircle, ArrowLeft, ExternalLink, ShoppingBag, Store } from "lucide-react";
import ProductAgeGate from "@/components/prodotto/ProductAgeGate";

type Params = { slug: string };

// ─── SEO ─────────────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const { prodotto } = await risolviProdottoPubblico(slug);
  if (!prodotto) return { title: "Prodotto non trovato" };

  const nome = (prodotto.nome as string) ?? "Prodotto";
  const descrizione =
    ((prodotto.descrizione_completa as string) ?? (prodotto.descrizione as string) ?? "")
      .slice(0, 155) || `${nome} disponibile su Radici Calabria.`;
  const canonical = `${getSiteUrl()}/prodotto/${prodotto.slug as string}`;

  // Immagine Open Graph: sempre URL ASSOLUTO (Meta/abbonati richiedono URL
  // assoluti). getProdottoImmagine può restituire un percorso Pexels assoluto
  // oppure un percorso relativo /negozi/… : in quel caso lo anteponiamo al base.
  const immagineOg = (() => {
    const src = getProdottoImmagine({
      immagine_principale: prodotto.immagine_principale as string | null,
      categoria: prodotto.categoria as string | null,
    });
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    return `${getSiteUrl()}${src?.startsWith("/") ? src : `/${src}`}`;
  })();

  // title/og:title senza il suffisso "| Radici Calabria": il template del layout
  // ("%s | Radici Calabria") lo aggiunge, evitando il duplicato "… | Radici Calabria | Radici Calabria".
  return {
    title: nome,
    description: descrizione,
    alternates: { canonical },
    openGraph: {
      title: nome,
      description: descrizione,
      url: canonical,
      type: "website",
      siteName: "Radici Calabria",
      images: [{ url: immagineOg, alt: nome }],
    },
    twitter: {
      card: "summary_large_image",
      title: nome,
      description: descrizione,
      images: [immagineOg],
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

  const id = String(prodotto.id);
  // Riconoscimento documentato del prodotto: mappa esplicita per slug, nessuna
  // certificazione dedotta dal nome o dalla categoria.
  const riconoscimento = riconoscimentoProdotto(String(prodotto.slug ?? id));
  const logoRiconoscimento = riconoscimento ? LOGHI_RICONOSCIMENTO[riconoscimento] ?? null : null;
  const soggettoVerificaEta = Boolean((prodotto as Record<string, unknown>).soggetto_verifica_eta);
  const cookieStore = await cookies();
  const ageVerified = cookieStore.get(`incitta_age_verified_v2_${id}`)?.value === "1";
  const ageBlocked = cookieStore.get(`incitta_age_blocked_v2_${id}`)?.value === "1";

  // Un prodotto 18+ non espone la scheda finché l'age gate non è superato.
  // La verifica avviene server-side e il cookie non contiene la data di nascita.
  if (soggettoVerificaEta && !ageVerified) {
    return <ProductAgeGate prodottoId={id} slug={String(prodotto.slug ?? slug)} bloccato={ageBlocked} />;
  }

  const negozio = await getNegozio(String(prodotto.negozio_id));

  // REGOLA AUTO-ACQUISTO: se l'utente autenticato è un VENDITORE e il
  // prodotto appartiene al SUO negozio (owner_user_id), la CTA "Acquista"
  // viene sostituita dall'etichetta informativa "Il tuo prodotto" (il
  // blocco è poi applicato anche server-side nelle API ordini).
  const sessione = await getSessionArea();
  let eIlMioProdotto = false;
  if (sessione && prodotto.negozio_id) {
    try {
      eIlMioProdotto = await utentePossiedeNegozio(
        sessione.user.id,
        String(prodotto.negozio_id)
      );
    } catch {
      eIlMioProdotto = false;
    }
  }

  // Stato preferiti per il pulsante "Salva" del prodotto.
  const statoPreferiti = await getStatoPreferitiPerPagina();

  const imageUrl = getProdottoImmagine({
    immagine_principale: "immagine_principale" in prodotto ? (prodotto.immagine_principale as string | null) : null,
    categoria: "categoria" in prodotto ? (prodotto.categoria as string | null) : null,
  });

  // FASE E4 — varianti prodotto: se ha_varianti=true la pagina mostra il
  // selettore varianti al posto di immagine+prezzo+disponibilità+CTA legacy.
  // Le varianti inattive sono escluse a monte dal data layer pubblico.
  const haVarianti = Boolean((prodotto as Record<string, unknown>).ha_varianti);
  const varianti = haVarianti ? await getVariantiPubblicheProdotto(id) : [];

  // Galleria multi-immagine (product_media): SOLO per i prodotti legacy
  // (per i prodotti con varianti l'immagine principale è gestita dal
  // selettore varianti). product_media non ha una colonna alt_text: l'alt
  // testuale è il fallback alt_text_immagine del prodotto.
  const media = haVarianti
    ? []
    : await getProductMediaPubbliche(String(prodotto.id));
  const immaginiGalleria: GalleryImage[] = media.map((m) => ({
    id: m.id,
    url: m.public_url,
    role: m.role,
  }));

  const prezzo = "prezzo" in prodotto ? Number(prodotto.prezzo) : 0;
  const quantita = "quantita_disponibile" in prodotto ? (prodotto.quantita_disponibile as number | null) : null;
  const quantitaRiservata = "quantita_riservata" in prodotto ? (prodotto.quantita_riservata as number | null) : null;
  const disponibile = disponibilitaReale(quantita, quantitaRiservata);
  const esaurito = prodottoEsaurito(quantita, quantitaRiservata);
  const stato = "stato_condizione" in prodotto ? (prodotto.stato_condizione as string | null) : null;

  const buildWhatsAppUrl = () => {
    if (!negozio) return "#";
    const number = normalizzaNumeroWhatsApp((negozio.whatsapp as string) || (negozio.telefono as string));
    const msg = encodeURIComponent(
      `Ciao! Vorrei informazioni su "${prodotto.nome as string}" visto su Radici Calabria.`
    );
    return `https://wa.me/${number}?text=${msg}`;
  };

  const buildMapsUrl = () => {
    if (!negozio?.indirizzo) return "#";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negozio.indirizzo as string)}`;
  };

  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      <div className="rd-guscio py-5 pb-12 md:py-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a8378]">
          <Link href="/" className="transition hover:text-[#24462f]">Home</Link>
          <span>/</span>
          <Link href="/negozi" className="transition hover:text-[#24462f]">Negozi</Link>
          <span>/</span>
          <span className="truncate font-bold text-[#24462f]">{prodotto.nome as string}</span>
        </nav>

        {/* Back to store */}
        {negozio && (
          <Link
            href={`/negozio/${negozio.slug}`}
            className="rd-link-freccia mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Torna a {negozio.nome as string}
          </Link>
        )}

        {haVarianti ? (
          <>
            <ProductVariantSelector
              eIlMioProdotto={eIlMioProdotto}
              slug={String(prodotto.slug ?? id)}
              prodottoId={id}
              negozioId={String(negozio?.id ?? "")}
              negozioNome={String(negozio?.nome ?? "")}
              nome={prodotto.nome as string}
              categoria={"categoria" in prodotto ? (prodotto.categoria as string | null) : null}
              descrizione={"descrizione" in prodotto ? (prodotto.descrizione as string | null) : null}
              statoCondizione={stato}
              prezzoBase={prezzo}
              immagineBase={imageUrl}
              altText={"alt_text_immagine" in prodotto ? (prodotto.alt_text_immagine as string | null) : null}
              varianti={varianti}
              soggettoVerificaEta={soggettoVerificaEta}
            />
            <div className="mt-4">
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
            {esaurito && (
              <div className="mt-2">
                <AvvisamiDisponibilitaButton
                  prodottoId={id}
                  autenticato={statoPreferiti.autenticato}
                />
              </div>
            )}
          </>
        ) : (
          <>
        <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-8 lg:gap-10">
        {/* Desktop: foto a sinistra, informazioni e acquisto a destra. Su mobile resta impilato come prima. */}
        <div className="min-w-0">
        <ProductGallery
          immagini={immaginiGalleria}
          fallbackUrl={imageUrl}
          altText={"alt_text_immagine" in prodotto ? (prodotto.alt_text_immagine as string | null) : null}
          nomeProdotto={prodotto.nome as string}
          marchio={riconoscimento}
          logoMarchio={logoRiconoscimento}
        />
        </div>

        <div className="min-w-0">
        {/* Product info */}
        <div className="rd-scheda mt-4 p-5 sm:p-6 md:mt-0">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <h1 className="mt-1 text-[1.75rem] font-extrabold leading-[1.1] tracking-tight text-[#1b3624] sm:text-[2.1rem]">
                {prodotto.nome as string}
              </h1>
              {"categoria" in prodotto && prodotto.categoria && (
                <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#8a5a3b]">
                  {prodotto.categoria as string}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[1.9rem] font-extrabold leading-none tracking-tight text-[#1b3624] tabular-nums">
                €{prezzo.toFixed(2)}
              </p>
              {stato && (
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a8378]">
                  {stato}
                </p>
              )}
            </div>
          </div>

          {soggettoVerificaEta ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-black">18+ — prodotto soggetto a verifica dell'età</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">Per acquistarlo è richiesta la conferma della maggiore età. Il controllo dell'identità previsto dalla legge resta a carico del venditore.</p>
            </div>
          ) : null}

          {"descrizione" in prodotto && prodotto.descrizione && (
            <p className="mt-4 border-t border-[#e5ded0] pt-4 text-sm leading-7 text-[#57534e]">
              {prodotto.descrizione as string}
            </p>
          )}

          {"descrizione_completa" in prodotto && (prodotto as Record<string, unknown>).descrizione_completa && (
            <p className="mt-3 text-sm leading-7 text-[#6b6459]">
              {(prodotto as Record<string, unknown>).descrizione_completa as string}
            </p>
          )}

          {/* Availability (disponibilità reale, considera la riserva) */}
          {quantita !== null && (
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#e5ded0] pt-3">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-[#e5ded0] ${!esaurito ? "bg-[#f4efe4] text-[#24462f]" : "bg-[#f4efe4] text-[#8a5a3b]"}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${!esaurito ? "bg-[#24462f]" : "bg-[#8a5a3b]"}`} />
                {!esaurito ? `${disponibile} disponibili` : "Esaurito"}
              </span>
              <span className="text-[10px] leading-4 text-[#8a5a3b]">
                Demo: account e dati di test; acquisti non attivi.
              </span>
            </div>
          )}
        </div>

        {/* Acquista — sostituito da "Il tuo prodotto" per il venditore del
            negozio proprietario (regola auto-acquisto, blocco anche API) */}
        <div className="mt-4 space-y-3">
          {eIlMioProdotto ? (
            <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e5ded0] bg-[#f4efe4] px-4 py-3 text-base font-bold text-[#24462f]">
              <Store className="h-5 w-5 shrink-0" aria-hidden />
              Il tuo prodotto
            </div>
          ) : (
            <>
              <Link
                href={`/prodotto/${prodotto.slug}/acquista`}
                className="rd-azione w-full py-3.5 text-base"
              >
                <ShoppingBag className="h-5 w-5" />
                ACQUISTA
              </Link>
              <AggiungiAlCarrelloButton
                prodottoId={id}
                varianteId={null}
                nome={prodotto.nome as string}
                prezzo={prezzo}
                immagine={imageUrl}
                variante={null}
                negozioId={String(negozio?.id ?? "")}
                negozioNome={String(negozio?.nome ?? "")}
                slug={String(prodotto.slug ?? id)}
                soggettoVerificaEta={soggettoVerificaEta}
                disabled={esaurito || !negozio}
              />
            </>
          )}
          {esaurito && (
            <AvvisamiDisponibilitaButton
              prodottoId={id}
              autenticato={statoPreferiti.autenticato}
            />
          )}
          <FavoritoButton
            tipo="prodotto"
            riferimentoId={id}
            attivo={statoPreferiti.chiavi.has(chiavePreferito("prodotto", id))}
            autenticato={statoPreferiti.autenticato}
            variante="inline"
            className="w-full"
            label={String(prodotto.nome ?? "")}
          />
          <div className="w-full">
            <ShareActivityButton
              title={String(prodotto.nome ?? "Prodotto")}
              description={String((prodotto as Record<string, unknown>).descrizione_completa ?? prodotto.descrizione ?? "")}
              url={`/prodotto/${String(prodotto.slug ?? id)}`}
            />
          </div>
          <SegnalaAbusoButton
            targetType="prodotto"
            targetName={String(prodotto.nome ?? "Prodotto")}
            negozioId={String(negozio?.id ?? "")}
          />
          </div>
        </div>
        </div>
          </>
        )}

        {/* Store info */}
        {negozio && (
          <div className="rd-pannello mt-6 p-5">
            <p className="rd-occhiello mb-2">Venduto da</p>
            <Link
              href={`/negozio/${negozio.slug}`}
              className="rd-titolo-scheda text-base transition hover:text-[#8a5a3b]"
            >
              {negozio.nome as string}
            </Link>
            {negozio.categoria && (
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8a5a3b]">
                {negozio.categoria as string}
              </p>
            )}
            {negozio.descrizione && (
              <p className="mt-2 text-sm leading-6 text-[#57534e]">
                {negozio.descrizione as string}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#6b6459]">
              {negozio.indirizzo && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-[#8a5a3b]" />
                  {negozio.indirizzo as string}
                </span>
              )}
              {negozio.telefono && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3 text-[#8a5a3b]" />
                  {negozio.telefono as string}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="mt-3 flex flex-wrap gap-2">
              {!eIlMioProdotto && (
                <Link
                  href={`/prodotto/${prodotto.slug}/acquista`}
                  className="rd-azione h-8 px-3 py-0 text-xs"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Acquista
                </Link>
              )}
              {negozio?.telefono && (
                <a
                  href={buildWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-whatsapp px-3 py-1.5 text-xs font-bold text-white transition hover:bg-whatsapp-dark"
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
                  className="rd-azione-tenue h-8 px-3 py-0 text-xs"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Mappa
                </a>
              )}
              {negozio.telefono && (
                <a
                  href={`tel:${negozio.telefono as string}`}
                  className="rd-azione-tenue h-8 px-3 py-0 text-xs"
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
                  className="rd-azione-tenue h-8 px-3 py-0 text-xs"
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
