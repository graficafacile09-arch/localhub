/**
 * TERRITORI — dati editoriali della sezione Territorio.
 *
 * Demo a consultazione ristretta: le fotografie sono reali e provengono da
 * Wikimedia Commons, con autore e licenza indicati in didascalia.
 * I prodotti sono quelli del catalogo Radici Calabria (tabella `prodotti`), mai un
 * secondo catalogo: qui si conserva solo lo slug e il riconoscimento da
 * mostrare come simbolo sulla scheda.
 */

export type GruppoTerritorio = "Parchi" | "Aree territoriali" | "Comuni";

export type Riconoscimento = "DOP" | "IGP" | "STG" | "PAT" | "DE.CO.";

export type ProdottoTerritorio = {
  /** slug del prodotto nel catalogo Supabase */
  slug: string;
  /** simbolo del riconoscimento mostrato sulla scheda */
  riconoscimento: Riconoscimento | null;
};

export type Territorio = {
  slug: string;
  nome: string;
  gruppo: GruppoTerritorio;
  /** posizione nel menu, 1-based, dentro il gruppo */
  ordine: number;
  sommario: string;
  racconto: string[];
  riconoscimenti: { sigla: Riconoscimento; descrizione: string }[];
  prodotti: ProdottoTerritorio[];
  immagine: {
    src: string;
    alt: string;
    credito: string;
    /** licenza d'uso, se nota (vuota per le foto concesse dal titolare) */
    licenza: string;
    /** dove è stata presa la fotografia */
    fonte: string;
  };
};

/**
 * Loghi ufficiali dei riconoscimenti già presenti nel sito (pagina home).
 * DE.CO. non ha un logo unico nazionale: resta la sigla in chiaro.
 */
export const LOGHI_RICONOSCIMENTO: Partial<
  Record<Riconoscimento, { src: string; alt: string }>
> = {
  DOP: { src: "/loghi/dop.png", alt: "DOP — Denominazione di Origine Protetta" },
  IGP: { src: "/loghi/igp.png", alt: "IGP — Indicazione Geografica Protetta" },
  PAT: { src: "/loghi/pat.png", alt: "PAT — Prodotti Agroalimentari Tradizionali Italiani" },
};

export const GRUPPI_TERRITORI: {
  titolo: GruppoTerritorio;
  descrizione: string;
}[] = [
  {
    titolo: "Parchi",
    descrizione: "Aree protette e massicci che definiscono il paesaggio calabrese.",
  },
  {
    titolo: "Aree territoriali",
    descrizione: "Comprensori geografici e storici tra costa e pianura.",
  },
  {
    titolo: "Comuni",
    descrizione: "Centri che custodiscono produzioni e tradizioni del territorio.",
  },
];

export const TERRITORI: Territorio[] = [
  // ─────────────────────────────── PARCHI ───────────────────────────────
  {
    slug: "pollino",
    nome: "Pollino",
    gruppo: "Parchi",
    ordine: 1,
    sommario:
      "La più estesa area protetta di nuova istituzione in Italia, a cavallo tra Calabria e Basilicata.",
    racconto: [
      "Il Parco Nazionale del Pollino si estende su 192.565 ettari e comprende 56 comuni, 24 in Basilicata e 32 in Calabria, nelle province di Cosenza, Matera e Potenza. È attraversato dai massicci del Pollino, dell'Orsomarso e dal Monte Alpi e va dal Mar Tirreno allo Ionio: da Cozzo del Pellegrino a Serra Dolcedorme, dai Piani di Campolongo, Novacco e Lanzo ai Piani del Pollino, dalle gole del Lao e del Raganello ai fiumi Argentino e Abatemarco.",
      "L'Ente Parco è stato istituito con DPR del 15 novembre 1993 e ha sede a Rotonda, nel Complesso Monumentale di Santa Maria della Consolazione; la seconda sede istituzionale è a Castrovillari, a Palazzo Gallo. Il simbolo del Parco è il pino loricato, specie relicta che cresce sulle rupi d'alta quota. Dal 2015 il territorio è Geoparco Mondiale UNESCO.",
      "Sul versante calabrese il paesaggio unisce faggete, castagneti, querceti e pascoli; l'economia tradizionale è legata a pastorizia, castanicoltura, olivicoltura e raccolta di erbe officinali. Le gole del Raganello e i piani di Campotenese sono tra i riferimenti più noti per la visita.",
    ],
    riconoscimenti: [
      {
        sigla: "PAT",
        descrizione:
          "Pecorino del Pollino e Cacioricotta del Pollino sono specialità tradizionali del comprensorio iscritte all'elenco regionale.",
      },
    ],
    prodotti: [
      { slug: "cacioricotta-pollino", riconoscimento: "PAT" },
      { slug: "pecorino-pollino-pat", riconoscimento: "PAT" },
      { slug: "olio-evo-pollino", riconoscimento: null },
      { slug: "miele-castagno-pollino", riconoscimento: null },
    ],
    immagine: {
      src: "/territorio/pollino.jpg",
      alt: "Escursionisti tra i prati fioriti ai piedi del massiccio del Pollino",
      credito: "Archivio Radici Calabria",
      licenza: "",
      fonte: "Radici Calabria",
    },
  },
  {
    slug: "sila",
    nome: "Sila",
    gruppo: "Parchi",
    ordine: 2,
    sommario:
      "L'altopiano boscoso al centro della Calabria, tra Sila Grande, Sila Greca e Sila Piccola.",
    racconto: [
      "Il Parco Nazionale della Sila è stato istituito con la legge 344/1997 e l'Ente con DPR del 14 novembre 2002, raccogliendo l'eredità del Parco Nazionale della Calabria del 1968. Si estende su 73.695 ettari in 19 comuni delle province di Cosenza, Catanzaro e Crotone, sul più grande altopiano d'Europa, articolato in Sila Grande, Sila Greca e Sila Piccola.",
      "I boschi coprono l'81% della superficie del Parco: il pino laricio interessa il 43% delle aree boscate e il faggio il 35%. Le cime principali sono il Monte Botte Donato (1.928 m) in Sila Grande e il Monte Gariglione (1.764 m) in Sila Piccola. La Riserva della Biosfera Sila è riconosciuta dal programma UNESCO Man and Biosphere.",
      "L'altopiano è segnato da laghi, antichi mulini, abbazie e santuari; la pastorizia e la lavorazione del latte hanno costruito nei secoli un paesaggio di pascoli e caseifici. La patata della Sila è la produzione più identificativa, accanto ai formaggi e ai salumi della tradizione silana.",
    ],
    riconoscimenti: [
      {
        sigla: "DOP",
        descrizione:
          "Il Caciocavallo Silano DOP è prodotto in un comprensorio che comprende la Sila e altri territori calabresi.",
      },
      {
        sigla: "IGP",
        descrizione: "La Patata della Sila è tutelata come Indicazione Geografica Protetta.",
      },
    ],
    prodotti: [
      { slug: "caciocavallo-silano-dop", riconoscimento: "DOP" },
      { slug: "funghi-porcini-del-pollino", riconoscimento: "IGP" },
      { slug: "miele-millefiori-500g", riconoscimento: null },
      { slug: "biscotti-calabresi-tradizionali-500g", riconoscimento: null },
    ],
    immagine: {
      src: "/territorio/sila.jpg",
      alt: "Torrente tra i faggi nel bosco autunnale della Sila",
      credito: "Archivio Radici Calabria",
      licenza: "",
      fonte: "Radici Calabria",
    },
  },

  {
    slug: "aspromonte",
    nome: "Aspromonte",
    gruppo: "Parchi",
    ordine: 3,
    sommario:
      "Il massiccio granitico che chiude la Calabria, tra Mar Ionio, Mar Tirreno e Stretto di Messina.",
    racconto: [
      "Il Parco Nazionale dell'Aspromonte è stato istituito con la legge 305/1989 e il suo Ente con DPR del 14 gennaio 1994; si estende su 64.544 ettari nella provincia di Reggio Calabria e interessa 37 comuni. Il massiccio appartiene all'Arco Calabro-Peloritano, un settore geologico distinto dall'Appennino circostante, e sale rapidamente dalle coste fino a Montalto, la cima più alta con i suoi 1.955 metri.",
      "Il paesaggio alterna faggete, abetine, pinete, lecci e macchia mediterranea, con una biodiversità tra le più articolate d'Europa. Il Parco ospita specie come il lupo, l'aquila reale, il gufo reale e l'astore. Dal 21 aprile 2021 l'intero territorio del Parco è riconosciuto come Aspromonte UNESCO Global Geopark.",
      "L'identità del massiccio nasce dall'incontro tra la montagna e il mare: i borghi grecanici e arbëreshë conservano lingua e riti, mentre l'artigianato e la cucina raccontano un'economia di pascolo, castagneto e olivicoltura. Nell'area di Reggio Calabria matura il bergamotto, agrume di cui l'Italia è di fatto l'unico produttore mondiale.",
    ],
    riconoscimenti: [
      {
        sigla: "DOP",
        descrizione:
          "Il Bergamotto di Reggio Calabria - Olio essenziale DOP ha zona di produzione provinciale.",
      },
      {
        sigla: "PAT",
        descrizione:
          "Il Torrone mielato di Bagnara Calabra è iscritto tra i Prodotti Agroalimentari Tradizionali della Calabria.",
      },
    ],
    prodotti: [
      { slug: "dop-bergamotto-olio-essenziale", riconoscimento: "DOP" },
      { slug: "miele-al-bergamotto-250g", riconoscimento: null },
      { slug: "marmellata-di-bergamotto-200g", riconoscimento: null },
      { slug: "torrone-mielato-bagnara-500g", riconoscimento: "PAT" },
    ],
    immagine: {
      src: "/territorio/aspromonte.jpg",
      alt: "Paesaggio dell'Aspromonte lungo la strada di Pentedattilo, nel comune di Melito di Porto Salvo",
      credito: "Benjamin Smith",
      licenza: "CC BY-SA 4.0",
      fonte: "Wikimedia Commons",
    },
  },

  // ────────────────────────── AREE TERRITORIALI ──────────────────────────
  {
    slug: "costa-degli-dei",
    nome: "Costa degli Dei",
    gruppo: "Aree territoriali",
    ordine: 1,
    sommario:
      "Il tratto tirrenico da Pizzo a Nicotera, con Tropea e il promontorio granitico di Capo Vaticano.",
    racconto: [
      "La Costa degli Dei è il tratto di litorale tirrenico calabrese che va da Pizzo Calabro a Nicotera, per circa 55 chilometri, attraversando i comuni di Vibo Valentia, Briatico, Zambrone, Parghelia, Tropea, Ricadi, Joppolo e Nicotera. Il nome rimanda a una leggenda legata all'antica Hipponion, secondo cui gli dei avrebbero scelto questa costa per la sua bellezza.",
      "Il paesaggio alterna spiagge di sabbia chiara, falesie a picco sul mare e calette raggiungibili solo via mare; a Capo Vaticano, nel comune di Ricadi, affiora il granito rosa lavorato dal vento e dal mare. A Tropea il Santuario di Santa Maria dell'Isola sorge su un promontorio quasi interamente circondato dall'acqua.",
      "L'entroterra è agricolo e terrazzato: la cipolla rossa di Tropea è la coltura più riconoscibile del comprensorio, accanto a oliveti e agrumeti. La cucina costiera unisce pesce, conserve vegetali e i salumi piccanti dell'entroterra vibonese, come la 'nduja di Spilinga.",
    ],
    riconoscimenti: [
      {
        sigla: "IGP",
        descrizione:
          "La Cipolla Rossa di Tropea Calabria è tutelata come Indicazione Geografica Protetta.",
      },
      {
        sigla: "DOP",
        descrizione: "Il Pecorino del Monte Poro DOP nasce nell'entroterra collinare vibonese.",
      },
      {
        sigla: "PAT",
        descrizione:
          "La 'Nduja di Spilinga è una specialità tradizionale iscritta all'elenco regionale.",
      },
    ],
    prodotti: [
      { slug: "fileja-di-tropea-500g", riconoscimento: null },
      { slug: "nduja-di-spilinga-350g", riconoscimento: "PAT" },
      { slug: "pecorino-monte-poro-12kg", riconoscimento: "DOP" },
      { slug: "liquore-di-finocchietto-selvatico", riconoscimento: null },
    ],
    immagine: {
      src: "/territorio/costa-degli-dei.jpg",
      alt: "Spiaggia di Tropea vista dall'alto con il borgo sulla falesia",
      credito: "",
      licenza: "",
      fonte: "",
    },
  },
  {
    slug: "piana-di-crotone",
    nome: "Piana di Crotone",
    gruppo: "Aree territoriali",
    ordine: 2,
    sommario:
      "La pianura ionica di Kroton e del Marchesato, tra le foci del Neto e del Tacina.",
    racconto: [
      "La piana di Crotone si apre sul Mar Ionio, alla foce dell'Esaro, ed è delimitata dalle colline argillose del Marchesato e dalle pendici orientali della Sila. Il nome Marchesato deriva dal titolo dei Ruffo di Calabria, che fino al Quattrocento tennero come feudo la città e il suo territorio.",
      "Kroton fu fondata alla fine dell'VIII secolo a.C. da coloni achei; nel V secolo raggiunse il massimo splendore e divenne uno dei centri più importanti della Magna Grecia. L'entroterra collinare, un tempo chiamato «granaio della Calabria» per la vocazione cerealicola, è oggi segnato dai calanchi, forme di erosione nelle argille plioceniche.",
      "L'agricoltura della piana unisce cereali, ortaggi, uliveti e vigneti; la pastorizia dell'entroterra sostiene la produzione casearia, mentre sul promontorio di Capo Colonna restano le tracce del santuario dedicato a Hera Lacinia.",
    ],
    riconoscimenti: [
      {
        sigla: "DOP",
        descrizione:
          "Pecorino Crotonese e Olio EVO Alto Crotonese sono denominazioni del comprensorio crotonese.",
      },
      {
        sigla: "IGP",
        descrizione: "Il Finocchio di Isola Capo Rizzuto è tutelato come IGP.",
      },
    ],
    prodotti: [
      { slug: "dop-pecorino-crotonese", riconoscimento: "DOP" },
      { slug: "dop-olio-alto-crotonese", riconoscimento: "DOP" },
      { slug: "igp-finocchio-isola-capo-rizzuto", riconoscimento: "IGP" },
      { slug: "igp-olio-calabria", riconoscimento: "IGP" },
    ],
    immagine: {
      src: "/territorio/piana-di-crotone.jpg",
      alt: "Campagna della Piana di Crotone tra uliveti e colline",
      credito: "Radici Calabria",
      licenza: "",
      fonte: "immagine fornita per la demo",
    },
  },
  {
    slug: "piana-di-sibari",
    nome: "Piana di Sibari",
    gruppo: "Aree territoriali",
    ordine: 3,
    sommario:
      "La pianura alluvionale del Crati e del Coscile, dove sorsero Sibari, Thurii e Copia.",
    racconto: [
      "La Piana di Sibari è la vasta pianura alluvionale della costa ionica cosentina, solcata dai fiumi Crati e Coscile (l'antico Sybaris) e circondata dal Pollino e dalle ultime propaggini della Sila Greca. Qui, nel 720 a.C., i coloni achei fondarono Sibari, una delle città più potenti della Magna Grecia.",
      "Sibari fu distrutta nel 510 a.C. dai crotonesi; nel 444-443 a.C. sullo stesso sito nacque la colonia panellenica di Thurii e nel 193 a.C. la colonia latina di Copia. L'area archeologica di Sybaris-Thurii-Copiae conserva questa stratificazione di oltre dieci secoli ed è oggi Parco Archeologico della Sibaritide, con il Museo Archeologico Nazionale.",
      "La bonifica novecentesca ha trasformato la pianura paludosa in terreno agricolo: riso, agrumi, ortaggi e cereali sono le colture prevalenti, in un paesaggio di campi regolari delimitati da canali.",
    ],
    riconoscimenti: [
      {
        sigla: "IGP",
        descrizione:
          "Le Clementine di Calabria e il Limone di Rocca Imperiale sono tutelati come IGP.",
      },
    ],
    prodotti: [
      { slug: "riso-carnaroli-della-piana-di-sibari", riconoscimento: null },
      { slug: "riso-artigianale-gange-di-sibari-1-kg-magisa", riconoscimento: null },
      { slug: "igp-clementine-calabria", riconoscimento: "IGP" },
      { slug: "igp-limone-rocca-imperiale", riconoscimento: "IGP" },
    ],
    immagine: {
      src: "/territorio/piana-di-sibari.jpg",
      alt: "La Piana di Sibari con gli agrumeti e il mare sullo sfondo",
      credito: "Favella",
      licenza: "",
      fonte: "favella.it",
    },
  },

  // ─────────────────────────────── COMUNI ───────────────────────────────
  {
    slug: "castrovillari",
    nome: "Castrovillari",
    gruppo: "Comuni",
    ordine: 1,
    sommario:
      "La porta calabrese del Pollino, tra la Civita, il Castello Aragonese e la piana del Coscile.",
    racconto: [
      "Castrovillari sorge a 362 metri di altitudine, su uno sperone roccioso che domina la piana del Coscile e guarda il massiccio del Pollino. Il nome deriva probabilmente dal latino medievale castrum villarum, «fortezza delle ville»; le prime tracce di insediamento risalgono al Paleolitico inferiore.",
      "La città fu dominata da Normanni, Svevi, Angioini e Aragonesi e fino al 1806 appartenne al Conte di Cariati. Il centro storico, la Civita, conserva il Castello Aragonese, la Chiesa di Santa Maria del Castello con le grotte eremitiche, la Chiesa di San Giuliano (1264) e il Protoconvento Francescano (1220), oggi sede del Museo Archeologico.",
      "L'agricoltura della conca è legata alla cipolla bianca, coltura identificativa del territorio, e alla tradizione ortofrutticola della piana. Il Carnevale di Castrovillari è l'evento pubblico più noto della città.",
    ],
    riconoscimenti: [
      {
        sigla: "PAT",
        descrizione:
          "La Ciotaredda di Castrovillari è iscritta all'elenco dei Prodotti Agroalimentari Tradizionali.",
      },
      {
        sigla: "DE.CO.",
        descrizione:
          "La Cipolla Bianca di Castrovillari è tutelata da una Denominazione Comunale di Origine.",
      },
    ],
    prodotti: [
      { slug: "ciotaredda-castrovillari", riconoscimento: "PAT" },
      { slug: "cipolla-bianca-castrovillari", riconoscimento: "DE.CO." },
      { slug: "dolcezza-cipolla-bianca", riconoscimento: "DE.CO." },
      { slug: "filetti-cipolla-bianca", riconoscimento: "DE.CO." },
    ],
    immagine: {
      src: "/territorio/castrovillari.jpg",
      alt: "Vigneto con grappoli d'uva nera in primo piano tra i filari",
      credito: "Archivio Radici Calabria",
      licenza: "",
      fonte: "Radici Calabria",
    },
  },
  {
    slug: "morano-calabro",
    nome: "Morano Calabro",
    gruppo: "Comuni",
    ordine: 2,
    sommario:
      "Il borgo a gradoni sotto il Pollino, citato come Muranum sulla lapide di Polla.",
    racconto: [
      "Morano Calabro sorge a 694 metri di altitudine su un colle conico ai piedi del massiccio del Pollino, con le case disposte a gradoni che compongono uno dei profili più riconoscibili della Calabria. Il toponimo Muranum compare per la prima volta su una pietra miliare del II secolo a.C.; l'aggettivo «Calabro» fu aggiunto nel 1863 per distinguerlo da Morano sul Po.",
      "Il borgo fu feudo dei Morano, dei Fasanella e di Antonello Fuscaldo, passò agli Aragonesi ai Sanseverino di Bisignano e nel 1614 agli Spinelli di Scalea, che lo tennero fino all'eversione della feudalità nel 1806. Conserva il castello di età normanna, la Collegiata dei Santi Pietro e Paolo, la chiesa di San Bernardino e i ruderi del Convento di Colloreto.",
      "L'economia tradizionale è agro-pastorale: orti, oliveti e allevamento sostengono le produzioni casearie e le conserve della tradizione. Il borgo fa parte de I Borghi più belli d'Italia.",
    ],
    riconoscimenti: [
      {
        sigla: "PAT",
        descrizione:
          "La Felciata di Morano e la Pitta 'mpigliata sono specialità iscritte all'elenco regionale.",
      },
    ],
    prodotti: [
      { slug: "felciata-di-morano-pat", riconoscimento: "PAT" },
      { slug: "caprino-di-morano", riconoscimento: null },
      { slug: "pitta-mpigliata-pollino", riconoscimento: "PAT" },
      { slug: "soppressata-del-pollino", riconoscimento: null },
    ],
    immagine: {
      src: "/territorio/morano-calabro.jpg",
      alt: "Panorama di Morano Calabro ai piedi del Pollino",
      credito: "Marcus 1756",
      licenza: "CC BY-SA 3.0",
      fonte: "Wikimedia Commons",
    },
  },
  {
    slug: "mormanno",
    nome: "Mormanno",
    gruppo: "Comuni",
    ordine: 3,
    sommario:
      "Il borgo d'alta quota del Pollino, con Santa Maria del Colle e il faro votivo di montagna.",
    racconto: [
      "Mormanno sorge a 840 metri di altitudine, ai confini con la Basilicata, alle pendici del Monte Cerviero e sulla valle del Mercure. Il nome originario Miromagnum rimanda all'idea di «grande vista»: dal borgo lo sguardo abbraccia la catena del Pollino e il paesaggio montano circostante.",
      "Il centro storico si articola sui colli Costa, San Michele, Torretta e San Rocco, con vicoli in pietra e portali scolpiti. Il cuore religioso è la Cattedrale di Santa Maria del Colle, eretta nel 1183 e ampliata fino all'impianto settecentesco a tre navate; poco fuori dall'abitato si trova il Faro Votivo dedicato ai caduti della Prima guerra mondiale.",
      "L'economia storica è legata alla pastorizia e ai legumi: lenticchie e «poverelli bianchi» sono le produzioni più citate, accanto ai bocconotti, dolce simbolo della gastronomia locale. Il territorio comunale è interamente compreso nel Parco Nazionale del Pollino.",
    ],
    riconoscimenti: [
      {
        sigla: "PAT",
        descrizione:
          "Il Bocconotto di Mormanno e il Pecorino del Pollino sono iscritti all'elenco regionale.",
      },
    ],
    prodotti: [
      { slug: "bocconotto-di-mormanno", riconoscimento: "PAT" },
      { slug: "lenticchia-di-mormanno", riconoscimento: null },
      { slug: "pecorino-pollino-pat", riconoscimento: "PAT" },
      { slug: "miele-di-sulla-pollino", riconoscimento: null },
    ],
    immagine: {
      src: "/territorio/mormanno.jpg",
      alt: "Lago con riva erbosa e staccionata in legno nel territorio di Mormanno",
      credito: "Archivio Radici Calabria",
      licenza: "",
      fonte: "Radici Calabria",
    },
  },
  {
    slug: "rotonda",
    nome: "Rotonda",
    gruppo: "Comuni",
    ordine: 4,
    sommario:
      "Il comune lucano ai piedi del Pollino, sede dell'Ente Parco e dei fagioli bianchi DOP.",
    racconto: [
      "Rotonda sorge a 580 metri di altitudine in provincia di Potenza, ai confini con la Calabria, e rientra nel Parco Nazionale del Pollino. Il Santuario di Santa Maria della Consolazione, iniziato nel 1558 e terminato nel 1574, sorge a circa un chilometro dal paese; le ali laterali ospitano la sede amministrativa dell'Ente Parco.",
      "Il territorio comunale è compreso nella Valle del Mercure, il corridoio che collega il Pollino alla Basilicata. L'agricoltura è storicamente legata ai legumi e agli ortaggi, in un paesaggio di campi e pascoli ai piedi dei rilievi.",
      "Due produzioni orticole del comune hanno ottenuto la Denominazione di Origine Protetta europea: i Fagioli Bianchi di Rotonda DOP, dagli ecotipi Fagiolo Bianco e Tondino (Poverello Bianco), e la Melanzana Rossa di Rotonda DOP.",
    ],
    riconoscimenti: [
      {
        sigla: "DOP",
        descrizione:
          "Fagioli Bianchi di Rotonda DOP — Reg. UE n. 240 dell'11.03.2011. Zona di produzione: Rotonda, Viggianello, Castelluccio Superiore e Castelluccio Inferiore.",
      },
      {
        sigla: "DOP",
        descrizione:
          "Melanzana Rossa di Rotonda DOP — Reg. UE n. 624 del 15.07.2010, provincia di Potenza.",
      },
      {
        sigla: "IGP",
        descrizione:
          "Peperone di Senise e Crusco di Senise sono IGP della vicina area lucana del Pollino.",
      },
    ],
    prodotti: [
      { slug: "fagioli-bianchi-rotonda-dop", riconoscimento: "DOP" },
      { slug: "melanzana-rossa-rotonda-dop", riconoscimento: "DOP" },
      { slug: "peperone-di-senise-igp-fresco", riconoscimento: "IGP" },
      { slug: "crusco-di-senise-in-polvere", riconoscimento: "IGP" },
    ],
    immagine: {
      src: "/territorio/rotonda.jpg",
      alt: "Veduta di Rotonda ai piedi del Pollino",
      credito: "Raimondi Luca",
      licenza: "CC BY-SA 3.0",
      fonte: "Wikimedia Commons",
    },
  },
];

/**
 * Riconoscimento per slug di prodotto: l'unica fonte è l'elenco esplicito
 * scritto nei territori qui sopra. Nessuna inferenza dal nome o dalla
 * categoria: un prodotto senza riconoscimento dichiarato resta senza marchio.
 */
const RICONOSCIMENTO_PER_SLUG: Record<string, Riconoscimento> = Object.fromEntries(
  TERRITORI.flatMap((territorio) => territorio.prodotti)
    .filter(
      (prodotto): prodotto is { slug: string; riconoscimento: Riconoscimento } =>
        Boolean(prodotto.riconoscimento)
    )
    .map((prodotto) => [prodotto.slug, prodotto.riconoscimento])
);

export function riconoscimentoProdotto(
  slug: string | null | undefined
): Riconoscimento | null {
  if (!slug) return null;
  return RICONOSCIMENTO_PER_SLUG[slug] ?? null;
}

export function getTerritorio(slug: string): Territorio | undefined {
  return TERRITORI.find((t) => t.slug === slug);
}

export function territoriPerGruppo(gruppo: GruppoTerritorio): Territorio[] {
  return TERRITORI.filter((t) => t.gruppo === gruppo).sort((a, b) => a.ordine - b.ordine);
}

/**
 * ORDINE UNICO DI PRESENTAZIONE — condiviso da homepage e sezione /territorio.
 * I gruppi vanno nell'ordine Parchi → Aree territoriali → Comuni e, dentro
 * ogni gruppo, i territori in ordine alfabetico. Un'unica fonte evita che le
 * due viste mostrino nomi o sequenze diverse.
 */
export const ORDINE_GRUPPI: GruppoTerritorio[] = ["Parchi", "Aree territoriali", "Comuni"];

export function territoriDelGruppo(gruppo: GruppoTerritorio): Territorio[] {
  return TERRITORI.filter((t) => t.gruppo === gruppo).sort((a, b) =>
    a.nome.localeCompare(b.nome, "it")
  );
}

export const TERRITORI_ORDINATI: Territorio[] = ORDINE_GRUPPI.flatMap((gruppo) =>
  territoriDelGruppo(gruppo)
);

export const SLUG_TERRITORI = TERRITORI.map((t) => t.slug);
