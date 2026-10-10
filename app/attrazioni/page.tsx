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
  { nome: "Castello Aragonese", tipo: "Storia", descrizione: "È uno dei riferimenti storici più riconoscibili di Castrovillari e racconta il ruolo strategico della città nel corso dei secoli. Dedica tempo anche alle strade e agli edifici che circondano il castello, così da inserire la visita in una passeggiata più ampia nel centro antico.", icona: Landmark, query: "Castello Aragonese Castrovillari" },
  { nome: "La Civita e il centro storico", tipo: "Passeggiate", descrizione: "La Civita è il nucleo antico da attraversare senza fretta, osservando vicoli, passaggi, facciate e scorci che restituiscono la struttura della Castrovillari storica. È una buona zona per una passeggiata fotografica e per scoprire dettagli architettonici che spesso sfuggono attraversando la città in auto.", icona: Route, query: "Civita Castrovillari" },
  { nome: "Protoconvento Francescano – SiMuCCà", tipo: "Musei e cultura", descrizione: "Il complesso è uno dei luoghi da cercare per conoscere il patrimonio culturale locale attraverso mostre, collezioni e iniziative pubbliche. Prima della visita controlla quali esposizioni siano aperte e se sono previste visite guidate o attività temporanee.", icona: BookOpen, query: "Protoconvento Francescano Castrovillari" },
  { nome: "Museo Archeologico", tipo: "Musei e cultura", descrizione: "Una visita al museo aiuta a leggere il territorio oltre il centro urbano, seguendo le tracce delle comunità che hanno abitato questa parte della Calabria nel passato. Verifica sede, orari e disponibilità delle collezioni prima di organizzare la tappa.", icona: Landmark, query: "Museo Archeologico Castrovillari" },
  { nome: "Teatro Sybaris", tipo: "Spettacoli", descrizione: "Il Teatro Sybaris è un riferimento per chi vuole affiancare alla visita della città una serata di spettacolo. Il cartellone può comprendere teatro, incontri e rassegne: consulta il programma aggiornato per scegliere una data e controllare modalità di ingresso.", icona: Theater, query: "Teatro Sybaris Castrovillari" },
  { nome: "Biblioteca Civica Umberto Caldora", tipo: "Libri e archivi", descrizione: "La biblioteca è una tappa interessante per chi ama libri, storia locale e ricerca documentaria, oltre che un'occasione per conoscere Palazzo Cappelli. Per consultazioni, servizi disponibili e accesso al pubblico è consigliabile verificare preventivamente le indicazioni della struttura.", icona: BookOpen, query: "Biblioteca Civica Umberto Caldora Castrovillari" },
  { nome: "Chiesa di San Giuseppe", tipo: "Chiese e arte", descrizione: "La chiesa può diventare una sosta raccolta lungo un itinerario a piedi tra le strade storiche. Osserva il contesto urbano e i dettagli architettonici esterni; per visitare gli interni, rispetta le celebrazioni e controlla gli orari di apertura.", icona: Church, query: "Chiesa San Giuseppe Castrovillari" },
  { nome: "Santa Maria delle Grazie", tipo: "Chiese e arte", descrizione: "Inseriscila in una passeggiata lungo Corso Garibaldi, uno degli assi utili per orientarsi tra luoghi di culto e architetture del centro. Come per gli altri edifici religiosi, l'accesso agli interni può dipendere dalle funzioni e dagli orari della comunità.", icona: Church, query: "Santa Maria delle Grazie Castrovillari" },
  { nome: "Palazzo Gallo", tipo: "Architettura", descrizione: "Palazzo Gallo è una tappa per chi osserva la città attraverso i suoi edifici civili e le trasformazioni del centro. Durante la passeggiata soffermati sulle proporzioni della facciata e sul rapporto con le strade circostanti; l'accessibilità interna va verificata sul posto.", icona: Landmark, query: "Palazzo Gallo Castrovillari" },
  { nome: "Palazzo Cappelli", tipo: "Architettura", descrizione: "Oltre al valore architettonico, il palazzo è legato alla vita culturale della città grazie alla biblioteca. Può quindi essere una sosta che unisce osservazione del patrimonio storico e interesse per i luoghi della cultura, verificando in anticipo quali spazi siano accessibili.", icona: Landmark, query: "Palazzo Cappelli Castrovillari" },
  { nome: "Palazzo Varcasia", tipo: "Architettura", descrizione: "Il palazzo contribuisce al carattere del tessuto storico e si presta a una visita esterna durante un itinerario tra le architetture civili. Abbinalo alle altre tappe del centro, senza dare per scontato che gli ambienti interni siano aperti al pubblico.", icona: Landmark, query: "Palazzo Varcasia Castrovillari" },
  { nome: "Archivio di Stato – Sezione di Castrovillari", tipo: "Storia e archivi", descrizione: "Gli archivi conservano fonti preziose per ricostruire famiglie, istituzioni e vicende del territorio, soprattutto per chi svolge ricerche storiche o genealogiche. Trattandosi di un servizio con modalità specifiche di consultazione, verifica sede, orari e procedure prima di recarti sul posto.", icona: BookOpen, query: "Archivio di Stato Sezione Castrovillari" },
];

const eventi = [
  { nome: "Carnevale di Castrovillari", descrizione: "È una delle manifestazioni più rappresentative della città e porta in strada maschere, gruppi, costumi e momenti di partecipazione collettiva. Per organizzare la visita controlla il calendario dell'edizione in corso, il percorso delle sfilate e gli eventuali aggiornamenti su accessi e viabilità.", icona: Sparkles },
  { nome: "Primavera dei Teatri", descrizione: "La rassegna è dedicata alla scena contemporanea e offre un'occasione per incontrare compagnie, artisti e linguaggi teatrali non convenzionali. Il programma può articolarsi in più giornate e spazi: consulta le date ufficiali e verifica se gli spettacoli richiedono prenotazione.", icona: Theater },
  { nome: "Estate Internazionale del Folklore", descrizione: "Questa manifestazione mette al centro la danza popolare e il dialogo tra culture, con gruppi e tradizioni provenienti da territori diversi. È un appuntamento adatto a chi vuole vivere la città anche attraverso spettacoli all'aperto e momenti di festa; programma e partecipanti cambiano a ogni edizione.", icona: Music2 },
  { nome: "Suoni Festival", descrizione: "La rassegna propone appuntamenti musicali e può rappresentare una tappa per chi visita Castrovillari durante la stagione degli eventi. Artisti, location e formula del festival possono variare: controlla gli annunci dell'organizzazione prima di pianificare la serata.", icona: Music2 },
  { nome: "Festival della Legalità", descrizione: "Gli appuntamenti affrontano temi civici e sociali attraverso incontri, testimonianze e attività di sensibilizzazione. Per capire il taglio dell'edizione e partecipare agli eventi più adatti, consulta il programma aggiornato e le indicazioni degli organizzatori.", icona: BookOpen },
  { nome: "Pollicino Book Festival", descrizione: "Il festival valorizza la lettura come esperienza condivisa e può includere presentazioni, incontri con autori e iniziative per bambini e ragazzi. Controlla il calendario per conoscere ospiti, fasce d'età consigliate e luoghi degli appuntamenti.", icona: BookOpen },
  { nome: "Rigenerazioni Fest", descrizione: "La manifestazione raccoglie occasioni di incontro e attività culturali che coinvolgono luoghi e comunità cittadine. Per individuare gli appuntamenti effettivamente previsti nell'edizione corrente, fai riferimento agli annunci ufficiali e alle pagine degli organizzatori.", icona: Sparkles },
  { nome: "Calabria Wine & Design Festival", descrizione: "L'iniziativa mette in dialogo prodotti, cultura del cibo e progettualità creativa, raccontando il territorio anche attraverso le sue eccellenze. Se vuoi partecipare a degustazioni o attività specifiche, verifica in anticipo programma, eventuali prenotazioni e modalità di accesso.", icona: Utensils },
  { nome: "Festival dei Lettori", descrizione: "La rassegna crea occasioni per incontrare libri e lettori attraverso presentazioni e momenti di confronto. Gli ospiti e il calendario possono cambiare nel tempo, quindi è utile consultare le comunicazioni più recenti prima di scegliere l'appuntamento.", icona: BookOpen },
  { nome: "Festival dei Quartieri", descrizione: "Gli eventi di quartiere permettono di scoprire la città attraverso iniziative di prossimità, spesso in luoghi diversi dal circuito culturale tradizionale. Controlla il programma per conoscere le piazze coinvolte, gli orari e le eventuali modifiche in caso di maltempo.", icona: Music2 },
  { nome: "Rural Food Festival", descrizione: "La proposta gastronomica è un'occasione per conoscere produttori, piatti e storie del mondo rurale locale. Per sapere quali stand, degustazioni e attività siano confermati nell'edizione corrente, consulta gli aggiornamenti dell'organizzazione.", icona: Utensils },
  { nome: "Vibe Fest e Joy Festival", descrizione: "Questi appuntamenti possono aggiungere una dimensione più contemporanea all'offerta culturale, con musica e occasioni di socialità. Le edizioni possono cambiare nome, formato o collocazione: verifica il calendario ufficiale per confermare che siano in programma e per ottenere informazioni affidabili.", icona: Music2 },
];

const dintorni = [
  { nome: "Morano Calabro", tipo: "Borgo storico", descrizione: "Morano Calabro è noto per il profilo compatto del borgo che sale verso il castello e per i suoi scorci sulle montagne. Dedica tempo a camminare tra le stradine e a fermarti nei punti panoramici; scarpe comode sono utili perché il percorso è in salita e può avere pavimentazioni irregolari." },
  { nome: "Civita", tipo: "Borgo e paesaggio", descrizione: "Civita conserva una forte identità arbëreshë, visibile nelle tradizioni, nell'architettura e nella memoria della comunità. Nei dintorni si apre il paesaggio spettacolare delle Gole del Raganello: per escursioni e accessi segui esclusivamente le indicazioni aggiornate degli enti e delle guide abilitate." },
  { nome: "Frascineto ed Eianina", tipo: "Cultura arbëreshë", descrizione: "Frascineto ed Eianina sono luoghi adatti a conoscere la cultura arbëreshë del Pollino attraverso lingua, usanze, feste e patrimonio religioso. Una visita rispettosa lascia spazio anche alle storie raccontate dagli abitanti e alle iniziative culturali locali, quando previste." },
  { nome: "San Basile", tipo: "Tradizioni", descrizione: "San Basile offre un'altra prospettiva sulla presenza arbëreshë nel territorio, tra tradizioni comunitarie e paesaggio collinare. Prima della visita cerca eventuali eventi, feste o aperture culturali: possono rendere la tappa più ricca e aiutare a incontrare le espressioni vive della comunità." },
  { nome: "Mormanno", tipo: "Borgo e natura", descrizione: "Mormanno è una base interessante per esplorare il versante del Pollino e i suoi paesaggi montani, alternando la visita del centro a soste nella natura. Per sentieri, attività outdoor e condizioni di accesso controlla sempre meteo e informazioni locali aggiornate." },
  { nome: "Altomonte", tipo: "Arte e storia", descrizione: "Altomonte invita a una passeggiata tra vicoli, piazze e testimonianze artistiche, con un centro storico che merita tempo e attenzione. È una buona idea informarsi su chiese, monumenti e iniziative culturali aperte durante la visita, perché gli orari possono variare." },
  { nome: "Saracena", tipo: "Sapori e tradizioni", descrizione: "Saracena è legata ai sapori del Pollino e alle produzioni locali, con una tradizione enogastronomica che vale la pena scoprire attraverso produttori e iniziative del territorio. Se il viaggio è dedicato al gusto, verifica quali aziende o manifestazioni siano visitabili nel periodo scelto." },
  { nome: "Parco Nazionale del Pollino", tipo: "Natura e attività all'aperto", descrizione: "Il Parco Nazionale del Pollino offre ambienti diversi, dai boschi ai panorami d'alta quota, ed è ideale per camminate, osservazione della natura e attività all'aperto. Scegli itinerari adatti alla tua preparazione, controlla meteo e stato dei percorsi e rispetta le regole dell'area protetta, senza improvvisare accessi a zone regolamentate." },
];

function mapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function fotoUrl(query: string) {
  return `https://loremflickr.com/960/540/${encodeURIComponent(query)}`;
}

const FOTO_FALLBACK = "https://mycity.s3.sbg.io.cloud.ovh.net/4222084/PROTOCONVENTO-FRANCESCANO.jpg";

function FotoScheda({ query, alt }: { query: string; alt: string }) {
  return (
    <div className="relative h-44 w-full overflow-hidden bg-slate-200">
      <img
        src={fotoUrl(query)}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        onError={(event) => {
          if (event.currentTarget.src !== FOTO_FALLBACK) event.currentTarget.src = FOTO_FALLBACK;
        }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/25 via-transparent to-transparent" />
    </div>
  );
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
            <article key={luogo.nome} className="group flex min-h-60 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-yellow-300 hover:shadow-lg">
              <FotoScheda query={luogo.query} alt={luogo.nome} />
              <div className="flex flex-1 flex-col p-5"><div className="flex items-start justify-between gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-400 text-blue-950"><Icona className="h-6 w-6" aria-hidden /></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">{luogo.tipo}</span></div>
              <h3 className="mt-4 text-lg font-black leading-snug text-slate-900">{luogo.nome}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{luogo.descrizione}</p>
              <a href={mapsUrl(luogo.query)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 border-t border-slate-100 pt-3 text-sm font-bold text-blue-700 hover:text-blue-900"><MapPinned className="h-4 w-4" aria-hidden /> Indicazioni sulla mappa <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a></div>
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
            <article key={evento.nome} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-yellow-300 hover:shadow-md">
              <FotoScheda query={`${evento.nome}, Castrovillari, Calabria, festival`} alt={evento.nome} />
              <div className="p-5"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-950 text-yellow-300"><Icona className="h-5 w-5" aria-hidden /></div>
              <h3 className="mt-4 text-lg font-black text-slate-900">{evento.nome}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{evento.descrizione}</p>
              <p className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500"><CalendarDays className="h-4 w-4 shrink-0 text-blue-700" aria-hidden /> Date e programma da verificare sul calendario ufficiale</p></div>
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
          {dintorni.map((luogo) => <article key={luogo.nome} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-yellow-300 hover:shadow-md"><FotoScheda query={`${luogo.nome}, Calabria, Italia`} alt={luogo.nome} /><div className="flex flex-1 flex-col p-5"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400 text-blue-950">{luogo.nome.includes("Pollino") ? <Mountain className="h-5 w-5" aria-hidden /> : <MapPinned className="h-5 w-5" aria-hidden />}</div><p className="mt-4 text-[10px] font-black uppercase tracking-wide text-blue-700">{luogo.tipo}</p><h3 className="mt-1 text-lg font-black text-slate-900">{luogo.nome}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{luogo.descrizione}</p><a href={mapsUrl(luogo.nome)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 border-t border-slate-100 pt-3 text-sm font-bold text-blue-700 hover:text-blue-900">Come arrivare <ArrowUpRight className="h-4 w-4" aria-hidden /></a></div></article>)}
        </div>
        <div className="mt-7 rounded-2xl bg-blue-950 p-6 text-white md:flex md:items-center md:justify-between md:gap-6"><div><h3 className="text-xl font-black">Prima di partire, verifica le informazioni</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Per sentieri, accessi, condizioni meteo e attività nel Parco del Pollino, consulta gli aggiornamenti degli enti competenti.</p></div><a href="https://www.parcopollino.it/" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 font-bold text-yellow-300 hover:text-yellow-200 md:mt-0">Sito ufficiale del Parco <ArrowUpRight className="h-4 w-4" aria-hidden /></a></div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-950 py-8 text-center text-sm text-slate-400">
        <p>Guida turistica di Castrovillari e dintorni · InCittà</p><p className="mt-2 text-xs">Verifica le fonti ufficiali per date, orari, accessi e programmi aggiornati.</p><Link href="/" className="mt-4 inline-flex items-center gap-2 font-bold text-yellow-400 hover:text-yellow-300">Torna a InCittà <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </footer>
    </main>
  );
}
