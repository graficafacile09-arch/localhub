import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import Link from "next/link";
import Image from "next/image";

import {
  ArrowRight,
  SearchCheck,
  Store,
  Tag,
} from "lucide-react";
import {
  getNegoziInEvidenza,
  getProdottiCatalogoHomepage,
  getProdottiTipici,
} from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { puoUsareNextImage } from "@/lib/immagini-remote";
import HomepageFiliereShowcase from "@/components/home/HomepageFiliereShowcase";
import { ProductSectionCard } from "@/components/home/HomepageProductShowcase";
import HomepageProductSwipeReveal from "@/components/home/HomepageProductSwipeReveal";
import TerritorioScroll from "@/components/home/TerritorioScroll";
import ScopriFilieraHeroButton from "@/components/home/ScopriFilieraHeroButton";
import { TERRITORI } from "@/lib/territori";
import { getProdottiTerritorio } from "@/lib/territori-prodotti";
import { raggruppaProdottiPerFiliera } from "@/lib/filiere-prodotti";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";

// La homepage deve riflettere in tempo reale i negozi in evidenza flaggati
// dal merchant (il toggle "In evidenza" della dashboard), quindi non viene
// prerenderizzata staticamente a build.
export const dynamic = "force-dynamic";

// Title e canonical espliciti: senza, la home ereditava il title di default e
// nessuna delle due pagine principali dichiarava la propria URL canonica.
export const metadata: Metadata = {
  title: "Radici Calabria | Filiere, Prodotti e Territori",
  description:
    "Una piattaforma che valorizza le produzioni, le imprese e le identità territoriali, collegando produttori, trasformatori, distributori e consumatori.",
  alternates: { canonical: "/" },
};

/**
 * Intestazione di sezione coerente (label + titolo + eventuale link):
 * un solo pattern visivo per tutte le sezioni della homepage.
 */
function SezioneHeader({
  label,
  titolo,
  href,
  linkLabel,
  titoloClassName,
}: {
  label?: string;
  titolo: string;
  href?: string;
  linkLabel?: string;
  titoloClassName?: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {label && <p className="section-label font-black text-slate-700">{label}</p>}
        <h2
          className={
            titoloClassName ??
            `mt-1 font-black tracking-tight text-slate-900 ${
              label ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"
            }`
          }
        >
          {titolo}
        </h2>
      </div>
      {href && linkLabel && (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-blue-700 transition hover:text-blue-900 hover:underline"
        >
          {linkLabel}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

export default async function Home() {
  const [negozi, prodottiCatalogo, prodottiTipici, statoPreferiti, prodottiTerritori] =
    await Promise.all([
      getNegoziInEvidenza(8),
      // La vetrina mostra poche decine di prodotti per categoria: 1000 righe
      // (con descrizioni e immagini) erano lavoro e payload inutili.
      getProdottiCatalogoHomepage(120),
      getProdottiTipici(60),
      getStatoPreferitiPerPagina(),
      // Prodotti di tutti i territori in una sola query: servono alle schede
      // aperte della fascia Territorio in homepage.
      getProdottiTerritorio(TERRITORI.flatMap((territorio) => territorio.prodotti)),
    ]);

  // Prodotti di ogni filiera: catalogo dei negozi + prodotti tipici, senza
  // duplicati. Servono alla scheda della filiera aperta (e solo a quella).
  const prodottiPerFiliera = raggruppaProdottiPerFiliera([
    ...prodottiCatalogo,
    ...prodottiTipici,
  ]);

  return (
    <main className="min-h-screen bg-[#eef3f8]">
      <Header homepage />

      <HomepageProductSwipeReveal
        hero={
          <>
            {/* HERO — grafica del mockup approvato. Resta la fotografia
                originale del progetto (Piana di Sibari): nessuna immagine
                generata, nessun paesaggio sostituito. */}
            <section className="incitta-home-hero relative h-[400px] overflow-hidden bg-[#dbe7ef] md:h-[clamp(330px,25.2vw,400px)]">
              <Image
                src="/territorio/piana-di-sibari.jpg"
                alt="La piana di Sibari vista dall'alto, tra agrumeti, oliveti e colture"
                fill
                sizes="100vw"
                // `priority` è deprecata in Next 16: `preload` emette il
                // <link rel="preload"> per l'immagine LCP, mentre
                // `fetchPriority` alza la priorità del download dell'<img>.
                preload
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover object-[50%_23%]"
              />
              <div className="relative z-10 mx-auto flex h-full w-full max-w-[1500px] flex-col items-start px-4 pb-24 pt-10 md:px-20 md:pt-14 lg:px-[95px] lg:pt-16">
                <div className="relative max-w-[820px]">
                  {/* Nuvola luminosa: gradienti radiali sovrapposti, sopra la
                      fotografia e sotto i testi (z-0 contro z-10). */}
                  <div aria-hidden="true" className="incitta-hero-cloud" />
                  <h1 className="relative z-10 font-sans text-[clamp(2.6rem,6vw,5.65rem)] leading-[0.92] tracking-[-0.04em] text-forest">
                    <span className="block font-extrabold">La Calabria</span>
                    <span className="mt-1 block font-serif text-[1.09em] font-semibold italic leading-[0.9] tracking-[-0.012em] text-gold">
                      che produce
                    </span>
                  </h1>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 600 40"
                    preserveAspectRatio="none"
                    fill="none"
                    className="relative z-10 -mt-1 block h-[26px] w-full max-w-[560px] text-gold md:-ml-[6px] md:h-[30px]"
                  >
                    {/* Pennellata dorata: spessa al centro, assottigliata alle estremità. */}
                    <path
                      d="M2 30 C 40 16, 120 10, 232 9 C 360 8, 484 12, 598 19 C 468 16, 340 16, 240 20 C 128 25, 48 30, 4 37 Z"
                      fill="currentColor"
                      opacity="0.92"
                    />
                  </svg>
                  <div className="relative z-10 mt-3 inline-block max-w-full md:ml-[73px]">
                    <p className="text-lg font-bold leading-snug text-forest sm:text-xl md:text-[1.65rem]">
                      Tradizione, qualità e futuro.
                    </p>
                  </div>
                </div>
                {/* Marchi di certificazione: stessi asset ufficiali (/loghi) e
                    resa a tessere bianche, sopra la fotografia attuale.
                    Su desktop stanno a destra, all'altezza dello spazio tra
                    "La Calabria" e "che produce", con la CTA centrata sotto;
                    su mobile restano sotto la frase, con più aria.
                    Tessere discrete ma leggibili: le sigle dentro i loghi
                    devono restare riconoscibili anche su telefono. */}
                <div className="relative z-10 mt-6 flex flex-wrap items-center gap-1.5 md:mt-4 md:gap-2 lg:mt-1 xl:absolute xl:right-[95px] xl:top-[calc(4rem_+_0.92*min(6vw,5.65rem))] xl:mt-0 xl:-translate-y-7 xl:flex-col xl:items-center xl:gap-4">
                  <div className="flex flex-wrap items-center justify-center gap-1.5 md:gap-2 xl:gap-2">
                    {[
                      { src: "/loghi/dop.png", alt: "DOP — Denominazione di Origine Protetta", w: 26, h: 26 },
                      { src: "/loghi/igp.png", alt: "IGP — Indicazione Geografica Protetta", w: 26, h: 26 },
                      { src: "/loghi/pat.png", alt: "PAT — Prodotti Agroalimentari Tradizionali Italiani", w: 26, h: 26 },
                      { src: "/loghi/igt.png", alt: "IGT — Indicazione Geografica Tipica", w: 26, h: 26 },
                      { src: "/loghi/coldiretti.webp", alt: "Coldiretti", w: 20, h: 24 },
                      { src: "/loghi/bio.png", alt: "Biologico — logo europeo", w: 39, h: 26 },
                      { src: "/loghi/slow-food.png", alt: "Slow Food", w: 50, h: 24 },
                    ].map((logo) => (
                      <span
                        key={logo.src}
                        className="flex h-7 items-center justify-center rounded bg-white/95 p-0.5 shadow-sm ring-1 ring-black/10 md:h-9 md:rounded md:p-1 lg:h-12 xl:h-14 xl:p-2"
                      >
                        <Image
                          src={logo.src}
                          alt={logo.alt}
                          width={logo.w}
                          height={logo.h}
                          className="h-5 w-auto object-contain md:h-7 lg:h-9 xl:h-[44px]"
                        />
                      </span>
                    ))}
                  </div>
                  {/* CTA desktop: centrata sotto i marchi di certificazione */}
                  <ScopriFilieraHeroButton variante="desktop" />
                </div>
                {/* CTA mobile: subito sotto i marchi, dentro la fotografia */}
                <ScopriFilieraHeroButton />
              </div>
            </section>
          </>
        }
        valueStrip={
          <>
            {/* VALUE STRIP — tre promesse */}
            <section className="border-y border-slate-200 bg-white shadow-sm">
              <div className="mx-auto grid max-w-7xl grid-cols-3 gap-2 px-3 py-3 md:gap-4 md:px-6 md:py-4">
                <div className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-2.5 sm:text-left">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold text-white shadow-[0_4px_14px_-4px_rgba(213,168,58,0.45)] sm:h-8 sm:w-8">
                    <Store className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-[10px] font-black leading-tight text-slate-900 sm:text-sm">Sostieni il commercio locale</h2>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-2.5 sm:text-left">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold text-white shadow-[0_4px_14px_-4px_rgba(213,168,58,0.45)] sm:h-8 sm:w-8">
                    <SearchCheck className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-[10px] font-black leading-tight text-slate-900 sm:text-sm">Trova tutto in un unico posto</h2>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-2.5 sm:text-left">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold text-white shadow-[0_4px_14px_-4px_rgba(213,168,58,0.45)] sm:h-8 sm:w-8">
                    <Tag className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-[10px] font-black leading-tight text-slate-900 sm:text-sm">Offerte dal territorio</h2>
                  </div>
                </div>
              </div>
            </section>
          </>
        }
        products={
          // Pannello aperto da "Scopri la filiera": le dieci filiere, ciascuna
          // con i propri prodotti dentro la scheda aperta. Nessun elenco di
          // altre filiere sotto: si aprirebbe la confusione.
          <HomepageFiliereShowcase prodottiPerFiliera={prodottiPerFiliera} />
        }
      />

      {/* ═══════════════════════════════════════════════════════════════════
          TERRITORIO — le schede aperte dei territori, sopra le eccellenze.
          ═══════════════════════════════════════════════════════════════════ */}
      <TerritorioScroll prodotti={prodottiTerritori} statoPreferiti={statoPreferiti} />

      {/* ═══════════════════════════════════════════════════════════════════
          ECCELLENZE CALABRESI — stessa scheda gialla, fuori dallo swipe.
          ═══════════════════════════════════════════════════════════════════ */}

      {prodottiTipici.length > 0 && (
        <section className="mx-auto max-w-[1800px] px-4 py-12 md:px-6 md:py-14">
          <ProductSectionCard
            titolo="Eccellenze calabresi"
            href="/prodotti-tipici"
            prodotti={prodottiTipici}
            statoPreferiti={statoPreferiti}
            prodottoTipico
            evidenziato
            standalone
          />
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          NEGOZI IN EVIDENZA (solo se ce ne sono)
          ═══════════════════════════════════════════════════════════════════ */}
      {negozi.length > 0 && (
        <section className="border-y border-slate-100 bg-white py-12 md:py-14">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <SezioneHeader
              label="Scopri"
              titolo="Negozi in evidenza"
              href="/negozi?featured=1"
              linkLabel="Vedi tutti"
            />

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {negozi.map((negozio) => {
                // Stessa logica di rendering della vetrina pubblica (scheda
                // aperta del negozio e CategoryStoreCard): la copertina è SEMPRE
                // la foto principale della card. Il logo NON viene mai usato
                // come sfondo (era la causa dello zoom): resta nel badge
                // circolare sovrapposto, piccolo, come nella scheda aperta.
                const immaginiCopertina = getNegozioCardImmagine({
                  copertina_url: (negozio.copertina_url as string | null) ?? null,
                  logo_url: null,
                  categoria: negozio.categoria,
                });
                const logoNegozio =
                  typeof negozio.logo_url === "string" &&
                  (negozio.logo_url.startsWith("http://") ||
                    negozio.logo_url.startsWith("https://") ||
                    negozio.logo_url.startsWith("/"))
                    ? negozio.logo_url.trim()
                    : null;

                return (
                  <div
                    key={negozio.id}
                    className="group relative flex flex-col justify-between overflow-visible rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    <Link
                      href={`/negozio/${negozio.slug}`}
                      aria-label={`Vai al negozio ${negozio.nome}`}
                      className="flex flex-1 flex-col justify-between"
                    >
                      <div>
                        <div className="relative h-48 w-full overflow-hidden rounded-t-2xl bg-slate-100">
                          {/* Copertina servita dall'ottimizzatore: le immagini
                              Supabase erano PNG a piena risoluzione senza cache
                              CDN. Host non configurati ricadono sul CSS. */}
                          {puoUsareNextImage(immaginiCopertina) ? (
                            <Image
                              src={immaginiCopertina}
                              alt={negozio.nome}
                              fill
                              sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                              className="object-cover object-center transition duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div
                              role="img"
                              aria-label={negozio.nome}
                              className="absolute inset-0 bg-cover bg-center transition duration-300 group-hover:scale-105"
                              style={{ backgroundImage: `url(${immaginiCopertina})` }}
                            />
                          )}
                          {logoNegozio && (
                            <div className="absolute bottom-3 left-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white shadow-sm">
                              {puoUsareNextImage(logoNegozio) ? (
                                <Image
                                  src={logoNegozio}
                                  alt={`Logo ${negozio.nome}`}
                                  width={56}
                                  height={56}
                                  sizes="56px"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div
                                  role="img"
                                  aria-label={`Logo ${negozio.nome}`}
                                  className="h-full w-full bg-cover bg-center"
                                  style={{ backgroundImage: `url(${logoNegozio})` }}
                                />
                              )}
                            </div>
                          )}
                          {negozio.categoria && (
                            <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-blue-900 shadow-sm">
                              {negozio.categoria}
                            </span>
                          )}
                        </div>

                        <div className="p-5">
                          <h3 className="text-xl font-bold text-slate-900 transition group-hover:text-blue-700">
                            {negozio.nome}
                          </h3>

                          <p className="mt-2 text-sm text-slate-600 line-clamp-2">
                            {negozio.descrizione || "Scopri le migliori offerte e prodotti selezionati."}
                          </p>
                        </div>
                      </div>

                      <div className="p-5 pt-0">
                        <span className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 py-2.5 text-center text-sm font-bold text-blue-900 shadow-sm transition group-hover:bg-yellow-300">
                          Scopri il negozio
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </span>
                      </div>
                    </Link>
                    <FavoritoButton
                      tipo="negozio"
                      riferimentoId={negozio.id}
                      attivo={statoPreferiti.chiavi.has(chiavePreferito("negozio", negozio.id))}
                      autenticato={statoPreferiti.autenticato}
                      className="absolute right-2.5 top-2.5 z-10"
                      label={negozio.nome}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TERRITORIO — il valore del commercio locale (banda verde brand)
          ═══════════════════════════════════════════════════════════════════ */}
      <section data-pino-footer-zone="true" className="relative border-y border-gold/30 bg-gradient-to-br from-forest via-forest-deep to-forest-deep text-cream">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center md:px-6 md:py-20">
          <h2 className="mx-auto max-w-2xl text-3xl font-black leading-tight tracking-tight text-cream md:text-4xl">
            Porta la tua realtà dentro <span className="font-serif italic text-gold-soft">Radici Calabria</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-cream/75 md:text-base">
            Fai conoscere la tua attività, valorizza i tuoi prodotti e racconta le tue produzioni.
            Entra in una rete che collega produttori, imprese, distributori e attività commerciali ai
            consumatori, portando le eccellenze dei territori nelle città.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm font-bold leading-6 text-gold-soft md:text-base">
            Dai valore a ciò che fai. Entra nella rete.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login?area=merchant"
              className="inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3 text-sm font-black text-forest-deep shadow-[0_10px_26px_-14px_rgba(0,0,0,0.75)] transition hover:bg-gold-soft hover:shadow-[0_14px_30px_-14px_rgba(0,0,0,0.8)] active:scale-95"
            >
              <Store className="h-4 w-4" aria-hidden />
              [ Entra in Radici Calabria ]
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          FOOTER HOMEPAGE — ordinato e non ridondante
          (il footer globale con la riga legale resta nel layout root)
          ═══════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-gold/20 bg-forest-deep text-cream/70">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 md:px-6 lg:grid-cols-4">
          <div>
            <p className="text-lg font-black tracking-tight text-cream">
              Radici Calabria
            </p>
            <p className="mt-2 max-w-xs text-[13px] leading-5 text-cream/60">
              Le filiere dei territori arrivano in città: produzioni, imprese e identità
              territoriali in rete, a partire dal Pollino e dalla Calabria.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.14em] text-gold-soft/75">
              Esplora
            </h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <Link href="/" className="transition hover:text-gold">Home</Link>
              </li>
              <li>
                <Link href="/filiere" className="transition hover:text-gold">Filiere</Link>
              </li>
              <li>
                <Link href="/negozi" className="transition hover:text-gold">Negozi</Link>
              </li>
              <li>
                <Link href="/categorie" className="transition hover:text-gold">Categorie</Link>
              </li>
              <li>
                <Link href="/prodotti-tipici" className="transition hover:text-gold">ECCELLENZE CALABRESI</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.14em] text-gold-soft/75">
              Le tue aree
            </h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <Link href="/login?area=cliente" className="transition hover:text-gold">
                  Area consumatori
                </Link>
              </li>
              <li>
                <Link href="/login?area=merchant" className="transition hover:text-gold">
                  Area imprese e operatori
                </Link>
              </li>
              <li>
                <Link href="/login?area=admin" className="transition hover:text-gold">
                  Amministrazione
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.14em] text-gold-soft/75">
              Informazioni
            </h3>
            <Link
              href="/notizie"
              className="mt-3 inline-flex text-sm font-black text-gold transition hover:text-gold-soft hover:underline underline-offset-4"
            >
              Notizie
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
