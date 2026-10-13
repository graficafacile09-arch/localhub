import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Church, Compass,
  Landmark, MapPinned, Mountain, Music2, Route, Sparkles,
  Theater, Trees, Utensils,
} from "lucide-react";
import Header from "@/components/Header/Header";
import FotoScheda from "@/components/attrazioni/FotoScheda";
import { getSiteUrl } from "@/lib/site";
import { ATTRAZIONI_LUOGHI as luoghi, ATTRAZIONI_EVENTI as eventi, ATTRAZIONI_DINTORNI as dintorni } from "@/lib/attrazioni-data";

const ICONS = { Landmark, Route, BookOpen, Theater, Church, Sparkles, Music2, Utensils } as const;

export const metadata: Metadata = {
  title: "Attrazioni ed eventi a Castrovillari",
  description: "Scopri monumenti, musei, cultura, eventi, sapori e borghi nei dintorni di Castrovillari e del Parco Nazionale del Pollino.",
  alternates: { canonical: `${getSiteUrl()}/attrazioni` },
};


export default function AttrazioniPage() {
  return (
    <main className="min-h-screen bg-[#eef3f8]">
      <Header />
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 text-white">
        <div aria-hidden className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-yellow-400/15 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-yellow-300"><Compass className="h-4 w-4" aria-hidden /> Guida locale</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-6xl">Scopri <span className="text-yellow-300">Castrovillari</span></h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-blue-100 md:text-lg">Luoghi da visitare, cultura, natura, tradizioni ed eventi. Una guida per conoscere la città e partire alla scoperta dei dintorni del Pollino.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#luoghi" className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-black text-blue-950 transition hover:bg-yellow-300">Esplora i luoghi</a>
            <a href="#eventi" className="rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/20">Eventi e festival</a>
            <a href="#dintorni" className="rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/20">Scopri i dintorni</a>
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-5 text-blue-200">Orari, aperture, biglietti e date degli eventi possono cambiare: verifica le informazioni aggiornate presso gli organizzatori o le fonti ufficiali prima di partire.</p>
        </div>
      </section>

      <nav aria-label="Sezioni della guida" className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-4 py-3 text-sm font-bold md:px-6">
          <a className="whitespace-nowrap text-slate-700 hover:text-blue-700" href="#luoghi">Luoghi da vedere</a>
          <a className="whitespace-nowrap text-slate-700 hover:text-blue-700" href="#cultura">Cultura e tradizioni</a>
          <a className="whitespace-nowrap text-slate-700 hover:text-blue-700" href="#eventi">Eventi</a>
          <a className="whitespace-nowrap text-slate-700 hover:text-blue-700" href="#sapori">Sapori locali</a>
          <a className="whitespace-nowrap text-slate-700 hover:text-blue-700" href="#dintorni">Dintorni</a>
        </div>
      </nav>

      <section id="luoghi" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 md:px-6 md:py-16">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">La città</p><h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Luoghi da vedere</h2></div>
          <a href="https://castrovillaricittafestival.it/menu/3045951/itinerario-culturale" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-900 hover:underline">Itinerario culturale ufficiale <ArrowUpRight className="h-4 w-4" aria-hidden /></a>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {luoghi.map((luogo) => { const Icona = ICONS[luogo.icona] ?? Landmark; return (
            <article key={luogo.nome} className="group flex min-h-60 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-yellow-300 hover:shadow-lg">
              <FotoScheda query={luogo.query} alt={luogo.nome} />
              <div className="flex flex-1 flex-col p-5"><div className="flex items-start justify-between gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-400 text-blue-950"><Icona className="h-6 w-6" aria-hidden /></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">{luogo.tipo}</span></div>
              <h3 className="mt-4 text-lg font-black leading-snug text-slate-900">{luogo.nome}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{luogo.descrizione}</p><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(luogo.query)}`} target="_blank" rel="noopener noreferrer" aria-label={`Indicazioni stradali per ${luogo.nome} su Google Maps`} className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-800 transition hover:border-yellow-400 hover:bg-yellow-50 hover:text-blue-950"><MapPinned className="h-4 w-4" aria-hidden /> Come raggiungerlo <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a>
              </div>
            </article>
          ); })}
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">Guida iniziale: la presenza di una scheda non implica che il luogo sia sempre visitabile all'interno. Verifica aperture, visite guidate e accessi sulle fonti ufficiali.</p>
      </section>

      <section id="cultura" className="scroll-mt-20 border-y border-slate-200 bg-white py-12 md:py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 md:grid-cols-2 md:items-center md:px-6">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Identità locale</p><h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Cultura, tradizioni e spettacolo</h2><p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">Castrovillari vive tutto l'anno attraverso teatro, musica, folklore, libri, arte e iniziative di comunità. Il calendario cambia di anno in anno: per date confermate e programmi completi fai riferimento agli organizzatori.</p><div className="mt-5 flex flex-wrap gap-2">{["Teatro e festival", "Musei e mostre", "Folklore", "Libri e cultura", "Tradizioni popolari"].map((voce) => <span key={voce} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">{voce}</span>)}</div></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-blue-950 p-5 text-white"><Theater className="h-7 w-7 text-yellow-300" aria-hidden /><h3 className="mt-4 font-black">Teatro</h3><p className="mt-1 text-xs leading-5 text-blue-100">Spettacoli e nuovi linguaggi della scena.</p></div>
            <div className="rounded-2xl bg-yellow-400 p-5 text-blue-950"><Music2 className="h-7 w-7" aria-hidden /><h3 className="mt-4 font-black">Musica e folklore</h3><p className="mt-1 text-xs leading-5 text-blue-950/80">Tradizioni e incontri tra culture.</p></div>
            <div className="rounded-2xl bg-slate-100 p-5 text-slate-900"><BookOpen className="h-7 w-7 text-blue-700" aria-hidden /><h3 className="mt-4 font-black">Libri e musei</h3><p className="mt-1 text-xs leading-5 text-slate-600">Storie, collezioni e patrimonio locale.</p></div>
            <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-950"><Trees className="h-7 w-7 text-emerald-700" aria-hidden /><h3 className="mt-4 font-black">Territorio</h3><p className="mt-1 text-xs leading-5 text-emerald-900/80">Natura, paesaggi e comunità.</p></div>
          </div>
        </div>
      </section>

      <section id="eventi" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 md:px-6 md:py-16">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Da non perdere</p><h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Eventi e festival</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Una selezione di festival e appuntamenti ricorrenti a Castrovillari. Le finestre indicate sono orientative: le date esatte cambiano ogni anno.</p></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {eventi.map((evento) => { const Icona = ICONS[evento.icona] ?? Landmark; return (
            <article key={evento.nome} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-yellow-300 hover:shadow-md">
              <FotoScheda query={`${evento.nome}, Castrovillari, Calabria, festival`} alt={evento.nome} />
              <div className="p-5"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-950 text-yellow-300"><Icona className="h-5 w-5" aria-hidden /></div>
              <h3 className="mt-4 text-lg font-black text-slate-900">{evento.nome}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{evento.descrizione}</p>
              <p className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500"><CalendarDays className="h-4 w-4 shrink-0 text-blue-700" aria-hidden /> {evento.periodo}</p></div>
              <a href={evento.url} target="_blank" rel="noopener noreferrer" className="mx-5 mb-5 inline-flex items-center gap-1 border-t border-slate-100 pt-3 text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline">Sito ufficiale / fonte di riferimento <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a>
            </article>
          ); })}
        </div>
      </section>

      <section id="sapori" className="scroll-mt-20 border-y border-slate-200 bg-white py-12 md:py-16">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 md:grid-cols-[auto_1fr_auto] md:items-center md:px-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-400 text-blue-950"><Utensils className="h-7 w-7" aria-hidden /></div>
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Gusto e territorio</p><h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">Sapori locali e prodotti tipici</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Scopri le tradizioni gastronomiche di Castrovillari e del Pollino, compresa la Cipolla Bianca di Castrovillari, riconosciuta De.Co. Per produttori, stagionalità e iniziative enogastronomiche consulta le fonti locali e gli eventi in programma.</p></div>
          <Link href="/prodotti-tipici" className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-blue-950 transition hover:bg-yellow-300">Prodotti tipici InCittà <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </section>

      <section id="dintorni" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 md:px-6 md:py-16">
        <div className="mb-7"><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Fuori città</p><h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">I dintorni di Castrovillari</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Borghi, cultura arbëreshë e natura del Pollino, in una sezione separata dalle attrazioni cittadine.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dintorni.map((luogo) => <article key={luogo.nome} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-yellow-300 hover:shadow-md"><FotoScheda query={`${luogo.nome}, Calabria, Italia`} alt={luogo.nome} /><div className="flex flex-1 flex-col p-5"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400 text-blue-950">{luogo.nome.includes("Pollino") ? <Mountain className="h-5 w-5" aria-hidden /> : <MapPinned className="h-5 w-5" aria-hidden />}</div><p className="mt-4 text-[10px] font-black uppercase tracking-wide text-blue-700">{luogo.tipo}</p><h3 className="mt-1 text-lg font-black text-slate-900">{luogo.nome}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{luogo.descrizione}</p></div></article>)}
        </div>
        <div className="mt-7 rounded-2xl bg-blue-950 p-6 text-white md:flex md:items-center md:justify-between md:gap-6"><div><h3 className="text-xl font-black">Prima di partire, verifica le informazioni</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Per sentieri, accessi, condizioni meteo e attività nel Parco del Pollino, consulta gli aggiornamenti degli enti competenti.</p></div><a href="https://www.parcopollino.it/" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 font-bold text-yellow-300 hover:text-yellow-200 md:mt-0">Sito ufficiale del Parco <ArrowUpRight className="h-4 w-4" aria-hidden /></a></div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-950 py-8 text-center text-sm text-slate-400">
        <p>Guida turistica di Castrovillari e dintorni · InCittà</p><p className="mt-2 text-xs">Verifica le fonti ufficiali per date, orari, accessi e programmi aggiornati.</p><Link href="/" className="mt-4 inline-flex items-center gap-2 font-bold text-yellow-400 hover:text-yellow-300">Torna a InCittà <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </footer>
    </main>
  );
}
