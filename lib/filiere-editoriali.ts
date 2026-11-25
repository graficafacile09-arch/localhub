/**
 * Le dieci filiere agroalimentari calabresi, con il testo editoriale della
 * vetrina della homepage.
 *
 * Vive in un modulo condiviso perché lo usano sia la vetrina (`components/`,
 * client) sia l'indice della conoscenza di Pino (`lib/conoscenza/`, server): un'unica
 * fonte, nessuna descrizione duplicata o divergente.
 * Denominazioni DOP/IGP come da registri europei; nessun dato inventato.
 */

export type FilieraEditoriale = {
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

export const FILIERE_EDITORIALI: FilieraEditoriale[] = [
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

/** Slug stabile di una filiera, derivato dal nome (senza la parola iniziale "Filiera"). */
export function slugFiliera(filiera: FilieraEditoriale): string {
  return filiera.nome
    .replace(/^Filiera\s+/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getFilieraEditoriale(slug: string): FilieraEditoriale | undefined {
  return FILIERE_EDITORIALI.find((f) => slugFiliera(f) === slug);
}
