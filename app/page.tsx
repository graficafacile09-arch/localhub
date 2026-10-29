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
import HomepageProductShowcase, { ProductSectionCard } from "@/components/home/HomepageProductShowcase";
import HomepageProductSwipeReveal from "@/components/home/HomepageProductSwipeReveal";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";

// La homepage deve riflettere in tempo reale i negozi in evidenza flaggati
// dal merchant (il toggle "In evidenza" della dashboard), quindi non viene
// prerenderizzata staticamente a build.
export const dynamic = "force-dynamic";

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
  const [negozi, prodottiCatalogo, prodottiTipici, statoPreferiti] =
    await Promise.all([
      getNegoziInEvidenza(8),
      getProdottiCatalogoHomepage(1000),
      getProdottiTipici(200),
      getStatoPreferitiPerPagina(),
    ]);

  return (
    <main className="min-h-screen bg-[#eef3f8]">
      <Header homepage />

      <HomepageProductSwipeReveal
        hero={
          <>
            {/* HERO — stessa resa della versione attuale in produzione; lo swipe non modifica la foto. */}
            <section className="relative overflow-hidden rounded-b-[2rem] bg-slate-900 shadow-lg shadow-slate-900/10 sm:rounded-b-[2.5rem] md:min-h-[600px] [@media_(min-width:768px)_and_(hover:none)]:w-screen [@media_(min-width:768px)_and_(hover:none)]:max-w-none [@media_(min-width:768px)_and_(hover:none)]:left-1/2 [@media_(min-width:768px)_and_(hover:none)]:-translate-x-1/2">
              <Image
                src="/hero-coppia-castrovillari.webp"
                alt="Coppia a Castrovillari"
                fill
                sizes="100vw"
                priority
                className="absolute inset-0 h-full w-full object-cover object-center md:object-[center_40%]"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/25 to-transparent"
              />
              <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 text-left md:flex md:min-h-[600px] md:w-full md:items-center md:px-6 md:py-16">
                <div>
                  <h1 className="mt-4 max-w-xl text-3xl font-black leading-tight tracking-tight text-white drop-shadow-lg md:mt-6 md:text-7xl">
                    Tutto quello che cerchi... <span className="text-yellow-300">è già</span> nella tua città.
                  </h1>
                </div>
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
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-yellow-400 text-blue-900 shadow-[0_4px_14px_-4px_rgba(202,138,4,0.45)] sm:h-8 sm:w-8">
                    <Store className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-[10px] font-black leading-tight text-slate-900 sm:text-sm">Sostieni il commercio locale</h2>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-2.5 sm:text-left">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-yellow-400 text-blue-900 shadow-[0_4px_14px_-4px_rgba(202,138,4,0.45)] sm:h-8 sm:w-8">
                    <SearchCheck className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-[10px] font-black leading-tight text-slate-900 sm:text-sm">Trova tutto in un unico posto</h2>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-2.5 sm:text-left">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-yellow-400 text-blue-900 shadow-[0_4px_14px_-4px_rgba(202,138,4,0.45)] sm:h-8 sm:w-8">
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
          <>
            {/* Caroselli prodotti a schede: scorri orizzontalmente per categoria. */}
            <HomepageProductShowcase
              prodottiTipici={prodottiTipici}
              prodottiCatalogo={prodottiCatalogo}
              statoPreferiti={statoPreferiti}
            />
          </>
        }
      />

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
                          <div
                            role="img"
                            aria-label={negozio.nome}
                            className="absolute inset-0 bg-cover bg-center transition duration-300 group-hover:scale-105"
                            style={{ backgroundImage: `url(${immaginiCopertina})` }}
                          />
                          {logoNegozio && (
                            <div className="absolute bottom-3 left-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white shadow-sm">
                              <div
                                role="img"
                                aria-label={`Logo ${negozio.nome}`}
                                className="h-full w-full bg-cover bg-center"
                                style={{ backgroundImage: `url(${logoNegozio})` }}
                              />
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
          TERRITORIO — il valore del commercio locale (banda blu)
          ═══════════════════════════════════════════════════════════════════ */}
      <section data-pino-footer-zone="true" className="bg-gradient-to-br from-blue-800 via-blue-900 to-blue-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center md:px-6 md:py-20">
          <p className="section-label !text-blue-200">Per i commercianti</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-black leading-tight tracking-tight md:text-4xl">
            Metti in vetrina la tua attività
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-blue-100 md:text-base">
            Un negozio digitale con vetrina, catalogo prodotti, ordini e pagamenti: tutto in un
            unico posto, pensato per chi fa impresa nella propria città.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login?area=merchant"
              className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 text-sm font-black text-blue-900 shadow-[0_4px_14px_-4px_rgba(202,138,4,0.45)] transition hover:bg-yellow-300 hover:shadow-[0_8px_22px_-6px_rgba(202,138,4,0.55)] active:scale-95"
            >
              <Store className="h-4 w-4" aria-hidden />
              Apri il tuo negozio
            </Link>
            <Link
              href="/negozi"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-95"
            >
              Esplora i negozi
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          FOOTER HOMEPAGE — ordinato e non ridondante
          (il footer globale con la riga legale resta nel layout root)
          ═══════════════════════════════════════════════════════════════════ */}
      <footer className="bg-slate-950 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 md:px-6 lg:grid-cols-4">
          <div>
            <p className="text-lg font-black tracking-tight text-white">
              InCittà
            </p>
            <p className="mt-2 max-w-xs text-[13px] leading-5 text-slate-400">
              La vetrina digitale del commercio di Castrovillari: negozi, professionisti, prodotti
              e servizi della tua città in un unico posto.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              Esplora
            </h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <Link href="/" className="transition hover:text-yellow-300">Home</Link>
              </li>
              <li>
                <Link href="/negozi" className="transition hover:text-yellow-300">Negozi</Link>
              </li>
              <li>
                <Link href="/categorie" className="transition hover:text-yellow-300">Categorie</Link>
              </li>
              <li>
                <Link href="/prodotti-tipici" className="transition hover:text-yellow-300">ECCELLENZE CALABRESI</Link>
              </li>
              <li>
                <Link href="/negozi?featured=1" className="transition hover:text-yellow-300">
                  Negozi in evidenza
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              Le tue aree
            </h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <Link href="/login?area=cliente" className="transition hover:text-yellow-300">
                  Area Clienti
                </Link>
              </li>
              <li>
                <Link href="/login?area=merchant" className="transition hover:text-yellow-300">
                  Area Venditore
                </Link>
              </li>
              <li>
                <Link href="/login?area=admin" className="transition hover:text-yellow-300">
                  Amministrazione
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              Informazioni
            </h3>
            <Link
              href="/notizie"
              className="mt-3 inline-flex text-sm font-black text-yellow-400 transition hover:text-yellow-300 hover:underline underline-offset-4"
            >
              Notizie
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
