import Header from "@/components/Header/Header";
import Link from "next/link";
import Image from "next/image";

import {
  ArrowRight,
  SearchCheck,
  Store,
  Tag,
} from "lucide-react";
import HeroSearchBar from "@/components/home/HeroSearchBar";
import {
  getNegoziInEvidenza,
  getProdottiInEvidenza,
  getProdottiTipici,
} from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import EccellenzeCalabresiGrid from "@/components/home/EccellenzeCalabresiGrid";
import HomepageProductCarousel from "@/components/home/HomepageProductCarousel";
import WeatherWidget from "@/components/Header/WeatherWidget";
import FarmacieTurnoWidget from "@/components/Header/FarmacieTurnoWidget";

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
  const [negozi, prodottiInEvidenza, prodottiTipici, statoPreferiti] =
    await Promise.all([
      getNegoziInEvidenza(8),
      getProdottiInEvidenza(8),
      getProdottiTipici(60),
      getStatoPreferitiPerPagina(),
    ]);

  return (
    <main className="min-h-screen bg-[#eef3f8]">
      <Header />

      {/* ═══════════════════════════════════════════════════════════════════
          HERO — fotografica, messaggio immediato, ricerca + AI
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-b-[2rem] bg-slate-900 shadow-lg shadow-slate-900/10 sm:rounded-b-[2.5rem]">
        {/* La foto copre tutta la HERO e non ne determina l'altezza. */}
        <Image
          src="/hero-via-roma-castrovillari-1400x1050.jpg"
          alt="Via Roma a Castrovillari"
          fill
          sizes="100vw"
          priority
          className="absolute inset-0 h-full w-full object-cover object-center"
        />

        {/* Gradiente leggero solo nella zona del testo: la parte bassa resta luminosa. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/25 to-transparent"
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 text-left md:px-6 md:py-16">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
            <div>
              <h1 className="max-w-2xl text-3xl font-black leading-tight tracking-tight text-white drop-shadow-lg md:text-5xl">
                Tutto quello che cerchi... <span className="text-yellow-300">è già</span> nella tua città.
              </h1>
              <div className="mt-7"><HeroSearchBar /></div>
            </div>
            <div className="absolute bottom-1 right-1 z-20 flex w-[120px] flex-col gap-1 lg:static lg:z-auto lg:w-auto lg:max-w-sm lg:gap-2.5 lg:pt-2">
              <div className="rounded-lg border border-sky-200/70 bg-sky-50/90 p-0.5 shadow-sm backdrop-blur-md lg:rounded-2xl lg:p-2 lg:shadow-lg">
                <WeatherWidget hero />
              </div>
              <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/90 p-0.5 shadow-sm backdrop-blur-md lg:rounded-2xl lg:p-2 lg:shadow-lg">
                <FarmacieTurnoWidget hero />
              </div>
              <p className="hidden px-1 text-[10px] font-semibold text-white/85 drop-shadow lg:block">
                Tocca o clicca una scheda per vedere tutti i dettagli.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          VALUE STRIP — perché LocalHub (3 promesse, nessuna duplicazione)
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="border-y border-slate-200 bg-white shadow-sm">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:grid-cols-3 md:px-6 md:py-10">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-blue-900 shadow-[0_4px_14px_-4px_rgba(202,138,4,0.45)]">
              <Store className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900">Sostieni il commercio locale</h2>
              <p className="mt-1 text-[13px] leading-5 text-slate-500">
                Ogni acquisto resta nella tua città e sostiene chi la fa vivere.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-blue-900 shadow-[0_4px_14px_-4px_rgba(202,138,4,0.45)]">
              <SearchCheck className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900">Trova tutto in un unico posto</h2>
              <p className="mt-1 text-[13px] leading-5 text-slate-500">
                Negozi, professionisti, prodotti e servizi: una ricerca, zero code.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-blue-900 shadow-[0_4px_14px_-4px_rgba(202,138,4,0.45)]">
              <Tag className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900">Offerte dal territorio</h2>
              <p className="mt-1 text-[13px] leading-5 text-slate-500">
                Promozioni e novità dai negozi vicini, sempre aggiornate.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          ECCELLENZE CALABRESI (solo se ce ne sono) — vetrina territoriale.
          Le categorie restano nella navigazione (barra Home/Negozi/Categorie):
          non vengono più duplicate nella pagina.
          ═══════════════════════════════════════════════════════════════════ */}
      {prodottiTipici.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-14">
          <SezioneHeader
            titolo="ECCELLENZE CALABRESI"
            href="/prodotti-tipici"
            linkLabel="Vedi tutti"
            titoloClassName="mt-1 inline-block whitespace-nowrap rounded-lg bg-yellow-400 px-2 py-1 text-[13px] font-black tracking-tight text-blue-900 shadow-sm transition hover:bg-yellow-300 sm:text-base md:px-3 md:py-1.5 md:text-2xl"
          />

          <EccellenzeCalabresiGrid
            prodotti={prodottiTipici}
            statoPreferiti={statoPreferiti}
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
          PRODOTTI IN EVIDENZA (solo se ce ne sono)
          ═══════════════════════════════════════════════════════════════════ */}
      {prodottiInEvidenza.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-14">
          <SezioneHeader
            label="Novità"
            titolo="Prodotti in evidenza"
            href="/negozi"
            linkLabel="Esplora i negozi"
          />

          <HomepageProductCarousel
            prodotti={prodottiInEvidenza}
            statoPreferiti={statoPreferiti}
          />
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
              Local<span className="text-yellow-400">Hub</span>
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
              Assistente
            </h3>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm font-bold text-slate-200">Pino è sempre disponibile per aiutarti.</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
