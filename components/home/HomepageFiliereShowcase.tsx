import { ArrowUpRight } from "lucide-react";

type FilieraCard = {
  numero: string;
  titolo: string;
  descrizione: string;
  esempi: string[];
  dettaglio?: string;
  immagine: string;
  alt: string;
  didascalia: string;
  autoreFoto: string;
  licenzaFoto: string;
  fonteFoto: string;
  fonteInfo: string;
  etichettaFonte: string;
};

const FILIERE: FilieraCard[] = [
  {
    numero: "01",
    titolo: "Filiera olivicola",
    descrizione:
      "Dagli oliveti ai frantoi: raccolta, molitura ed estrazione dell’olio extravergine. La Calabria valorizza produzioni IGP e diverse denominazioni DOP legate a specifici territori.",
    esempi: ["Olio di Calabria IGP", "Bruzio DOP", "Lametia DOP", "Alto Crotonese DOP"],
    dettaglio: "La fotografia documenta una raccolta di olive nei dintorni di Bagaladi, nel Reggino.",
    immagine:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kalabrien-Olivenernte.JPG?width=1200",
    alt: "Raccolta delle olive nei dintorni di Bagaladi, Calabria",
    didascalia: "Raccolta delle olive · area di Bagaladi",
    autoreFoto: "Clemens M. Brandstetter",
    licenzaFoto: "CC BY-SA 3.0",
    fonteFoto: "https://commons.wikimedia.org/wiki/File:Kalabrien-Olivenernte.JPG",
    fonteInfo: "https://www.arsacweb.it/le-produzioni-dop-e-igp-della-regione-calabria/",
    etichettaFonte: "ARSAC · denominazioni dell’olio calabrese",
  },
  {
    numero: "02",
    titolo: "Filiera agrumicola",
    descrizione:
      "Agrumeti, raccolta, selezione e trasformazione. Le produzioni comprendono clementine, limoni, cedri e bergamotto; da quest’ultimo si ricava anche l’olio essenziale DOP di Reggio Calabria.",
    esempi: [
      "Clementine di Calabria IGP",
      "Limone di Rocca Imperiale IGP",
      "Cedro di Santa Maria del Cedro DOP",
      "Bergamotto di Reggio Calabria – olio essenziale DOP",
    ],
    dettaglio:
      "Le Clementine di Calabria IGP ammettono otto varietà e sono coltivate in tutte e cinque le province; la Piana di Sibari è uno dei principali areali.",
    immagine:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Macchina_calabrese.jpg?width=1000",
    alt: "Antica macchina calabrese per la spremitura dei bergamotti a Reggio Calabria",
    didascalia: "Antica macchina per la spremitura dei bergamotti · Reggio Calabria",
    autoreFoto: "Autore non identificato · immagine storica",
    licenzaFoto: "Pubblico dominio",
    fonteFoto: "https://commons.wikimedia.org/wiki/File:Macchina_calabrese.jpg",
    fonteInfo: "https://www.arsacweb.it/clementina-di-calabria-igp/",
    etichettaFonte: "ARSAC · Clementine di Calabria IGP",
  },
  {
    numero: "03",
    titolo: "Filiera vitivinicola",
    descrizione:
      "Vigneti, vitigni autoctoni, vendemmia, cantine e vinificazione: una filiera che unisce paesaggi e competenze enologiche delle diverse aree calabresi.",
    esempi: ["Cirò DOC", "Cirò Classico DOCG", "Terre di Cosenza DOC", "Savuto DOC"],
    dettaglio:
      "Nel 2025 Cirò Classico ha ottenuto il riconoscimento come prima DOCG della Calabria.",
    immagine:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Vigneto_del_vino_Cir%C3%B2_-_panoramio.jpg?width=1200",
    alt: "Vigneto del vino Cirò in Calabria",
    didascalia: "Vigneto del vino Cirò · area crotonese",
    autoreFoto: "Salvatore Migliari",
    licenzaFoto: "CC BY 3.0",
    fonteFoto:
      "https://commons.wikimedia.org/wiki/File:Vigneto_del_vino_Cir%C3%B2_-_panoramio.jpg",
    fonteInfo: "https://www.arsacweb.it/i-vino-dop-doc-in-calabria/",
    etichettaFonte: "ARSAC · denominazioni vitivinicole calabresi",
  },
  {
    numero: "04",
    titolo: "Filiera cerealicola e della pasta",
    descrizione:
      "Dal campo ai laboratori: cereali, molitura, farine, pastifici e panifici. La fileja è una delle paste tradizionali calabresi; la filiera comprende sia produzioni artigianali sia trasformazioni organizzate.",
    esempi: ["Grani e farine", "Fileja", "Pasta artigianale", "Pane e prodotti da forno"],
    dettaglio:
      "Gli esempi descrivono lavorazioni e prodotti tradizionali: non sono presentati come denominazioni DOP o IGP.",
    immagine:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Fileja.jpg?width=1200",
    alt: "Fileja, pasta tradizionale della Calabria",
    didascalia: "Fileja · pasta tipica calabrese",
    autoreFoto: "Popo le Chien",
    licenzaFoto: "CC0 1.0",
    fonteFoto: "https://commons.wikimedia.org/wiki/File:Fileja.jpg",
    fonteInfo:
      "https://www.arsacweb.it/wp-content/uploads/2023/09/Opuscolo-DOP-IGP-PAT_web.pdf",
    etichettaFonte: "ARSAC e Regione Calabria · fileja tra i PAT",
  },
  {
    numero: "05",
    titolo: "Filiera zootecnica e lattiero-casearia",
    descrizione:
      "Allevamenti, produzione del latte, caseificazione e stagionatura. La filiera comprende allevatori, raccolta del latte, caseifici e trasformatori, con produzioni legate anche alle aree montane e pastorali.",
    esempi: [
      "Caciocavallo Silano DOP",
      "Pecorino Crotonese DOP",
      "Pecorino del Monte Poro DOP",
      "Caciocavallo di Ciminà · Presidio Slow Food",
    ],
    dettaglio:
      "Il Caciocavallo Silano DOP è prodotto in un areale che comprende più regioni, tra cui la Calabria: non è una denominazione esclusivamente calabrese.",
    immagine:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Caciocavallo_di_Cimin%C3%A0_%282020%29.jpg?width=1000",
    alt: "Caciocavallo di Ciminà, prodotto tradizionale calabrese",
    didascalia: "Caciocavallo di Ciminà · Presidio Slow Food",
    autoreFoto: "Marcuscalabresus",
    licenzaFoto: "CC BY-SA 4.0",
    fonteFoto:
      "https://commons.wikimedia.org/wiki/File:Caciocavallo_di_Cimin%C3%A0_(2020).jpg",
    fonteInfo: "https://www.arsacweb.it/caciocavallo-silano-dop/",
    etichettaFonte: "ARSAC · Caciocavallo Silano DOP",
  },
  {
    numero: "06",
    titolo: "Filiera delle carni e dei salumi",
    descrizione:
      "Allevamento, selezione delle carni, lavorazione, insaccatura e stagionatura. Le fasi sono regolate da disciplinari specifici per i salumi che hanno ottenuto la denominazione protetta.",
    esempi: [
      "Capocollo di Calabria DOP",
      "Pancetta di Calabria DOP",
      "Salsiccia di Calabria DOP",
      "Soppressata di Calabria DOP",
    ],
    dettaglio:
      "Le quattro denominazioni sono riportate nell’elenco ufficiale delle produzioni DOP e IGP della Calabria.",
    immagine:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Soppressata_calabrese_tagliata.jpg?width=1200",
    alt: "Soppressata calabrese tagliata",
    didascalia: "Soppressata calabrese",
    autoreFoto: "Florixc",
    licenzaFoto: "CC0 1.0",
    fonteFoto:
      "https://commons.wikimedia.org/wiki/File:Soppressata_calabrese_tagliata.jpg",
    fonteInfo: "https://www.arsacweb.it/le-produzioni-dop-e-igp-della-regione-calabria/",
    etichettaFonte: "ARSAC · salumi di Calabria DOP",
  },
  {
    numero: "07",
    titolo: "Filiera ortofrutticola",
    descrizione:
      "Ortaggi e frutta passano attraverso coltivazione, raccolta, selezione, confezionamento e, quando previsto, trasformazione. Le produzioni protette sono legate ad aree geografiche e disciplinari precisi.",
    esempi: [
      "Cipolla Rossa di Tropea Calabria IGP",
      "Patata della Sila IGP",
      "Finocchio di Isola Capo Rizzuto IGP",
      "Peperoncino di Calabria IGP",
    ],
    dettaglio:
      "La Patata della Sila è legata all’altopiano silano; il Finocchio di Isola Capo Rizzuto IGP ha una zona di produzione delimitata tra le province di Catanzaro e Crotone.",
    immagine:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Cipolle-di-tropea.jpg?width=1200",
    alt: "Cipolle rosse di Tropea",
    didascalia: "Cipolle rosse di Tropea",
    autoreFoto: "Mboesch",
    licenzaFoto: "CC BY-SA 4.0",
    fonteFoto: "https://commons.wikimedia.org/wiki/File:Cipolle-di-tropea.jpg",
    fonteInfo: "https://www.arsacweb.it/patata-della-sila-i-g-p/",
    etichettaFonte: "ARSAC · Patata della Sila IGP",
  },
  {
    numero: "08",
    titolo: "Filiera della liquirizia",
    descrizione:
      "Dalla coltivazione e raccolta delle radici alla selezione, essiccazione e trasformazione. La Liquirizia di Calabria DOP è riservata alla radice fresca, alla radice essiccata e all’estratto ottenuti dalla varietà locale detta “cordara”.",
    esempi: ["Radice fresca", "Radice essiccata", "Estratto di radice"],
    dettaglio:
      "La zona di produzione della DOP comprende numerosi comuni di tutte e cinque le province calabresi.",
    immagine:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Museo_liquirizia_Amarelli_-_Palazzo_Amarelli.jpg?width=1200",
    alt: "Museo della Liquirizia Giorgio Amarelli a Rossano",
    didascalia: "Museo della Liquirizia · Rossano",
    autoreFoto: "Museo della Liquirizia Giorgio Amarelli",
    licenzaFoto: "CC0 1.0",
    fonteFoto:
      "https://commons.wikimedia.org/wiki/File:Museo_liquirizia_Amarelli_-_Palazzo_Amarelli.jpg",
    fonteInfo: "https://www.arsacweb.it/liquirizia-di-calabria-dop/",
    etichettaFonte: "ARSAC · Liquirizia di Calabria DOP",
  },
  {
    numero: "09",
    titolo: "Filiera dei fichi e della dolciaria",
    descrizione:
      "Essiccazione, selezione e lavorazione della frutta si incontrano con le tradizioni dei laboratori dolciari. Tra le produzioni tutelate figurano i Fichi di Cosenza DOP e il Torrone di Bagnara IGP.",
    esempi: ["Fichi di Cosenza DOP", "Torrone di Bagnara IGP", "Fichi essiccati tradizionali"],
    dettaglio:
      "I Fichi di Cosenza DOP sono ottenuti dalla varietà Dottato; il Torrone di Bagnara IGP è prodotto nel territorio comunale di Bagnara Calabra.",
    immagine:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Fichi_essiccati_-_fichi_calijati_in_Calabria.jpg?width=1200",
    alt: "Fichi essiccati, fichi calijati in Calabria",
    didascalia: "Fichi essiccati · tradizione calabrese",
    autoreFoto: "Marcuscalabresus",
    licenzaFoto: "CC BY-SA 4.0",
    fonteFoto:
      "https://commons.wikimedia.org/wiki/File:Fichi_essiccati_-_fichi_calijati_in_Calabria.jpg",
    fonteInfo: "https://www.arsacweb.it/wp-content/uploads/2023/09/Opuscolo-DOP-IGP-PAT_web.pdf",
    etichettaFonte: "ARSAC · Fichi DOP e Torrone IGP",
  },
  {
    numero: "10",
    titolo: "Filiera ittica",
    descrizione:
      "La filiera del mare collega pesca costiera, sbarco, prima vendita, conservazione, lavorazione e distribuzione. Le specie e le tecniche cambiano lungo le coste tirreniche e ioniche.",
    esempi: ["Pesca costiera", "Pesce spada", "Prodotti ittici freschi", "Conservazione e trasformazione"],
    dettaglio:
      "La fotografia documenta due imbarcazioni specializzate nella pesca del pesce spada nel porto di Bagnara Calabra. Non vengono attribuite denominazioni protette o statistiche non verificate.",
    immagine:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Swordfish-Hunter.jpg?width=1200",
    alt: "Imbarcazioni per la pesca del pesce spada nel porto di Bagnara Calabra",
    didascalia: "Barche per la pesca del pesce spada · Bagnara Calabra",
    autoreFoto: "AlMare",
    licenzaFoto: "Pubblico dominio",
    fonteFoto: "https://commons.wikimedia.org/wiki/File:Swordfish-Hunter.jpg",
    fonteInfo:
      "https://www.arsacweb.it/wp-content/uploads/2023/09/Opuscolo-DOP-IGP-PAT_web.pdf",
    etichettaFonte: "Regione Calabria e ARSAC · DOP, IGP e PAT",
  },
];

export default function HomepageFiliereShowcase() {
  return (
    <section
      aria-label="Le filiere produttive della Calabria"
      className="min-h-full w-full bg-[#e5edf7] px-3 pb-6 pt-4 sm:px-4 md:px-6 md:pb-8 md:pt-5"
    >
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-5 px-1">
          <p className="section-label font-black text-blue-800">RADICI CALABRIA</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Sfoglia le filiere
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Un viaggio tra produzioni, saperi e territori: scopri come nascono le eccellenze della Calabria.
              </p>
            </div>
            <span className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-blue-900 shadow-sm">
              10 filiere da scoprire
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {FILIERE.map((filiera) => (
            <article
              key={filiera.numero}
              className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
            >
              <div className="relative h-48 overflow-hidden bg-slate-200 sm:h-52">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={filiera.immagine}
                  alt={filiera.alt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black tracking-wide text-blue-900 shadow-sm">
                  FILIERA {filiera.numero}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-4 sm:p-5">
                <h3 className="text-lg font-black leading-tight text-slate-900 sm:text-xl">
                  {filiera.titolo}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {filiera.descrizione}
                </p>

                {filiera.dettaglio && (
                  <p className="mt-3 rounded-xl border-l-4 border-yellow-400 bg-[#f7faff] px-3 py-2 text-xs leading-5 text-slate-700">
                    {filiera.dettaglio}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {filiera.esempi.map((esempio) => (
                    <span
                      key={esempio}
                      className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-900 sm:text-[11px]"
                    >
                      {esempio}
                    </span>
                  ))}
                </div>

                <div className="mt-auto pt-4">
                  <a
                    href={filiera.fonteInfo}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-black text-blue-700 transition hover:text-blue-950 hover:underline"
                  >
                    {filiera.etichettaFonte}
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </a>
                  <p className="mt-2 text-[10px] leading-4 text-slate-500">
                    Foto:{" "}
                    <a
                      href={filiera.fonteFoto}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold underline decoration-slate-300 underline-offset-2 hover:text-blue-800"
                    >
                      {filiera.autoreFoto}
                    </a>
                    {" · "}
                    {filiera.licenzaFoto}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-5 rounded-xl border border-blue-100 bg-white/80 px-4 py-3 text-xs leading-5 text-slate-600">
          Le denominazioni DOP e IGP sono riportate solo quando riconosciute ufficialmente. Le fotografie sono accompagnate dal riferimento alla fonte e alla relativa licenza; le immagini storiche o illustrative non identificano necessariamente un singolo produttore.
        </p>
      </div>
    </section>
  );
}
