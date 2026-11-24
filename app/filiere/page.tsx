import type { Metadata } from "next";
import Link from "next/link";
import {
  Award,
  Droplets,
  Leaf,
  MapPin,
  Ship,
  ShoppingBasket,
  Sprout,
  TrendingUp,
  Users,
} from "lucide-react";
import Header from "@/components/Header/Header";
import { getTerritorio } from "@/lib/territori";
import { getSiteUrl } from "@/lib/site";

// Pagina editoriale: racconta la crescita dell'agroalimentare calabrese con i
// dati del documento di riferimento. NON elenca prodotti e non legge il
// catalogo: i numeri vivono in un'unica costante (`NUMERI`) e gli stessi valori
// alimentano sia i testi sia i grafici, così non possono divergere.
export const metadata: Metadata = {
  // title senza suffisso "| Radici Calabria": lo aggiunge il template del layout.
  title: "Filiere",
  description:
    "La rinascita verde della Calabria: quattro anni di crescita record, innovazione e conquista dei mercati globali. I numeri dell'agroalimentare calabrese e il ruolo di Regione, ARCEA e ARSAC.",
  alternates: { canonical: `${getSiteUrl()}/filiere` },
  openGraph: {
    title: "La rinascita verde della Calabria",
    description:
      "Quattro anni di crescita record, innovazione e conquista dei mercati globali per l'agroalimentare calabrese.",
    url: `${getSiteUrl()}/filiere`,
    type: "article",
    siteName: "Radici Calabria",
    images: ["/filiere/copertina.webp"],
  },
};

/** Tutti i numeri citati nel testo, in un solo posto. */
const NUMERI = {
  pil: 6.2,
  valoreAggiunto: 24.3,
  impreseInCrescita: 78,
  exportFoodBeverage: 40,
  indiceExport: 262,
  bio: 36,
  arceaLiquidato: 282,
  bandoGiovani: 44,
  comuniInfrastrutture: 61,
  tuttoFoodAziende: 133,
  vinitalyCantine: 100,
};

const numeroIt = (valore: number) =>
  valore.toLocaleString("it-IT", { minimumFractionDigits: valore % 1 === 0 ? 0 : 1 });

/** Foto riusate dalle schede territorio già presenti (stessi file e alt). */
const fotoSibari = getTerritorio("piana-di-sibari")?.immagine;
const fotoPollino = getTerritorio("pollino")?.immagine;

/**
 * Foto della copertina e dei prodotti simbolo: file locali in `public/filiere`,
 * liberi da diritti con la licenza indicata (nessun credito mostrato in pagina).
 */
const FOTO = {
  copertina: {
    src: "/filiere/copertina.webp",
    alt: "La piana di Sibari vista dall'alto, tra agrumeti, oliveti e colture",
  },
  clementine: {
    src: "/filiere/clementine.webp",
    alt: "Clementine calabresi appena raccolte su un tavolo di legno",
  },
  bergamotto: {
    src: "/filiere/bergamotto.webp",
    alt: "Bergamotto intero e tagliato a metà, con la buccia gialla profumata",
  },
  vino: {
    src: "/filiere/vino.webp",
    alt: "Vigneto del Cirò in Calabria, con i filari su colline verdi",
  },
  olio: {
    src: "/filiere/olio.webp",
    alt: "Uliveto calabrese a Filandari, nel vibonese",
  },
};

const PRODOTTI_SIMBOLO = [
  {
    nome: "Clementine di Calabria",
    sigla: "IGP",
    logo: "/loghi/igp.png",
    logoAlt: "Marchio IGP — Indicazione geografica protetta",
    logoEtichetta: null,
    testo: "Agrume simbolo della Piana di Sibari, raccolto tra novembre e gennaio.",
    foto: FOTO.clementine,
  },
  {
    nome: "Bergamotto di Reggio Calabria",
    sigla: "DOP",
    logo: "/loghi/dop.png",
    logoAlt: "Marchio DOP — Denominazione di origine protetta",
    logoEtichetta: null,
    testo: "L'Italia ne è quasi l'unica produttrice mondiale.",
    foto: FOTO.bergamotto,
  },
  {
    nome: "Vini autoctoni",
    sigla: "DOC",
    logo: "/loghi/dop.png",
    logoAlt: "Marchio DOP — Denominazione di origine protetta, menzione DOC",
    logoEtichetta: "DOC",
    testo: "Gaglioppo, Magliocco e Greco raccontano il territorio.",
    foto: FOTO.vino,
  },
  {
    nome: "Olio extravergine d'oliva",
    sigla: "DOP",
    logo: "/loghi/dop.png",
    logoAlt: "Marchio DOP — Denominazione di origine protetta",
    logoEtichetta: null,
    testo: "Uliveti secolari tra coste e vallate interne.",
    foto: FOTO.olio,
  },
];

const RICONOSCIMENTI = [
  { logo: "/loghi/dop.png", sigla: "DOP", nome: "Denominazione di origine protetta" },
  { logo: "/loghi/igp.png", sigla: "IGP", nome: "Indicazione geografica protetta" },
  { logo: "/loghi/igt.png", sigla: "IGT", nome: "Indicazione geografica tipica" },
  { logo: "/loghi/pat.png", sigla: "PAT", nome: "Prodotti agroalimentari tradizionali" },
];

/* ───────────────────────────── Grafici ───────────────────────────── */

/** Barra orizzontale con valore in evidenza: usata per percentuali e milioni. */
function Barra({
  etichetta,
  valore,
  massimo,
  suffisso,
  nota,
  colore = "bg-[#d5a83a]",
  marcatore,
}: {
  etichetta: string;
  valore: number;
  massimo: number;
  suffisso: string;
  nota?: string;
  colore?: string;
  marcatore?: { valore: number; etichetta: string };
}) {
  const percentuale = Math.max(0, Math.min(100, (valore / massimo) * 100));
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="text-sm font-bold text-slate-800">{etichetta}</p>
        <p className="text-lg font-black tabular-nums text-[#24462f]">
          {numeroIt(valore)}
          {suffisso}
        </p>
      </div>
      <div
        className="relative mt-1.5 h-3 w-full overflow-hidden rounded-full bg-slate-200"
        role="img"
        aria-label={`${etichetta}: ${numeroIt(valore)}${suffisso}`}
      >
        <div className={`h-full rounded-full ${colore}`} style={{ width: `${percentuale}%` }} />
        {marcatore && (
          <span
            aria-hidden="true"
            className="absolute top-0 h-full border-l-2 border-dashed border-[#24462f]/60"
            style={{ left: `${(marcatore.valore / massimo) * 100}%` }}
          />
        )}
      </div>
      {(nota || marcatore) && (
        <p className="mt-1 text-[11px] leading-4 text-[#8a8378]">
          {nota}
          {marcatore && (
            <span className="whitespace-nowrap">
              {nota ? " · " : ""}
              <span aria-hidden="true">┆</span> {marcatore.etichetta} = {marcatore.valore}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** Anello percentuale (SVG, nessuna dipendenza) per i valori tondi. */
function Anello({
  valore,
  etichetta,
  nota,
  colore = "#d5a83a",
  traccia = "#e5ded0",
}: {
  valore: number;
  etichetta: string;
  nota?: string;
  colore?: string;
  traccia?: string;
}) {
  const raggio = 42;
  const circonferenza = 2 * Math.PI * raggio;
  const visibile = Math.max(0, Math.min(100, valore));
  const offset = circonferenza - (visibile / 100) * circonferenza;
  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 100 100"
        className="h-24 w-24 shrink-0 -rotate-90"
        role="img"
        aria-label={`${etichetta}: ${numeroIt(valore)} per cento`}
      >
        <circle cx="50" cy="50" r={raggio} fill="none" stroke={traccia} strokeWidth="12" />
        <circle
          cx="50"
          cy="50"
          r={raggio}
          fill="none"
          stroke={colore}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circonferenza}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="min-w-0">
        <p className="text-3xl font-black leading-none tracking-tight text-slate-900">
          {numeroIt(valore)}%
        </p>
        <p className="mt-1 text-sm font-bold text-[#57534e]">{etichetta}</p>
        {nota && <p className="mt-1 text-xs leading-5 text-[#8a8378]">{nota}</p>}
      </div>
    </div>
  );
}

/** Scheda numero sintetico. */
function Kpi({
  valore,
  etichetta,
  icona: Icona,
}: {
  valore: string;
  etichetta: string;
  icona: typeof Leaf;
}) {
  return (
    <div className="rd-dato">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#d5a83a]">
        <Icona className="h-4 w-4 text-white" aria-hidden />
      </span>
      <p className="mt-2 text-xl font-black leading-none tabular-nums text-[#1b3624]">{valore}</p>
      <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-600">{etichetta}</p>
    </div>
  );
}

/** Etichetta di sezione, nello stile giallo/blu del sito. */
function Occhiello({
  icona: Icona,
  children,
}: {
  icona: typeof Leaf;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#8a5a3b]">
      <Icona className="h-4 w-4" aria-hidden />
      {children}
    </p>
  );
}

/** Scheda ente (ARCEA, ARSAC): nome grande e leggibile. */
function SchedaEnte({
  nome,
  esteso,
  descrizione,
}: {
  nome: string;
  esteso: string;
  descrizione: React.ReactNode;
}) {
  return (
    <div className="rd-pannello border-l-[#d5a83a] p-4 md:p-6">
      <p className="text-2xl font-black uppercase leading-none tracking-[0.08em] text-[#24462f] md:text-4xl">
        {nome}
      </p>
      <p className="mt-2 text-sm font-bold leading-5 text-[#1b3624] md:text-base">{esteso}</p>
      <p className="mt-2 text-sm leading-6 text-[#57534e]">{descrizione}</p>
    </div>
  );
}

export default function FilierePage() {
  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      {/* Copertina */}
      <section aria-labelledby="titolo-filiere" className="relative isolate overflow-hidden bg-[#0d1a12]">
        {/* Foto a piena larghezza: la luce resta quella originale, il testo si
            appoggia a due sfumature verdi (sinistra e basso). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={FOTO.copertina.src}
          alt={FOTO.copertina.alt}
          className="absolute inset-0 -z-20 h-full w-full scale-[1.02] object-cover object-[50%_58%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_0%_100%,rgba(9,26,17,0.92)_0%,rgba(9,26,17,0.55)_45%,rgba(9,26,17,0)_75%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0d1a12]/85 via-[#0d1a12]/20 to-[#0d1a12]/10"
        />

        {/* Doppia cornice: filo chiaro su tutto il perimetro e filo oro in
            alto a sinistra, come un ritaglio di rivista. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-3 z-10 rounded-[1.25rem] border border-white/25 md:inset-5"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-3 z-10 rounded-[1.25rem] border-l border-t border-[#d5a83a]/70 md:inset-5"
        />

        <div className="relative mx-auto flex min-h-[440px] w-full max-w-[1200px] flex-col justify-between px-6 pb-6 pt-24 sm:px-8 md:min-h-[560px] md:px-10 md:pb-8 md:pt-28">
          {/* Targhetta della copertina. */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d5a83a]/60 bg-[#f4efe4]/95 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[#5c3a22] shadow-[0_6px_20px_-10px_rgba(2,6,23,0.55)] backdrop-blur md:text-[11px]">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#8a5a3b]" />
              Filiere · 2022–2026
            </p>
          </div>

          <div className="mt-8">
            <h1
              id="titolo-filiere"
              className="max-w-[20ch] text-balance text-4xl font-black leading-[1.02] tracking-[-0.035em] text-white [text-shadow:0_2px_18px_rgba(2,6,23,0.5)] sm:text-5xl md:text-6xl"
            >
              La rinascita verde{" "}
              <span className="font-serif italic text-[#e0cc9a]">della Calabria</span>
            </h1>
            <p className="mt-4 max-w-xl text-pretty text-sm font-medium leading-6 text-white/90 [text-shadow:0_1px_8px_rgba(2,6,23,0.6)] md:text-base md:leading-7">
              Quattro anni di crescita record, innovazione e conquista dei mercati globali.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap items-end justify-end gap-3 border-t border-white/20 pt-3">
            {/* Il catalogo vive in /filiere/prodotti: stessa pagina e stesse
                schede prodotto di sempre, spostate qui quando /prodotti è
                stata liberata per TerraQ. */}
            <Link
              href="/filiere/prodotti"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d5a83a] bg-[#d5a83a] px-3.5 py-1.5 text-[11px] font-black text-[#16281c] shadow-[0_6px_20px_-10px_rgba(2,6,23,0.55)] transition hover:bg-[#e0cc9a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:gap-2.5 md:px-5 md:py-2.5 md:text-sm"
            >
              <ShoppingBasket className="h-4 w-4 shrink-0 md:h-5 md:w-5" aria-hidden />
              Scopri i prodotti della filiera
            </Link>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="h-1 w-full bg-gradient-to-r from-[#d5a83a] via-[#d5a83a]/50 to-transparent"
        />
      </section>

      <div className="rd-guscio py-8 md:py-12">
        {/* Intro */}
        <div className="rd-fascia p-5 md:p-8">
          <p className="text-sm leading-7 text-[#57534e] md:text-base">
            C’è una Calabria che non si limita a custodire le proprie tradizioni millenarie, ma le
            trasforma in un motore economico moderno, competitivo e riconosciuto in tutto il mondo.
            Negli ultimi quattro anni, tra il 2022 e il 2026, il comparto agroalimentare calabrese è
            stato protagonista di una vera e propria svolta strutturale: un percorso fatto di numeri
            da primato, investimenti mirati e una visione istituzionale condivisa che ha saputo fare
            squadra con gli agricoltori, portando le eccellenze della regione sulle tavole
            internazionali.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi valore={`${numeroIt(NUMERI.pil)}%`} etichetta="incidenza agricoltura sul PIL regionale" icona={TrendingUp} />
            <Kpi valore={`+${numeroIt(NUMERI.valoreAggiunto)}%`} etichetta="valore aggiunto per unità di lavoro dal 2022" icona={Award} />
            <Kpi valore={`${NUMERI.impreseInCrescita}%`} etichetta="aziende agroindustriali con produzione in aumento" icona={Users} />
            <Kpi valore={`${NUMERI.exportFoodBeverage}%`} etichetta="del valore dell'export regionale è food & beverage" icona={Ship} />
            <Kpi valore={`${NUMERI.indiceExport}`} etichetta="indice export agroalimentare (pre-pandemia = 100)" icona={TrendingUp} />
            <Kpi valore={`${NUMERI.bio}%`} etichetta="della superficie agricola coltivata con metodo biologico" icona={Leaf} />
          </div>
        </div>

        {/* 1 — Motore economico */}
        <section aria-labelledby="motore" className="mt-8 md:mt-12">
          <Occhiello icona={TrendingUp}>Un motore economico</Occhiello>
          <h2
            id="motore"
            className="mt-1 text-2xl font-black tracking-tight text-slate-900 md:text-3xl"
          >
            Che corre più della media nazionale
          </h2>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4 rd-fascia p-5 md:p-6">
              <Barra
                etichetta="Incidenza dell'agricoltura sul PIL regionale"
                valore={NUMERI.pil}
                massimo={8}
                suffisso="%"
                nota="Quasi il triplo rispetto alla media italiana."
              />
              <Barra
                etichetta="Valore aggiunto per unità di lavoro (2022 → 2026)"
                valore={NUMERI.valoreAggiunto}
                massimo={30}
                suffisso="%"
                colore="bg-[#24462f]"
                nota="Crescita cinque volte superiore alla media nazionale."
              />
              <Barra
                etichetta="Aziende agroindustriali con produzione reale in aumento"
                valore={NUMERI.impreseInCrescita}
                massimo={100}
                suffisso="%"
                nota="Oltre i tre quarti del comparto."
              />
            </div>

            <div className="flex flex-col gap-4">
              <figure className="rd-scheda overflow-hidden">
                {fotoSibari && (
                  <>
                    {/* Foto in cornice: filo oro nell'angolo e didascalia discreta
                        sotto, non più un'immagine da catalogo. */}
                    <div className="relative m-2 overflow-hidden rounded-xl bg-[#0d1a12]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fotoSibari.src}
                        alt={fotoSibari.alt}
                        loading="lazy"
                        className="h-48 w-full object-cover transition duration-700 ease-out hover:scale-[1.04] sm:h-56"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-t from-[#0a140e]/55 via-transparent to-transparent"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-2 rounded-lg ring-1 ring-white/20"
                      />
                      <span
                        aria-hidden="true"
                        className="absolute left-2 top-2 h-7 w-7 border-l-2 border-t-2 border-[#d5a83a]"
                      />
                    </div>
                    <figcaption className="flex items-start gap-2 px-4 pt-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-[#8a8378]">
                      <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#d5a83a]" />
                      {fotoSibari.alt}
                    </figcaption>
                  </>
                )}
                <p className="px-4 pb-4 pt-2 text-sm leading-6 text-[#57534e]">
                  La spinta produttiva si è tradotta in una straordinaria apertura verso l’estero:
                  l’export complessivo della Calabria ha infranto il muro simbolico del miliardo di
                  euro, trainato dal food &amp; beverage che rappresenta quasi il 40% delle vendite
                  oltreconfine.
                </p>
              </figure>

              <div className="rd-fascia p-5 md:p-6">
                <Barra
                  etichetta="Indice di crescita dell'export agroalimentare"
                  valore={NUMERI.indiceExport}
                  massimo={300}
                  suffisso=""
                  marcatore={{ valore: 100, etichetta: "livelli pre-pandemia" }}
                  nota="Dai livelli pre-pandemia ai mercati europei ed extra-UE."
                />
                <div className="mt-4">
                  <Anello
                    valore={NUMERI.exportFoodBeverage}
                    etichetta="del valore dell'export"
                    nota="Quota del food & beverage sulle vendite oltreconfine."
                    colore="#24462f"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Prodotti simbolo: foto reali, nessun link al catalogo. */}
          <div className="mt-5 rd-fascia p-5 md:p-6">
            <Occhiello icona={Leaf}>I prodotti simbolo</Occhiello>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-[#57534e]">
              I prodotti simbolo della regione — dalle clementine IGP al bergamotto, dai vini
              autoctoni all’olio extravergine d’oliva — hanno conquistato nuovi spazi nei mercati
              europei ed extra-UE, affrontando con resilienza anche le fisiologiche fasi di
              assestamento dei mercati globali nel 2026.
            </p>

            {/* Mosaico editoriale: il primo prodotto è la foto-guida, gli altri
                la accompagnano. Testi sovrapposti alla foto, indice numerato e
                filo oro interno: nessuna didascalia da catalogo. */}
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {PRODOTTI_SIMBOLO.map((prodotto, indice) => (
                <figure
                  key={prodotto.nome}
                  className={`group relative overflow-hidden rounded-2xl border border-[#e5ded0] bg-[#0d1a12] shadow-[0_1px_2px_rgb(27_54_36_/_0.04),0_24px_48px_-32px_rgb(27_54_36_/_0.6)] ${
                    indice === 0 ? "col-span-2 lg:row-span-2" : ""
                  }`}
                >
                  <div
                    className={`relative w-full overflow-hidden ${
                      indice === 0
                        ? "aspect-[16/11] lg:aspect-auto lg:h-full"
                        : "aspect-[4/5] sm:aspect-[4/3]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={prodotto.foto.src}
                      alt={prodotto.foto.alt}
                      loading="lazy"
                      className={`h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.05] ${
                        indice === 0 ? "" : "brightness-[1.14] contrast-[1.02] saturate-[1.04]"
                      }`}
                    />
                    {/* Velo solo in basso: le foto piccole restano luminose e
                        leggibili, il testo si stacca grazie all'ombra. */}
                    <div
                      aria-hidden="true"
                      className={`absolute inset-0 ${
                        indice === 0
                          ? "bg-[linear-gradient(to_top,rgba(5,14,8,0.9)_0%,rgba(5,14,8,0.5)_38%,rgba(5,14,8,0)_72%)]"
                          : "bg-[linear-gradient(to_top,rgba(5,14,8,0.86)_0%,rgba(5,14,8,0.55)_32%,rgba(5,14,8,0.1)_62%,rgba(5,14,8,0)_100%)]"
                      }`}
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-2 rounded-xl ring-1 ring-white/20 transition group-hover:ring-[#d5a83a]/60"
                    />
                    <span className="absolute left-4 top-4 text-[10px] font-black uppercase tabular-nums tracking-[0.2em] text-white/55">
                      {String(indice + 1).padStart(2, "0")}
                    </span>
                    {/* Marchio ufficiale (IGP/DOP) dove esiste; per le altre
                        foto resta la sigla in oro. */}
                    {prodotto.logo && prodotto.logoAlt ? (
                      prodotto.logoEtichetta ? (
                        /* Marchio ufficiale + menzione tradizionale: i vini DOC
                           sono DOP, quindi portano il marchio DOP accanto a "DOC". */
                        <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-2 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.65)] ring-1 ring-black/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={prodotto.logo}
                            alt={prodotto.logoAlt}
                            loading="lazy"
                            className="h-7 w-7 object-contain md:h-8 md:w-8"
                          />
                          <span className="text-[9px] font-black uppercase leading-none tracking-[0.1em] text-[#1b3624]">
                            {prodotto.logoEtichetta}
                          </span>
                        </span>
                      ) : (
                        <span
                          className={`absolute right-3 top-3 flex items-center justify-center rounded-full bg-white p-1 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.65)] ring-1 ring-black/10 ${
                            indice === 0 ? "h-14 w-14 md:h-16 md:w-16" : "h-11 w-11 md:h-12 md:w-12"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={prodotto.logo}
                            alt={prodotto.logoAlt}
                            loading="lazy"
                            className="h-full w-full object-contain"
                          />
                        </span>
                      )
                    ) : (
                      <span className="absolute right-3 top-3 rounded-full bg-[#d5a83a] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#16281c] shadow-sm">
                        {prodotto.sigla}
                      </span>
                    )}
                    <figcaption className={`absolute inset-x-0 bottom-0 p-3.5 sm:p-4 ${indice === 0 ? "md:p-6" : "md:p-4"}`}>
                      <p
                        className={`font-extrabold leading-tight tracking-tight text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.6)] ${
                          indice === 0
                            ? "text-xl md:text-3xl"
                            : "line-clamp-2 text-[13px] sm:text-[15px] md:text-lg"
                        }`}
                      >
                        {prodotto.nome}
                      </p>
                      <p
                        className={`mt-1 text-white/95 [text-shadow:0_1px_8px_rgba(0,0,0,0.55)] sm:mt-1.5 ${
                          indice === 0
                            ? "mt-1.5 text-xs leading-5 md:text-sm md:leading-6"
                            : "line-clamp-2 text-[10.5px] leading-[1.35] sm:text-[11.5px] md:line-clamp-3 md:text-[13px] md:leading-5"
                        }`}
                      >
                        {prodotto.testo}
                      </p>
                    </figcaption>
                  </div>
                </figure>
              ))}
            </div>

            {/* Riconoscimenti: i loghi ufficiali già presenti nel sito. */}
            <div className="mt-4 rounded-2xl border border-[#e8dfc9] bg-[#fbf6e8] p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#24462f]">
                I riconoscimenti
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {RICONOSCIMENTI.map((riconoscimento) => (
                  <div key={riconoscimento.sigla} className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={riconoscimento.logo}
                      alt={`Logo ${riconoscimento.sigla}`}
                      loading="lazy"
                      className="h-10 w-10 shrink-0 object-contain"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-black leading-none text-[#1b3624]">
                        {riconoscimento.sigla}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-3 text-slate-600">
                        {riconoscimento.nome}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 2 — Regione Calabria */}
        <section aria-labelledby="regione" className="mt-10 md:mt-14">
          <Occhiello icona={MapPin}>La regia della Regione Calabria</Occhiello>
          <h2
            id="regione"
            className="mt-1 text-2xl font-black tracking-tight text-slate-900 md:text-3xl"
          >
            Risorse, giovani e primato green
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-[#57534e]">
            Dietro questo successo non c’è il caso, ma una precisa strategia politica e
            amministrativa guidata dalla Regione Calabria e dall’Assessorato all’Agricoltura. Negli
            ultimi quattro anni l’ente regionale ha cambiato passo, trasformando la gestione dei
            fondi europei in liquidità immediata e opportunità concrete per chi lavora la terra.
            Attraverso l’agenzia pagatrice ARCEA, solo nell’ultimo anno sono stati liquidati oltre{" "}
            {NUMERI.arceaLiquidato} milioni di euro, mentre l’attuazione del nuovo Complemento di
            Sviluppo Rurale (CSR 2023–2027) ha posto la Calabria ai vertici nazionali per velocità ed
            efficienza di spesa.
          </p>

          <div className="mt-4">
            <SchedaEnte
              nome="ARCEA"
              esteso="Azienda Regionale per le Erogazioni in Agricoltura"
              descrizione={
                <>
                  L’agenzia pagatrice della Regione: nell’ultimo anno ha liquidato oltre{" "}
                  <strong className="font-black text-[#24462f]">
                    {NUMERI.arceaLiquidato} milioni di euro
                  </strong>{" "}
                  alle imprese agricole calabresi.
                </>
              }
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="space-y-4 rd-fascia p-5 md:p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8a8378]">
                Risorse liquidate e stanziate
              </p>
              <Barra
                etichetta="ARCEA — liquidato nell'ultimo anno"
                valore={NUMERI.arceaLiquidato}
                massimo={300}
                suffisso=" mln €"
              />
              <Barra
                etichetta="Comuni — infrastrutture rurali, strade interpoderali, reti idriche"
                valore={NUMERI.comuniInfrastrutture}
                massimo={300}
                suffisso=" mln €"
                colore="bg-[#24462f]"
              />
              <Barra
                etichetta="Bando SRE01 — insediamento giovani agricoltori under 41"
                valore={NUMERI.bandoGiovani}
                massimo={300}
                suffisso=" mln €"
                colore="bg-[#1b3624]"
                nota="Finanziato il 100% delle domande ammesse."
              />
            </div>

            <div className="space-y-4">
              <div className="rd-fascia p-5 md:p-6">
                <Anello
                  valore={NUMERI.bio}
                  etichetta="della SAU è biologico"
                  nota="La Calabria è la prima regione in Italia per incidenza di superfici coltivate con metodo biologico."
                />
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#fbf6e8] p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/loghi/bio.png" alt="Logo del biologico europeo" className="h-9 w-9 object-contain" />
                  <p className="text-[11px] leading-4 text-slate-600">
                    Oltre il {NUMERI.bio}% della Superficie Agricola Utilizzata: un primato che
                    certifica una vocazione naturale alla sostenibilità.
                  </p>
                </div>
              </div>

              {fotoPollino && (
                <figure className="rd-scheda overflow-hidden">
                  <div className="relative m-2 overflow-hidden rounded-xl bg-[#0d1a12]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fotoPollino.src}
                      alt={fotoPollino.alt}
                      loading="lazy"
                      className="h-44 w-full object-cover transition duration-700 ease-out hover:scale-[1.04] sm:h-52"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-[#0a140e]/55 via-transparent to-transparent"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-2 rounded-lg ring-1 ring-white/20"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute left-2 top-2 h-7 w-7 border-l-2 border-t-2 border-[#d5a83a]"
                    />
                    <figcaption className="absolute inset-x-2 bottom-2 flex items-start gap-2 rounded-lg bg-[#0a140e]/55 px-2.5 py-1.5 text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-white/85 backdrop-blur">
                      <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#d5a83a]" />
                      {fotoPollino.alt}
                    </figcaption>
                  </div>
                </figure>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              {
                titolo: "Il futuro nelle mani dei giovani",
                testo: `Con oltre ${NUMERI.bandoGiovani} milioni di euro attraverso il bando SRE01, la Regione ha finanziato il 100% delle domande ammesse per l’insediamento di nuovi agricoltori under 41, scommettendo sul ricambio generazionale e sull’innovazione tecnologica.`,
                icona: Sprout,
              },
              {
                titolo: "La cura dei territori",
                testo: `Oltre ${NUMERI.comuniInfrastrutture} milioni di euro destinati ai Comuni calabresi per ammodernare le infrastrutture rurali, migliorare le strade interpoderali e potenziare le reti idriche nelle aree interne.`,
                icona: MapPin,
              },
              {
                titolo: "La leadership nel biologico",
                testo: `Oggi la Calabria è la prima regione in Italia per incidenza di superfici coltivate con metodo biologico, superando il ${NUMERI.bio}% della Superficie Agricola Utilizzata.`,
                icona: Droplets,
              },
            ].map((pilastro) => (
              <article
                key={pilastro.titolo}
                className="rd-scheda p-5"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#d5a83a]">
                  <pilastro.icona className="h-4 w-4 text-white" aria-hidden />
                </span>
                <h3 className="mt-3 text-base font-black leading-tight tracking-tight text-slate-900">
                  {pilastro.titolo}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{pilastro.testo}</p>
              </article>
            ))}
          </div>
        </section>

        {/* 3 — ARSAC e Calabria Straordinaria */}
        <section aria-labelledby="arsac" className="mt-10 md:mt-14">
          <Occhiello icona={Award}>ARSAC e “Calabria Straordinaria”</Occhiello>
          <h2
            id="arsac"
            className="mt-1 text-2xl font-black tracking-tight text-slate-900 md:text-3xl"
          >
            Il braccio operativo dell’eccellenza
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-[#57534e]">
            Per trasformare un prodotto eccellente in un brand vincente serve un ponte tra la
            ricerca scientifica, l’assistenza in campo e i grandi palcoscenici internazionali. È
            questo il ruolo svolto dall’ARSAC, il braccio tecnico-operativo della Regione che,
            consolidata la propria governance, ha accompagnato passo dopo passo la crescita delle
            imprese.
          </p>

          <div className="mt-4">
            <SchedaEnte
              nome="ARSAC"
              esteso="Azienda Regionale per lo Sviluppo dell’Agricoltura Calabrese"
              descrizione="Ricerca, sperimentazione e divulgazione in campo: centri dimostrativi, bollettini agrometeorologici e tutela della biodiversità calabrese."
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rd-fascia p-5 md:p-6">
              <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#8a5a3b]">
                <Sprout className="h-4 w-4" aria-hidden />
                Innovazione nei campi
              </h3>
              <ul className="mt-3 space-y-2.5 text-sm leading-6 text-[#57534e]">
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d5a83a]" />
                  La rete dei Centri Sperimentali Dimostrativi e il lavoro quotidiano dei divulgatori
                  agricoli portano l’innovazione direttamente nei campi.
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d5a83a]" />
                  Bollettini agrometeorologici e fitosanitari settimanali, fondamentali per ridurre
                  l’impatto ambientale e ottimizzare i costi.
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d5a83a]" />
                  Tutela della biodiversità e delle razze autoctone come il Suino Nero di Calabria, la
                  bovina Podolica e il Fico Dottato.
                </li>
              </ul>
              <p className="mt-3 text-sm leading-6 text-[#57534e]">
                Così l’ente garantisce che la tradizione cammini al fianco della scienza.
              </p>
            </div>

            <div className="rd-fascia p-5 md:p-6">
              <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#8a5a3b]">
                <Award className="h-4 w-4" aria-hidden />
                Presenze alle fiere 2026
              </h3>
              <div className="mt-3 space-y-3">
                <Barra
                  etichetta="TuttoFood — Milano (aziende)"
                  valore={NUMERI.tuttoFoodAziende}
                  massimo={150}
                  suffisso=""
                  nota="Oltre 133 aziende protagoniste."
                />
                <Barra
                  etichetta="Vinitaly — Verona (cantine)"
                  valore={NUMERI.vinitalyCantine}
                  massimo={150}
                  suffisso=""
                  colore="bg-[#24462f]"
                  nota="Più di 100 cantine."
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-[#57534e]">
                Niente più presenze frammentate, ma un’unica grande casa comune nelle più prestigiose
                vetrine mondiali, con una presenza di primo piano anche a Macfrut e al Merano Wine
                Festival: un lavoro capillare che permette anche ai piccoli produttori di dialogare
                direttamente con i grandi buyer internazionali.
              </p>
            </div>
          </div>
        </section>

        {/* 4 — Futuro */}
        <section
          aria-labelledby="futuro"
          className="rd-fascia mt-10 p-5 md:mt-14 md:p-8"
        >
          <Occhiello icona={MapPin}>Uno sguardo al futuro</Occhiello>
          <h2 id="futuro" className="mt-1 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
            Consolidare i risultati
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-[#57534e]">
            La sfida dei prossimi anni sarà consolidare questi risultati, affrontando nodi storici
            come i costi energetici, l’aggregazione delle filiere e il potenziamento della logistica
            integrata attorno all’hub di Gioia Tauro. Ma la strada è tracciata: la Calabria
            agroalimentare ha dimostrato di avere le risorse, le competenze istituzionali e il
            talento imprenditoriale per essere non più una semplice scommessa, ma una straordinaria
            certezza del Made in Italy.
          </p>

          <nav aria-label="Continua a esplorare" className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/territorio"
              className="rd-azione px-5 py-2.5"
            >
              <MapPin className="h-4 w-4" aria-hidden />
              Scopri i territori
            </Link>
            <Link
              href="/negozi"
              className="rd-azione-tenue px-5 py-2.5"
            >
              <Users className="h-4 w-4" aria-hidden />
              Le aziende del territorio
            </Link>
          </nav>

          <p className="rd-nota mt-6">
            Cifre e affermazioni come riportate nel documento di riferimento.
          </p>
        </section>
      </div>
    </main>
  );
}
