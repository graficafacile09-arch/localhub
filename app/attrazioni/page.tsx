import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Church, Compass,
  ExternalLink, Landmark, MapPinned, Mountain, Music2, Route, Sparkles,
  Theater, Trees, Utensils,
} from "lucide-react";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Attrazioni ed eventi a Castrovillari",
  description: "Scopri monumenti, musei, cultura, eventi, sapori e borghi nei dintorni di Castrovillari e del Parco Nazionale del Pollino.",
  alternates: { canonical: `${getSiteUrl()}/attrazioni` },
};

const luoghi = [
  { nome: "Castello Aragonese", tipo: "Storia", descrizione: "Il simbolo fortificato della città, nel cuore del centro storico.", icona: Landmark, query: "Castello Aragonese Castrovillari" },
  { nome: "La Civita e il centro storico", tipo: "Passeggiate", descrizione: "Vicoli, scorci e architetture da esplorare a piedi nella parte più antica della città.", icona: Route, query: "Civita Castrovillari" },
  { nome: "Protoconvento Francescano – SiMuCCà", tipo: "Musei e cultura", descrizione: "Un polo culturale che riunisce collezioni e testimonianze di arte, storia e tradizioni.", icona: BookOpen, query: "Protoconvento Francescano Castrovillari" },
  { nome: "Museo Archeologico", tipo: "Musei e cultura", descrizione: "Reperti e testimonianze archeologiche per conoscere la storia più antica del territorio.", icona: Landmark, query: "Museo Archeologico Castrovillari" },
  { nome: "Teatro Sybaris", tipo: "Spettacoli", descrizione: "Spazio culturale legato a spettacoli, teatro e rassegne cittadine.", icona: Theater, query: "Teatro Sybaris Castrovillari" },
  { nome: "Biblioteca Civica Umberto Caldora", tipo: "Libri e archivi", descrizione: "Un riferimento per il patrimonio librario e documentario, ospitato nello storico Palazzo Cappelli.", icona: BookOpen, query: "Biblioteca Civica Umberto Caldora Castrovillari" },
  { nome: "Chiesa di San Giuseppe", tipo: "Chiese e arte", descrizione: "Una delle testimonianze religiose storiche del centro, da inserire in una passeggiata nella città antica.", icona: Church, query: "Chiesa San Giuseppe Castrovillari" },
  { nome: "Santa Maria delle Grazie", tipo: "Chiese e arte", descrizione: "Edificio storico lungo Corso Garibaldi, parte del patrimonio architettonico e spirituale cittadino.", icona: Church, query: "Santa Maria delle Grazie Castrovillari" },
  { nome: "Palazzo Gallo", tipo: "Architettura", descrizione: "Una delle architetture storiche che raccontano l'evoluzione urbana di Castrovillari.", icona: Landmark, query: "Palazzo Gallo Castrovillari" },
  { nome: "Palazzo Cappelli", tipo: "Architettura", descrizione: "Palazzo settecentesco legato alla storia cittadina e oggi associato anche alla Biblioteca Civica.", icona: Landmark, query: "Palazzo Cappelli Castrovillari" },
  { nome: "Palazzo Varcasia", tipo: "Architettura", descrizione: "Una tappa dell'itinerario architettonico del centro storico, lungo Corso Garibaldi.", icona: Landmark, query: "Palazzo Varcasia Castrovillari" },
  { nome: "Archivio di Stato – Sezione di Castrovillari", tipo: "Storia e archivi", descrizione: "Un riferimento per approfondire la storia documentaria del territorio; verifica prima le modalità di accesso.", icona: BookOpen, query: "Archivio di Stato Sezione Castrovillari" },
];

const eventi = [
  { nome: "Carnevale di Castrovillari", descrizione: "Maschere, sfilate, folklore e tradizioni popolari.", icona: Sparkles },
  { nome: "Primavera dei Teatri", descrizione: "Festival dedicato ai nuovi linguaggi della scena contemporanea e al teatro di ricerca.", icona: Theater },
  { nome: "Estate Internazionale del Folklore", descrizione: "Gruppi folkloristici, musica e danze tradizionali da diversi Paesi.", icona: Music2 },
  { nome: "Suoni Festival", descrizione: "Rassegna musicale: programma e date sono pubblicati dall'organizzazione.", icona: Music2 },
  { nome: "Festival della Legalità", descrizione: "Incontri e iniziative su legalità, cittadinanza e partecipazione.", icona: BookOpen },
  { nome: "Pollicino Book Festival", descrizione: "Libri, autori, lettura e appuntamenti dedicati anche ai più giovani.", icona: BookOpen },
  { nome: "Rigenerazioni Fest", descrizione: "Iniziative culturali e partecipative che animano gli spazi della città.", icona: Sparkles },
  { nome: "Calabria Wine & Design Festival", descrizione: "Un incontro tra territorio, enogastronomia, creatività e design.", icona: Utensils },
  { nome: "Festival dei Lettori", descrizione: "Appuntamenti dedicati alla lettura e alla condivisione culturale.", icona: BookOpen },
  { nome: "Festival dei Quartieri", descrizione: "Musica, spettacoli e momenti di comunità diffusi nei quartieri.", icona: Music2 },
  { nome: "Rural Food Festival", descrizione: "Un percorso tra sapori, prodotti e tradizioni gastronomiche.", icona: Utensils },
  { nome: "Vibe Fest e Joy Festival", descrizione: "Rassegne musicali e appuntamenti contemporanei presenti nel calendario cittadino.", icona: Music2 },
];

const dintorni = [
  { nome: "Morano Calabro", tipo: "Borgo storico", descrizione: "Un borgo arroccato, con vicoli, panorami e architetture storiche." },
  { nome: "Civita", tipo: "Borgo e paesaggio", descrizione: "Borgo arbëreshë e porta d'accesso al paesaggio delle Gole del Raganello." },
  { nome: "Frascineto ed Eianina", tipo: "Cultura arbëreshë", descrizione: "Lingua, tradizioni, patrimonio religioso e cultura arbëreshë." },
  { nome: "San Basile", tipo: "Tradizioni", descrizione: "Un centro del Pollino legato alle tradizioni arbëreshë." },
  { nome: "Mormanno", tipo: "Borgo e natura", descrizione: "Una tappa per scoprire paesaggi montani e itinerari del Pollino." },
  { nome: "Altomonte", tipo: "Arte e storia", descrizione: "Un borgo con patrimonio storico-artistico e scorci da esplorare." },
  { nome: "Saracena", tipo: "Sapori e tradizioni", descrizione: "Una tappa per conoscere le tradizioni gastronomiche del territorio." },
  { nome: "Parco Nazionale del Pollino", tipo: "Natura e attività all'aperto", descrizione: "Sentieri, montagne e biodiversità: controlla sempre condizioni e indicazioni prima di partire." },
];

function mapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

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
          {luoghi.map((luogo) => { const Icona = luogo.icona; return (
            <article key={luogo.nome} className="group flex min-h-60 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-yellow-300 hover:shadow-lg">
              <div className="flex items-start justify-between gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-400 text-blue-950"><Icona className="h-6 w-6" aria-hidden /></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">{luogo.tipo}</span></div>
              <h3 className="mt-4 text-lg font-black leading-snug text-slate-900">{luogo.nome}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{luogo.descrizione}</p>
              <a href={mapsUrl(luogo.query)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 border-t border-slate-100 pt-3 text-sm font-bold text-blue-700 hover:text-blue-900"><MapPinned className="h-4 w-4" aria-hidden /> Indicazioni sulla mappa <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a>
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
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Da non perdere</p><h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Eventi e festival</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Una selezione delle rassegne cittadine. Per non perdere eventi più piccoli, nuove iniziative e date appena annunciate, consulta il calendario ufficiale completo.</p></div>
          <a href="https://castrovillaricittafestival.it/eventi" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-blue-950 shadow-sm transition hover:bg-yellow-300">Tutti gli eventi aggiornati <ExternalLink className="h-4 w-4" aria-hidden /></a>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {eventi.map((evento) => { const Icona = evento.icona; return (
            <article key={evento.nome} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-yellow-300 hover:shadow-md">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-950 text-yellow-300"><Icona className="h-5 w-5" aria-hidden /></div>
              <h3 className="mt-4 text-lg font-black text-slate-900">{evento.nome}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{evento.descrizione}</p>
              <p className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500"><CalendarDays className="h-4 w-4 shrink-0 text-blue-700" aria-hidden /> Date e programma da verificare sul calendario ufficiale</p>
            </article>
          ); })}
        </div>
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5 md:flex md:items-center md:justify-between md:gap-6"><div><h3 className="font-black text-blue-950">Vuoi consultare il programma completo?</h3><p className="mt-1 text-sm leading-6 text-blue-900/80">Il calendario ufficiale raccoglie anche gli appuntamenti aggiunti durante l'anno.</p></div><a href="https://castrovillaricittafestival.it/eventi" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-900 hover:underline md:mt-0">Apri il calendario <ArrowUpRight className="h-4 w-4" aria-hidden /></a></div>
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
          {dintorni.map((luogo) => <article key={luogo.nome} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-yellow-300 hover:shadow-md"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400 text-blue-950">{luogo.nome.includes("Pollino") ? <Mountain className="h-5 w-5" aria-hidden /> : <MapPinned className="h-5 w-5" aria-hidden />}</div><p className="mt-4 text-[10px] font-black uppercase tracking-wide text-blue-700">{luogo.tipo}</p><h3 className="mt-1 text-lg font-black text-slate-900">{luogo.nome}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{luogo.descrizione}</p><a href={mapsUrl(luogo.nome)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 border-t border-slate-100 pt-3 text-sm font-bold text-blue-700 hover:text-blue-900">Come arrivare <ArrowUpRight className="h-4 w-4" aria-hidden /></a></article>)}
        </div>
        <div className="mt-7 rounded-2xl bg-blue-950 p-6 text-white md:flex md:items-center md:justify-between md:gap-6"><div><h3 className="text-xl font-black">Prima di partire, verifica le informazioni</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Per sentieri, accessi, condizioni meteo e attività nel Parco del Pollino, consulta gli aggiornamenti degli enti competenti.</p></div><a href="https://www.parcopollino.it/" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 font-bold text-yellow-300 hover:text-yellow-200 md:mt-0">Sito ufficiale del Parco <ArrowUpRight className="h-4 w-4" aria-hidden /></a></div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-950 py-8 text-center text-sm text-slate-400">
        <p>Guida turistica di Castrovillari e dintorni · InCittà</p><p className="mt-2 text-xs">Verifica le fonti ufficiali per date, orari, accessi e programmi aggiornati.</p><Link href="/" className="mt-4 inline-flex items-center gap-2 font-bold text-yellow-400 hover:text-yellow-300">Torna a InCittà <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </footer>
    </main>
  );
}
