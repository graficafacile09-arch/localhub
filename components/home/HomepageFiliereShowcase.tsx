"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import ProdottoImmagine from "@/components/home/ProdottoImmagine";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";

/**
 * Le dieci filiere agroalimentari calabresi.
 * Denominazioni DOP/IGP come da registri europei; nessun dato inventato.
 * Foto ufficiali dall'archivio Qualivita/Qualigeo (consorzi di tutela DOP e IGP);
 * la scheda ittica usa una foto di Wikimedia Commons. File locali in `public/filiere`.
 *
 * Vive nel pannello dello swipe "Scopri la filiera" della homepage (era la sua
 * sede originale, prima del restyle): palette crema/verde bosco/oro del sito.
 */
type Filiera = {
  nome: string;
  testo: string;
  territorio: string;
  img: string;
  alt: string;
  credito: string;
  paragrafi: string[];
  lavorazione: string[];
  stagionalita: string;
  prodotti: string[];
  riconoscimenti: string[];
};

const FILIERE: Filiera[] = [
  {
    nome: "Filiera olivicola",
    testo:
      "Oliveti lungo le coste e nelle vallate interne: Carolea, Ottobratica e Roggianella sono le cultivar che danno l'olio extravergine calabrese.",
    territorio: "Piana di Sibari, Locride, Crotonese",
    img: "/filiere/home-olio.jpg",
    alt: "Bottiglia di olio extravergine su un tavolo di legno con olive e ramo d'olivo",
    credito: "Foto: archivio",
    paragrafi: [
      "L'olivicoltura accompagna la regione da entrambe le coste, dal Crotonese alla Locride fino alle colline del Vibonese. La raccolta concentra il lavoro tra autunno e inverno e la molitura avviene in frantoi di prossimità, così l'olio conserva profumo erbaceo e note amare tipiche delle cultivar autoctone.",
      "Accanto agli oliveti specializzati resistono piante secolari e piccoli appezzamenti familiari: è da qui che arriva buona parte dell'olio venduto sfuso o imbottigliato dai produttori locali. La Carolea dà oli robusti e corposi, l'Ottobratica oli più delicati, la Roggianella profumi intensi.",
    ],
    lavorazione: [
      "Raccolta a mano o con agevolatori, tra ottobre e dicembre",
      "Molitura entro poche ore dalla raccolta, a freddo",
      "Conservazione in acciaio, al riparo da luce e calore",
    ],
    stagionalita: "Raccolta autunnale; l'olio nuovo arriva in bottiglia da fine novembre.",
    prodotti: ["Olio extravergine d'oliva", "Olive da tavola", "Olive in salamoia", "Patè e crema di olive", "Cosmetici all'olio"],
    riconoscimenti: ["Olio di Calabria IGP", "Bruzio DOP"],
  },
  {
    nome: "Filiera agrumicola",
    testo:
      "La Piana di Sibari è il cuore delle Clementine di Calabria IGP; il bergamotto di Reggio Calabria resta una produzione quasi esclusiva al mondo.",
    territorio: "Piana di Sibari, Reggino",
    img: "/filiere/home-agrumi.jpg",
    alt: "Clementine di Calabria IGP con le foglie",
    credito: "Foto: archivio",
    paragrafi: [
      "Gli agrumeti occupano le pianure alluvionali e le fasce costiere, dove l'acqua e il clima mite permettono frutti dalla buccia sottile. La raccolta si fa a mano, con le forbici, per non danneggiare il peduncolo e arrivare al mercato con il frutto integro.",
      "Il bergamotto, coltivato su una fascia ristretta del Reggino, alimenta una filiera di essenze e profumeria senza eguali fuori dalla Calabria. Dalla buccia si ricava l'olio essenziale, dal succo bevande e aromi: una lavorazione che richiede mani esperte e tempi stretti.",
    ],
    lavorazione: [
      "Raccolta manuale con forbici e cassette foderate",
      "Selezione per calibro nelle centrali di confezionamento",
      "Estrazione dell'olio essenziale di bergamotto per sfumatura",
    ],
    stagionalita: "Clementine da novembre a gennaio; bergamotto nel cuore dell'inverno.",
    prodotti: ["Clementine", "Arance", "Limoni", "Bergamotto", "Oli essenziali e acque aromatiche", "Confetture e succhi"],
    riconoscimenti: ["Clementine di Calabria IGP"],
  },
  {
    nome: "Filiera vitivinicola",
    testo:
      "Cirò DOC e Cirò Classico DOCG guidano una produzione che poggia su Gaglioppo, Greco Nero e Magliocco, vitigni autoctoni.",
    territorio: "Cirò, Savuto, Bivongi, Terre di Cosenza",
    img: "/filiere/home-vino.jpg",
    alt: "Grappoli di uva nel vigneto del Cirò",
    credito: "Foto: Qualivita · Qualigeo",
    paragrafi: [
      "Le colline argillose del Crotonese danno rossi di carattere con il Gaglioppo; più a sud, Savuto e Bivongi raccontano un'altra Calabria enologica, mentre le Terre di Cosenza lavorano Magliocco e Greco Nero.",
      "La vendemmia manuale resta la norma nei piccoli vigneti di pendio e molte cantine affinano in legno o in anfora. Accanto ai rossi strutturati crescono i bianchi da Greco e Guarnaccia e gli spumanti metodo classico, figli di altitudini e suoli diversi.",
    ],
    lavorazione: [
      "Vendemmia manuale in cassette, con selezione in vigna",
      "Fermentazione con macerazione sulle bucce per i rossi",
      "Affinamento in acciaio, legno o anfora prima dell'imbottigliamento",
    ],
    stagionalita: "Vendemmia tra fine agosto e ottobre, secondo la quota del vigneto.",
    prodotti: ["Vini rossi, bianchi e rosati", "Spumanti metodo classico", "Passiti e vini da meditazione", "Grappe e distillati"],
    riconoscimenti: ["Cirò DOC", "Cirò Classico DOCG", "Savuto DOC", "Bivongi DOC"],
  },
  {
    nome: "Filiera cerealicola e pasta",
    testo:
      "Grani duri, farine e pasta: alla tradizione dei maccheroni al ferretto si affiancano le semine di grani antichi.",
    territorio: "Piana di Sibari, Marchesato, Sila",
    img: "/filiere/home-pasta.jpg",
    alt: "Fusilli di semola su un tavolo di legno",
    credito: "Foto: archivio",
    paragrafi: [
      "Il grano duro trova nelle pianure calde le condizioni migliori, mentre nelle aree interne resistono varietà tradizionali seminate su piccoli appezzamenti, spesso lavorate da mulini a pietra.",
      "La pasta fresca si fa ancora a mano, con il ferro da maglia per i maccheroni al ferretto, e la trafilatura al bronzo dà alla superficie quella rugosità che trattiene il sugo. L'essiccazione lenta a bassa temperatura preserva il colore ambrato della semola.",
    ],
    lavorazione: [
      "Macinazione del grano duro nei mulini",
      "Impasto con sola acqua e trafilatura al bronzo",
      "Essiccazione lenta a bassa temperatura",
    ],
    stagionalita: "Semina autunnale o primaverile, raccolta tra giugno e luglio.",
    prodotti: ["Pasta di semola di grano duro", "Pasta fresca e maccheroni al ferretto", "Farine e semole", "Pane e prodotti da forno", "Grani antichi"],
    riconoscimenti: [],
  },
  {
    nome: "Filiera zootecnica e lattiero-casearia",
    testo:
      "Pecorino Crotonese DOP, Pecorino del Monte Poro DOP e Caciocavallo Silano DOP raccontano l'allevamento ovino e la trasformazione in forme.",
    territorio: "Crotonese, Monte Poro, Sila",
    img: "/filiere/home-formaggi.jpg",
    alt: "Caciocavalli Silano DOP appesi a stagionare",
    credito: "Foto: Qualivita · Qualigeo",
    paragrafi: [
      "Pecore e capre pascolano sulle alture e nelle aree interne, dove il latte arriva ogni giorno nei piccoli caseifici. La mungitura si fa all'alba e il latte viene lavorato a caldo, poche ore dopo.",
      "La pasta filata del Caciocavallo Silano si appende a stagionare a coppie, mentre i pecorini acquistano struttura con i mesi di affinamento in cantina. La ricotta nasce dal siero della lavorazione del giorno, riscaldato e raccolto a mano.",
    ],
    lavorazione: [
      "Mungitura quotidiana e conferimento a freddo al caseificio",
      "Cagliata e rottura della cagliata a mano",
      "Salatura e stagionatura in cantina, su assi di legno",
    ],
    stagionalita: "Produzione tutto l'anno, con più latte in primavera.",
    prodotti: ["Pecorino", "Caciocavallo", "Ricotta e ricotta affumicata", "Provola", "Butirro e burro"],
    riconoscimenti: ["Pecorino Crotonese DOP", "Pecorino del Monte Poro DOP", "Caciocavallo Silano DOP"],
  },
  {
    nome: "Filiera delle carni e dei salumi",
    testo:
      "Soppressata, Salsiccia, Capocollo e Pancetta di Calabria DOP: la norcineria di montagna, con il peperoncino come firma del territorio.",
    territorio: "Sila, Serre, Aspromonte",
    img: "/filiere/home-salumi.jpg",
    alt: "Tagliere di salumi calabresi con capocollo, soppressata e pancetta",
    credito: "Foto: archivio",
    paragrafi: [
      "L'allevamento allo stato brado e semi-brado delle aree montane alimenta una norcineria stagionata al freddo: la soppressata si pressa sotto peso, il capocollo riposa avvolto nella concia, la salsiccia si consuma fresca o secca.",
      "Il peperoncino piccante entra in quasi tutte le ricette di famiglia, insieme a finocchietto selvatico, aglio e vino. La stagionatura avviene in locali areati, dove l'aria di montagna asciuga i salumi lentamente e ne concentra gli aromi.",
    ],
    lavorazione: [
      "Selezione delle carni e macinatura grossa",
      "Concia con sale, peperoncino e spezie",
      "Stagionatura in locali areati per settimane o mesi",
    ],
    stagionalita: "La lavorazione tradizionale si concentra da novembre a febbraio.",
    prodotti: ["Soppressata", "Salsiccia", "Capocollo", "Pancetta", "Guanciale e prosciutti", "'Nduja"],
    riconoscimenti: [
      "Soppressata di Calabria DOP",
      "Salsiccia di Calabria DOP",
      "Capocollo di Calabria DOP",
      "Pancetta di Calabria DOP",
    ],
  },
  {
    nome: "Filiera ortofrutticola",
    testo:
      "Cipolla Rossa di Tropea Calabria IGP, Patata della Sila IGP e Finocchio di Isola Capo Rizzuto IGP, accanto al peperoncino coltivato in tutta la regione.",
    territorio: "Tropea, Sila, Isola Capo Rizzuto",
    img: "/filiere/home-ortofrutta.jpg",
    alt: "Cartone di Patata della Sila IGP con patate novelle",
    credito: "Foto: archivio",
    paragrafi: [
      "Dalle sabbie costiere di Tropea alle terre fresche della Sila, l'orticoltura calabrese lavora su calendari diversi e permette raccolte quasi tutto l'anno, con prodotti che arrivano a mercati lontani.",
      "Accanto ai prodotti certificati resistono colture tradizionali: peperoncini, melanzane, zucchini e legumi secchi delle aree interne. La cipolla rossa si raccoglie a mano e si essicca al sole prima di essere intrecciata in trecce o confezionata in cassette.",
    ],
    lavorazione: [
      "Semina e trapianto su terreni sabbiosi o freschi",
      "Raccolta manuale e cernita in campo",
      "Essiccazione al sole e confezionamento in trecce o cassette",
    ],
    stagionalita: "Cipolla rossa in estate; patate e finocchi in autunno e inverno.",
    prodotti: ["Cipolla rossa", "Patate", "Finocchi", "Peperoncino", "Ortaggi di stagione", "Legumi secchi"],
    riconoscimenti: [
      "Cipolla Rossa di Tropea Calabria IGP",
      "Patata della Sila IGP",
      "Finocchio di Isola Capo Rizzuto IGP",
    ],
  },
  {
    nome: "Filiera della liquirizia",
    testo:
      "La Liquirizia di Calabria DOP nasce nei terreni alluvionali della piana di Sibari, dove la lavorazione della radice è tradizione antica.",
    territorio: "Sibari, Corigliano-Rossano",
    img: "/filiere/home-liquirizia.jpg",
    alt: "Radici di liquirizia",
    credito: "Foto: Qualivita · Qualigeo",
    paragrafi: [
      "La pianta cresce spontanea nei terreni sciolti della piana e la lavorazione trasforma la radice in estratto, sciroppo e pasta. Le radici si estirpano in inverno, quando la pianta è in riposo e concentra gli zuccheri.",
      "Dai pastifici storici di Rossano escono caramelle, bastoncini e liquirizia pura, spesso venduta sfusa nelle botteghe del centro storico. L'estratto si lavora a caldo e poi riposa, così la pasta acquista la consistenza lucida e la frattura netta tipiche.",
    ],
    lavorazione: [
      "Estirpazione delle radici e pulizia",
      "Estrazione a caldo e concentrazione dell'estratto",
      "Formatura in bastoncini, caramelle o pasta sfusa",
    ],
    stagionalita: "Le radici si raccolgono in autunno e inverno.",
    prodotti: ["Radice essiccata", "Estratto e sciroppo", "Caramelle e bastoncini", "Liquirizia pura sfusa", "Polvere per bevande"],
    riconoscimenti: ["Liquirizia di Calabria DOP"],
  },
  {
    nome: "Filiera dei fichi e della dolciaria",
    testo:
      "Fichi di Cosenza DOP e Torrone di Bagnara IGP: la dolciaria calabrese unisce la frutta essiccata al sole alle mandorle del territorio.",
    territorio: "Cosenza, Bagnara Calabra",
    img: "/filiere/home-fichi.jpg",
    alt: "Fichi secchi di Cosenza DOP",
    credito: "Foto: Qualivita · Qualigeo",
    paragrafi: [
      "Il Fico Dottato si essicca al sole su cannizzi e viene farcito con agrumi canditi e mandorle, poi legato a grappoli: è la base della schiocca e dei fichi imbottiti, dolci che si preparano in famiglia ancora oggi.",
      "A Bagnara Calabra il torrone nasce dalla lavorazione di mandorle, miele e albume, con una tradizione dolciaria che risale ai banchi dei confettieri. La mostarda chiude il cerchio, unendo la frutta al mosto cotto.",
    ],
    lavorazione: [
      "Raccolta dei fichi maturi in agosto",
      "Essiccazione al sole su cannizzi, con volteggio quotidiano",
      "Farcitura, legatura a grappoli e conservazione",
    ],
    stagionalita: "Fichi freschi in agosto; secchi e lavorati da settembre.",
    prodotti: ["Fichi secchi e schiocca", "Fichi imbottiti", "Torrone", "Mostarde e confetture", "Mandorle e frutta secca"],
    riconoscimenti: ["Fichi di Cosenza DOP", "Torrone di Bagnara IGP"],
  },
  {
    nome: "Filiera ittica",
    testo:
      "Pesca costiera tra Tirreno e Ionio, acquacoltura e tradizioni marinare: dalle marinerie di Scilla e Bagnara ai porti del Crotonese.",
    territorio: "Scilla, Bagnara, Le Castella",
    img: "/filiere/home-ittica.jpg",
    alt: "Sardine fresche sul ghiaccio",
    credito: "Foto: Wikimedia Commons",
    paragrafi: [
      "Le marinerie dello Stretto lavorano pesce azzurro, alici e pesce spada con tecniche tramandate di padre in figlio; lungo lo Ionio l'acquacoltura alleva orate e branzini in mare aperto, in gabbie ancorate al largo.",
      "La filiera corta dei porti rifornisce pescherie e ristoranti con il pescato del giorno. Alici e sardine si conservano sott'olio o sotto sale, mentre il pesce spada si lavora a trancio già sulla banchina, tra ghiaccio e casse.",
    ],
    lavorazione: [
      "Pesca costiera notturna o all'alba, con reti e palangari",
      "Selezione e ghiaccio a bordo, poi asta del pesce al porto",
      "Conservazione sott'olio, sotto sale o abbattimento per il fresco",
    ],
    stagionalita: "Pesce azzurro soprattutto in primavera ed estate; pesce spada da maggio a settembre.",
    prodotti: ["Pesce azzurro", "Alici e sardine", "Pesce spada e tonno", "Orate e branzini di allevamento", "Conserve ittiche"],
    riconoscimenti: [],
  },
];

const TOTALE = FILIERE.length;

type ProdottoRecord = Record<string, unknown>;

function freccia(direzione: "sinistra" | "destra") {
  return direzione === "sinistra" ? (
    <ChevronLeft className="h-6 w-6" aria-hidden />
  ) : (
    <ChevronRight className="h-6 w-6" aria-hidden />
  );
}

export default function HomepageFiliereShowcase({
  prodottiPerFiliera = {},
}: {
  /** Prodotti già raggruppati per filiera dal server (chiave = nome filiera). */
  prodottiPerFiliera?: Record<string, ProdottoRecord[]>;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dettaglioRef = useRef<HTMLDivElement>(null);
  /** Indice della scheda aperta: `null` = carosello. */
  const [aperta, setAperta] = useState<number | null>(null);

  function scorri(direzione: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direzione * Math.max(320, Math.round(scroller.clientWidth * 0.82)),
      behavior: "smooth",
    });
  }

  // Con la scheda aperta il focus va sul pannello, così tastiera e lettori
  // di schermo non restano sul carosello ormai nascosto.
  useEffect(() => {
    if (aperta === null) return;
    dettaglioRef.current?.focus({ preventScroll: true });
    function suEsc(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAperta(null);
    }
    window.addEventListener("keydown", suEsc);
    return () => window.removeEventListener("keydown", suEsc);
  }, [aperta]);

  const filiera = aperta === null ? null : FILIERE[aperta];
  // Prodotti della sola filiera aperta: sotto la scheda non compare nessun
  // elenco di altre filiere, che confonderebbe la lettura.
  const prodottiFiliera = filiera ? (prodottiPerFiliera[filiera.nome] ?? []) : [];

  return (
    <section
      id="homepage-filiere"
      aria-labelledby="titolo-home-filiere"
      className="w-full bg-[#f6f3ec] px-3 pb-5 pt-3 sm:px-4 md:px-6 md:pb-7 md:pt-4"
    >
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a5a3b]">Radici Calabria</p>
            <h2
              id="titolo-home-filiere"
              className="text-base font-black leading-tight tracking-tight text-[#24462f] sm:text-lg md:text-xl"
            >
              SCOPRI LA FILIERA
            </h2>
          </div>
          <p className="text-[11px] font-semibold text-[#57534e] sm:text-sm">
            {filiera
              ? `${filiera.nome} · ${(aperta ?? 0) + 1} di ${TOTALE}`
              : "Dieci filiere agroalimentari calabresi: scorri e apri una scheda"}
          </p>
        </div>

        {filiera === null ? (
          <div>
          <div className="flex min-w-0 items-stretch gap-2">
            <button
              type="button"
              onClick={() => scorri(-1)}
              aria-label="Mostra le filiere precedenti"
              className="hidden h-11 w-11 shrink-0 self-center items-center justify-center rounded-full border border-[#e5ded0] bg-white text-[#24462f] shadow-sm transition hover:border-[#d5a83a] hover:bg-[#fbf6e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f] md:inline-flex"
            >
              {freccia("sinistra")}
            </button>

            <div
              ref={scrollerRef}
              data-home-inner-horizontal-scroll
              aria-label="Schede delle filiere calabresi"
              className="flex min-w-0 flex-1 snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [scrollbar-width:none] md:gap-5"
            >
              {FILIERE.map((voce, indice) => (
                <button
                  key={voce.nome}
                  type="button"
                  onClick={() => setAperta(indice)}
                  aria-expanded={false}
                  aria-label={`Apri la scheda: ${voce.nome}`}
                  className="group flex w-[86vw] max-w-[420px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[#e5ded0] bg-white text-left shadow-sm transition hover:border-[#d5a83a] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f] md:w-[min(46vw,620px)] md:max-w-none"
                >
                  <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-[#f4efe4] md:aspect-[2/1]">
                    <Image
                      src={voce.img}
                      alt={voce.alt}
                      fill
                      sizes="(max-width: 767px) 86vw, 46vw"
                      className="object-cover object-center transition duration-500 group-hover:scale-[1.02]"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-[#24462f]/90 px-2.5 py-1 text-[10px] font-black tracking-wide text-[#e0cc9a]">
                      {String(indice + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-3.5 md:p-4">
                    <h3 className="text-[15px] font-black leading-tight tracking-tight text-[#1c2b22] md:text-lg">
                      {voce.nome}
                    </h3>
                    <p className="mt-1.5 text-[13px] leading-5 text-[#57534e] md:text-sm md:leading-6">
                      {voce.testo}
                    </p>
                    <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] font-bold leading-4 text-[#8a5a3b] md:text-xs">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {voce.territorio}
                    </p>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                      <span className="min-w-0 truncate text-[9px] text-[#8a8378] md:text-[10px]">{voce.credito}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#d5a83a] px-2.5 py-1.5 text-[11px] font-black text-[#16281c] transition group-hover:bg-[#e0cc9a] md:text-xs">
                        Apri la scheda
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => scorri(1)}
              aria-label="Mostra le filiere successive"
              className="hidden h-11 w-11 shrink-0 self-center items-center justify-center rounded-full border border-[#d5a83a] bg-[#d5a83a] text-[#16281c] shadow-sm transition hover:bg-[#e0cc9a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f] md:inline-flex"
            >
              {freccia("destra")}
            </button>
          </div>

          {/* Su mobile le frecce laterali non ci stanno accanto alle schede
              (largo 86vw): restano sotto il carosello, sempre visibili. */}
          <div
            data-filiere-frecce-mobile
            className="mt-2 flex items-center justify-center gap-3 md:hidden"
          >
            <button
              type="button"
              onClick={() => scorri(-1)}
              aria-label="Mostra le filiere precedenti"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5ded0] bg-white text-[#24462f] shadow-sm transition active:scale-95 hover:border-[#d5a83a] hover:bg-[#fbf6e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f]"
            >
              {freccia("sinistra")}
            </button>
            <button
              type="button"
              onClick={() => scorri(1)}
              aria-label="Mostra le filiere successive"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d5a83a] bg-[#d5a83a] text-[#16281c] shadow-sm transition active:scale-95 hover:bg-[#e0cc9a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f]"
            >
              {freccia("destra")}
            </button>
          </div>
          </div>
        ) : (
          <div
            ref={dettaglioRef}
            tabIndex={-1}
            role="region"
            aria-label={filiera.nome}
            className="overflow-hidden rounded-2xl border border-[#e5ded0] bg-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f]"
          >
            <div className="grid md:grid-cols-[minmax(0,38%)_minmax(0,1fr)]">
              <div className="relative aspect-[16/10] w-full bg-[#f4efe4] md:aspect-auto md:h-full md:min-h-[420px]">
                <Image
                  src={filiera.img}
                  alt={filiera.alt}
                  fill
                  sizes="(max-width: 767px) 100vw, 38vw"
                  className="object-cover object-center"
                />
                <span className="absolute left-3 top-3 rounded-full bg-[#24462f]/90 px-2.5 py-1 text-[10px] font-black tracking-wide text-[#e0cc9a]">
                  {String((aperta ?? 0) + 1).padStart(2, "0")} / {String(TOTALE).padStart(2, "0")}
                </span>
              </div>

              <div className="flex flex-col p-3.5 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[17px] font-black leading-tight tracking-tight text-[#1c2b22] md:text-xl">
                    {filiera.nome}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setAperta(null)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#24462f] px-3 py-1.5 text-[11px] font-black text-white transition hover:bg-[#1b3624] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f] md:text-xs"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                    Tutte le filiere
                  </button>
                </div>

                <p className="mt-1.5 text-[13px] leading-5 text-slate-700 md:text-sm md:leading-6">
                  {filiera.testo}
                </p>
                <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] font-bold leading-4 text-[#8a5a3b] md:text-xs">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {filiera.territorio}
                </p>

                {prodottiFiliera.length > 0 ? (
                  <section
                    aria-label={`Prodotti della ${filiera.nome}`}
                    className="mt-3 rounded-xl border border-[#e5ded0] bg-[#fbf9f4] p-3"
                  >
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8a5a3b]">
                      I prodotti di questa filiera ({prodottiFiliera.length})
                    </p>
                    {/* Due colonne al massimo: righe larghe, nomi interi (niente
                        testo tagliato) e miniature leggibili. */}
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {prodottiFiliera.map((prodotto, indice) => {
                        const id = String(prodotto.id ?? prodotto.slug ?? indice);
                        const slug = String(prodotto.slug ?? id);
                        const nome = String(prodotto.nome ?? "");
                        const prezzo = Number(prodotto.prezzo);
                        const categoria = (prodotto.categoria as string) ?? null;
                        const negozio = String(prodotto.negozio_nome ?? "").trim();
                        return (
                          <li key={id}>
                            <Link
                              href={`/prodotto/${slug}`}
                              className="flex items-center gap-2.5 rounded-lg border border-[#e5ded0] bg-white px-2.5 py-2 transition hover:border-[#d5a83a] hover:bg-[#fbf6e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f]"
                            >
                              {/* Miniatura: la riga resta compatta, niente foto grandi. */}
                              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#f4efe4]">
                                <ProdottoImmagine
                                  src={getProdottoImmagine({
                                    immagine_principale: (prodotto.immagine_principale as string) ?? null,
                                    categoria,
                                  })}
                                  alt={nome}
                                  categoria={categoria}
                                />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block break-words text-[12.5px] font-bold leading-snug text-[#1c2b22]">
                                  {nome}
                                </span>
                                {negozio && (
                                  <span className="block truncate text-[10.5px] leading-tight text-[#8a8378]">
                                    {negozio}
                                  </span>
                                )}
                              </span>
                              {Number.isFinite(prezzo) && (
                                <span className="shrink-0 self-start pt-0.5 text-[12px] font-black tabular-nums text-[#24462f]">
                                  € {prezzo.toFixed(2).replace(".", ",")}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed border-[#d6cab2] bg-[#fbf9f4] p-3 text-[11px] leading-4 text-[#8a8378]">
                    Nessun prodotto di questa filiera disponibile in questo momento.
                  </p>
                )}

                {filiera.paragrafi.map((paragrafo) => (
                  <p
                    key={paragrafo.slice(0, 24)}
                    className="mt-2.5 text-[13px] leading-5 text-[#57534e] md:text-sm md:leading-6"
                  >
                    {paragrafo}
                  </p>
                ))}

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a5a3b]">
                      Cosa si produce
                    </p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {filiera.prodotti.map((prodotto) => (
                        <li
                          key={prodotto}
                          className="rounded-full bg-[#f4efe4] px-2 py-1 text-[11px] font-semibold leading-4 text-[#5b5348]"
                        >
                          {prodotto}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a5a3b]">
                      Riconoscimenti
                    </p>
                    {filiera.riconoscimenti.length > 0 ? (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {filiera.riconoscimenti.map((riconoscimento) => (
                          <li
                            key={riconoscimento}
                            className="rounded-full bg-[#fbf6e8] px-2 py-1 text-[11px] font-bold leading-4 text-[#24462f]"
                          >
                            {riconoscimento}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-[11px] leading-4 text-[#8a8378]">
                        Nessuna denominazione europea: filiera di prodotti tradizionali.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 rounded-xl bg-[#faf7f0] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a5a3b]">
                    Come si lavora
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {filiera.lavorazione.map((passo) => (
                      <li
                        key={passo}
                        className="flex gap-1.5 text-[12px] leading-5 text-[#57534e] md:text-[13px]"
                      >
                        <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#d5a83a]" />
                        {passo}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-[#e5ded0] pt-2 text-[11px] leading-4 text-[#8a8378] md:text-xs">
                    <strong className="font-black text-[#1c2b22]">Stagionalità:</strong> {filiera.stagionalita}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAperta(((aperta ?? 0) - 1 + TOTALE) % TOTALE)}
                    aria-label="Filiera precedente"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e5ded0] text-[#24462f] transition hover:border-[#d5a83a] hover:bg-[#fbf6e8]"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAperta(((aperta ?? 0) + 1) % TOTALE)}
                    aria-label="Filiera successiva"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e5ded0] text-[#24462f] transition hover:border-[#d5a83a] hover:bg-[#fbf6e8]"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                  <span className="text-[10px] font-semibold text-[#8a8378] md:text-[11px]">
                    {(aperta ?? 0) + 1} di {TOTALE}
                  </span>
                  <span className="ml-auto text-[9px] text-[#8a8378] md:text-[10px]">{filiera.credito}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
