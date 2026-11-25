/**
 * CALENDARIO DI STAGIONALITÀ — fonte unica dei dati.
 *
 * Tutti i contenuti (periodi, categorie, produzioni, zone, fonti) vivono qui:
 * il widget in header e la pagina /stagionalita leggono solo da questo file.
 * Per aggiornare un periodo basta cambiare l'array `mesi` della voce: non si
 * tocca né il componente grafico né la pagina.
 *
 * Regole di compilazione:
 * - `mesi` descrive SOLO l'attività indicata in `sintesi` (raccolta,
 *   lavorazione, stagionatura…), non la disponibilità commerciale;
 * - se il periodo cambia con la zona o la cultivar, va scritto in `nota`;
 * - ogni voce cita almeno una fonte reale in `fonti` (vedi `FONTI`).
 */

export type Mese = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const NOMI_MESI = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
] as const;

export const ABBREVIAZIONI_MESI = [
  "Gen",
  "Feb",
  "Mar",
  "Apr",
  "Mag",
  "Giu",
  "Lug",
  "Ago",
  "Set",
  "Ott",
  "Nov",
  "Dic",
] as const;

const TUTTI_I_MESI: Mese[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/* ─────────────────────────────── Fonti ─────────────────────────────── */

export const FONTI = {
  "arsac-bollettini": {
    titolo: "ARSAC – Bollettini agrometeorologici e fitosanitari (agrumi, olivo, vite, kiwi)",
    breve: "ARSAC · bollettini",
    url: "https://www.arsacweb.it/bollettino-agrometeorologico-e-fitosanitario-agrumi-olivo-vite-e-kiwi",
    nota: "Fasi fenologiche di olivo, vite e agrumi nelle 8 zone climatiche in cui ARSAC divide la Calabria.",
  },
  "arsac-clementina": {
    titolo: "ARSAC – Clementina di Calabria IGP",
    breve: "ARSAC · clementina IGP",
    url: "https://www.arsacweb.it/clementina-di-calabria-igp",
    nota: "Scheda tecnica della denominazione, zona di produzione e conservazione.",
  },
  "consorzio-clementine": {
    titolo: "Consorzio Clementine di Calabria IGP",
    breve: "Consorzio Clementine IGP",
    url: "https://clementinedicalabriaigp.it/",
    nota: "Raccolta dichiarata dal Consorzio: da ottobre a febbraio.",
  },
  "arsac-pat": {
    titolo: "ARSAC – Prodotti agroalimentari tradizionali della Calabria (270 PAT)",
    breve: "ARSAC · elenco PAT",
    url: "https://www.arsacweb.it/prodotti-agroalimentari-tradizionali-regione-calabria",
    nota: "Elenco regionale dei prodotti tradizionali e relativi disciplinari di lavorazione.",
  },
  "arsac-salumi": {
    titolo: "ARSAC – Salumi di Calabria DOP",
    breve: "ARSAC · salumi DOP",
    url: "https://www.arsacweb.it/salumi-di-calabria-dop",
    nota: "Capocollo, pancetta, soppressata e salsiccia DOP: tagli, lavorazione e stagionatura.",
  },
  "masaf-soppressata": {
    titolo: "MASAF – Soppressata di Calabria DOP",
    breve: "MASAF · soppressata DOP",
    url: "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/20241",
    nota: "Stagionatura minima di 45 giorni secondo il disciplinare.",
  },
  "arsac-pecorino": {
    titolo: "ARSAC – Pecorino Crotonese DOP",
    breve: "ARSAC · pecorino DOP",
    url: "https://www.arsacweb.it/pecorino-crotonese-dop",
    nota: "Zona di produzione e tre tipologie: fresco, semiduro, stagionato.",
  },
  "masaf-pecorino": {
    titolo: "MASAF – Disciplinare Pecorino Crotonese DOP",
    breve: "MASAF · disciplinare pecorino",
    url: "https://www.masaf.gov.it/flex/files/6/e/3/D.f3f3cdf909565f9dd263/Disciplinare_Pecorino_Crotonese_25.10.2013.pdf",
    nota: "Stagionatura: 60–90 giorni per il semiduro, oltre 90 giorni per lo stagionato.",
  },
  "arsac-caciocavallo": {
    titolo: "ARSAC – Caciocavallo Silano DOP",
    breve: "ARSAC · caciocavallo DOP",
    url: "https://www.arsacweb.it/caciocavallo-silano-dop",
    nota: "Produzione, salatura, asciugatura e stagionatura da 3 mesi a un anno.",
  },
  "masaf-caciocavallo": {
    titolo: "MASAF – Disciplinare Caciocavallo Silano DOP",
    breve: "MASAF · disciplinare caciocavallo",
    url: "https://www.masaf.gov.it/flex/files/1/2/7/D.f9912062703bc9664534/gennaio2024Disciplinare_Caciocavallo_Silano.pdf",
    nota: "Stagionatura minima 30 giorni; «Extra» da 4 mesi, «Gran Riserva» da 9 mesi.",
  },
  "slowfood-cipolla-castrovillari": {
    titolo: "Fondazione Slow Food – Cipolla bianca di Castrovillari (Presidio)",
    breve: "Slow Food · cipolla bianca",
    url: "https://www.fondazioneslowfood.com/it/presidi-slow-food/cipolla-bianca-di-castrovillari/",
    nota: "Scheda del Presidio: ecotipo locale del Pollino, bulbo dolce e a basso contenuto di acido piruvico.",
  },
  "arsac-deco-cipolla": {
    titolo: "ARSAC – La Cipolla Bianca di Castrovillari conquista la De.Co.",
    breve: "ARSAC · cipolla De.Co.",
    url: "https://www.arsacweb.it/la-cipolla-bianca-di-castrovillari-conquista-la-denominazione-comunale-de-co",
    nota: "Denominazione Comunale (De.Co.) e disciplinare di produzione predisposto con ARSAC.",
  },
  "disciplinare-tropea": {
    titolo: "MIPAAF – Disciplinare Cipolla Rossa di Tropea Calabria IGP",
    breve: "Disciplinare cipolla IGP",
    url: "http://www.gazzettaufficiale.biz/atti/2013/20130087/13A03006.htm",
    nota: "Ecotipi, semina, trapianto e raccolta per Tondo Piatta, Mezza Campana e Allungata.",
  },
  "qualigeo-tropea": {
    titolo: "Qualigeo – Cipolla Rossa di Tropea Calabria IGP",
    breve: "Qualigeo · cipolla IGP",
    url: "https://www.qualigeo.eu/prodotto-qualigeo/cipolla-rossa-di-tropea-calabria-igp",
    nota: "Calendario di raccolta per ecotipo e zona di produzione.",
  },
  "ufarmer-olive": {
    titolo: "UFarmer – Quando si raccolgono le olive: periodo, regioni e segnali",
    breve: "UFarmer · raccolta olive",
    url: "https://www.ufarmer.it/2026/11/04/quando-raccolta-olive",
    nota: "Invaiatura tra metà ottobre e metà dicembre; raccolta da fine settembre a gennaio.",
  },
  "nduja-stagionatura": {
    titolo: "la Repubblica – La 'nduja di Spilinga",
    breve: "Repubblica · 'nduja",
    url: "https://www.repubblica.it/sapori/2017/10/25/news/nduja_simbolo_gastronomia_calabrese_varca_confini_internaziobali-178714725",
    nota: "Stagionatura di 45–90 giorni e lavorazione artigianale a Spilinga.",
  },
} as const;

export type FonteId = keyof typeof FONTI;

/* ───────────────────────────── Categorie ───────────────────────────── */

export type CategoriaId =
  | "coltivazioni"
  | "olivicoltura"
  | "latticini"
  | "salumi"
  | "viticoltura"
  | "apicoltura"
  | "bosco"
  | "trasformazioni";

export type Categoria = {
  id: CategoriaId;
  titolo: string;
  descrizione: string;
};

export const CATEGORIE: Categoria[] = [
  {
    id: "coltivazioni",
    titolo: "Coltivazioni e ortaggi",
    descrizione: "Ortaggi e verdure, frutta e agrumi, legumi e cereali, peperoncino e colture tipiche.",
  },
  {
    id: "olivicoltura",
    titolo: "Olivicoltura",
    descrizione: "Raccolta delle olive, molitura e produzione dell'olio.",
  },
  {
    id: "latticini",
    titolo: "Formaggi e latticini",
    descrizione: "Produzione del latte, lavorazioni casearie, produzioni tradizionali e stagionature.",
  },
  {
    id: "salumi",
    titolo: "Carni e salumi",
    descrizione: "Preparazione delle carni, salatura, stagionatura e maturazione.",
  },
  {
    id: "viticoltura",
    titolo: "Viticoltura",
    descrizione: "Ciclo della vite, vendemmia, vinificazione e lavorazioni successive.",
  },
  {
    id: "apicoltura",
    titolo: "Apicoltura",
    descrizione: "Fioriture, raccolta del miele e produzioni tradizionali.",
  },
  {
    id: "bosco",
    titolo: "Prodotti del bosco",
    descrizione: "Castagne, funghi, frutta secca e altri prodotti stagionali del territorio.",
  },
  {
    id: "trasformazioni",
    titolo: "Trasformazioni alimentari",
    descrizione: "Conserve, essiccazione, sott'oli e altre lavorazioni agroalimentari.",
  },
];

/* ─────────────────────────────── Voci ─────────────────────────────── */

export type Fase = {
  etichetta: string;
  mesi: Mese[];
};

export type Voce = {
  id: string;
  nome: string;
  categoria: CategoriaId;
  /** Attività mostrata nella finestra del widget (breve, senza descrizioni). */
  sintesi: string;
  /** Mesi dell'attività indicata in `sintesi`. */
  mesi: Mese[];
  zone?: string;
  /** Differenze territoriali, di cultivar o precisazioni sul periodo. */
  nota?: string;
  /** Fasi distinte (coltivazione, raccolta, produzione, stagionatura). */
  fasi?: Fase[];
  fonti: FonteId[];
};

export const VOCI: Voce[] = [
  /* Coltivazioni e ortaggi */
  {
    id: "clementine",
    nome: "Clementine di Calabria IGP",
    categoria: "coltivazioni",
    sintesi: "raccolta dei frutti",
    mesi: [10, 11, 12, 1, 2],
    zone: "Piana di Sibari, Lamezia, Gioia Tauro-Rosarno, Locride",
    nota: "Il Consorzio indica la raccolta da ottobre a febbraio; il picco cade tra novembre e gennaio.",
    fasi: [
      { etichetta: "Raccolta", mesi: [10, 11, 12, 1, 2] },
      { etichetta: "Conservazione in cella refrigerata (4–6 °C)", mesi: [11, 12, 1, 2, 3] },
    ],
    fonti: ["consorzio-clementine", "arsac-clementina"],
  },
  {
    id: "arance",
    nome: "Arance (Navelina e Vaniglia)",
    categoria: "coltivazioni",
    sintesi: "raccolta",
    mesi: [11, 12, 1, 2, 3, 4],
    zone: "Piana di Sibari, Piana di Lamezia, Gioia Tauro, Locride",
    nota: "Navelina da novembre a marzo, Vaniglia da dicembre ad aprile: le date dipendono da varietà e annata.",
    fasi: [
      { etichetta: "Raccolta Navelina", mesi: [11, 12, 1, 2, 3] },
      { etichetta: "Raccolta Vaniglia", mesi: [12, 1, 2, 3, 4] },
    ],
    fonti: ["arsac-bollettini"],
  },
  {
    id: "cipolla-tropea",
    nome: "Cipolla Rossa di Tropea Calabria IGP",
    categoria: "coltivazioni",
    sintesi: "raccolta degli ecotipi primaticcio, medio e tardivo",
    mesi: [4, 5, 6, 7],
    zone: "costa tirrenica tra le province di Cosenza, Catanzaro e Vibo Valentia",
    nota: "La raccolta segue l'ecotipo: Tondo Piatta da metà aprile a fine maggio, Mezza Campana da metà maggio a metà giugno, Allungata da metà giugno a fine luglio.",
    fasi: [
      { etichetta: "Trapianto", mesi: [10, 11, 12, 1, 2, 3] },
      { etichetta: "Raccolta Tondo Piatta", mesi: [4, 5] },
      { etichetta: "Raccolta Mezza Campana", mesi: [5, 6] },
      { etichetta: "Raccolta Allungata", mesi: [6, 7] },
      { etichetta: "Essiccazione e conservazione", mesi: [7, 8, 9] },
    ],
    fonti: ["disciplinare-tropea", "qualigeo-tropea"],
  },
  {
    id: "cipolla-bianca-castrovillari",
    nome: "Cipolla Bianca di Castrovillari D.E.C.O.",
    categoria: "coltivazioni",
    sintesi: "raccolta del cipollotto fresco e del bulbo maturo",
    mesi: [2, 3, 4, 5, 6, 7],
    zone: "contrada Jardìni e valle del Coscile, Castrovillari",
    nota: "Ecotipo locale coltivato nella valle del Coscile e in contrada Jardìni. Bulbo bianco con leggere striature rosate, dolce e digeribile per il basso contenuto di acido piruvico; ottimo a crudo, nel panicòttu, in zuppe e frittate. Cipollotto fresco da febbraio a maggio, bulbo maturo da giugno a luglio.",
    fasi: [
      { etichetta: "Raccolta cipollotto fresco", mesi: [2, 3, 4, 5] },
      { etichetta: "Raccolta bulbo maturo", mesi: [6, 7] },
    ],
    fonti: ["slowfood-cipolla-castrovillari", "arsac-deco-cipolla"],
  },
  {
    id: "peperoncino",
    nome: "Peperoncino",
    categoria: "coltivazioni",
    sintesi: "raccolta e avvio dell'essiccazione",
    mesi: [8, 9, 10],
    zone: "Poro, Piana di Sibari, aree collinari e costiere",
    nota: "Epoca e durata variano con la varietà, la quota e l'andamento stagionale: la raccolta si concentra tra fine estate e autunno.",
    fasi: [
      { etichetta: "Coltivazione", mesi: [4, 5, 6, 7, 8] },
      { etichetta: "Raccolta", mesi: [8, 9, 10] },
      { etichetta: "Essiccazione", mesi: [8, 9, 10, 11] },
    ],
    fonti: ["arsac-pat"],
  },
  {
    id: "ortaggi-estivi",
    nome: "Ortaggi estivi (pomodoro, melanzana, peperone)",
    categoria: "coltivazioni",
    sintesi: "raccolta",
    mesi: [6, 7, 8, 9],
    zone: "pianure costiere e aree irrigue",
    nota: "Nelle serre e nelle aree costiere la raccolta può iniziare prima e protrarsi oltre la fascia indicata.",
    fonti: ["arsac-pat"],
  },
  {
    id: "ortaggi-invernali",
    nome: "Ortaggi autunno-invernali (cavolo, broccolo, finocchio, spinacio)",
    categoria: "coltivazioni",
    sintesi: "raccolta",
    mesi: [11, 12, 1, 2, 3],
    zone: "colline e pianure costiere",
    fonti: ["arsac-pat"],
  },
  {
    id: "cereali",
    nome: "Grano duro e altri cereali",
    categoria: "coltivazioni",
    sintesi: "raccolta",
    mesi: [6, 7],
    zone: "Piana di Sibari, Piana di Crotone",
    nota: "La trebbiatura può anticipare a fine maggio nelle pianure più calde e slittare a inizio agosto nelle aree interne.",
    fasi: [
      { etichetta: "Semina", mesi: [11, 12, 1] },
      { etichetta: "Raccolta", mesi: [6, 7] },
    ],
    fonti: ["arsac-pat"],
  },

  /* Olivicoltura */
  {
    id: "olive-da-olio",
    nome: "Olive da olio",
    categoria: "olivicoltura",
    sintesi: "raccolta, molitura e olio nuovo",
    mesi: [10, 11, 12, 1],
    zone: "colline e coste; nelle aree più fresche la raccolta slitta di alcune settimane",
    nota: "L'invaiatura cade tra metà ottobre e metà dicembre secondo cultivar e zona: la raccolta si concentra tra ottobre e dicembre e può proseguire a gennaio.",
    fasi: [
      { etichetta: "Invaiatura", mesi: [10, 11, 12] },
      { etichetta: "Raccolta", mesi: [10, 11, 12, 1] },
      { etichetta: "Molitura", mesi: [11, 12, 1, 2] },
      { etichetta: "Olio nuovo", mesi: [12, 1, 2] },
    ],
    fonti: ["arsac-bollettini", "ufarmer-olive"],
  },

  /* Formaggi e latticini */
  {
    id: "pecorino-crotonese",
    nome: "Pecorino Crotonese DOP",
    categoria: "latticini",
    sintesi: "lavorazioni casearie e stagionatura",
    mesi: TUTTI_I_MESI,
    zone: "52 comuni tra le province di Crotone, Catanzaro e Cosenza",
    nota: "Il disciplinare distingue fresco, semiduro (60–90 giorni) e stagionato (oltre 90 giorni): la produzione prosegue tutto l'anno.",
    fasi: [
      { etichetta: "Produzione", mesi: TUTTI_I_MESI },
      { etichetta: "Stagionatura semiduro (60–90 gg)", mesi: TUTTI_I_MESI },
      { etichetta: "Stagionatura oltre 90 gg", mesi: TUTTI_I_MESI },
    ],
    fonti: ["masaf-pecorino", "arsac-pecorino"],
  },
  {
    id: "caciocavallo-silano",
    nome: "Caciocavallo Silano DOP",
    categoria: "latticini",
    sintesi: "produzione e stagionatura",
    mesi: TUTTI_I_MESI,
    zone: "Sila e territori indicati dal disciplinare",
    nota: "Stagionatura minima 30 giorni; «Extra» da almeno 4 mesi, «Gran Riserva» da almeno 9 mesi.",
    fasi: [
      { etichetta: "Produzione", mesi: TUTTI_I_MESI },
      { etichetta: "Asciugatura (circa un mese)", mesi: TUTTI_I_MESI },
      { etichetta: "Stagionatura (30 gg – 1 anno)", mesi: TUTTI_I_MESI },
    ],
    fonti: ["masaf-caciocavallo", "arsac-caciocavallo"],
  },
  {
    id: "latticini-tradizionali",
    nome: "Ricotta e latticini tradizionali",
    categoria: "latticini",
    sintesi: "lavorazioni casearie",
    mesi: TUTTI_I_MESI,
    zone: "Sila, Pollino, Aspromonte, altopiano del Poro",
    nota: "Le lavorazioni seguono la mungitura e si distribuiscono su tutto l'anno, con maggiore frequenza in primavera e autunno.",
    fonti: ["arsac-pat"],
  },

  /* Carni e salumi */
  {
    id: "nduja",
    nome: "'Nduja di Spilinga",
    categoria: "salumi",
    sintesi: "preparazione e stagionatura",
    mesi: [11, 12, 1, 2, 3],
    zone: "Spilinga e altopiano del Poro (Vibo Valentia)",
    nota: "La lavorazione segue la macellazione suina tradizionale invernale; la stagionatura richiede da 45 a 90 giorni.",
    fasi: [
      { etichetta: "Preparazione e insacco", mesi: [11, 12, 1, 2] },
      { etichetta: "Stagionatura", mesi: [12, 1, 2, 3, 4] },
    ],
    fonti: ["nduja-stagionatura"],
  },
  {
    id: "soppressata",
    nome: "Soppressata di Calabria DOP",
    categoria: "salumi",
    sintesi: "preparazione e stagionatura",
    mesi: [11, 12, 1, 2, 3],
    zone: "tutto il territorio regionale",
    nota: "Il disciplinare prevede una stagionatura naturale di almeno 45 giorni.",
    fasi: [
      { etichetta: "Lavorazione e insacco", mesi: [11, 12, 1, 2] },
      { etichetta: "Stagionatura (minimo 45 gg)", mesi: [12, 1, 2, 3, 4] },
    ],
    fonti: ["masaf-soppressata", "arsac-salumi"],
  },
  {
    id: "capocollo-pancetta",
    nome: "Capocollo e Pancetta di Calabria DOP",
    categoria: "salumi",
    sintesi: "salatura e stagionatura",
    mesi: [11, 12, 1, 2, 3, 4],
    zone: "tutto il territorio regionale",
    fonti: ["arsac-salumi"],
  },
  {
    id: "salsiccia",
    nome: "Salsiccia di Calabria DOP",
    categoria: "salumi",
    sintesi: "preparazione e stagionatura",
    mesi: [11, 12, 1, 2],
    zone: "tutto il territorio regionale",
    fonti: ["arsac-salumi"],
  },

  /* Viticoltura */
  {
    id: "vite",
    nome: "Ciclo della vite",
    categoria: "viticoltura",
    sintesi: "potatura, fioritura, invaiatura, vendemmia e vinificazione",
    mesi: TUTTI_I_MESI,
    zone: "Cirò, Savuto, Pollino, Terre di Cosenza, Bivongi, Greco di Bianco",
    nota: "La vendemmia va da fine agosto a ottobre secondo varietà e quota; le lavorazioni in cantina proseguono dopo la raccolta.",
    fasi: [
      { etichetta: "Potatura", mesi: [1, 2, 3] },
      { etichetta: "Fioritura", mesi: [5, 6] },
      { etichetta: "Invaiatura", mesi: [7, 8] },
      { etichetta: "Vendemmia", mesi: [8, 9, 10] },
      { etichetta: "Vinificazione", mesi: [9, 10, 11] },
      { etichetta: "Affinamento", mesi: [11, 12, 1, 2, 3, 4] },
    ],
    fonti: ["arsac-bollettini"],
  },

  /* Apicoltura */
  {
    id: "miele",
    nome: "Miele calabrese",
    categoria: "apicoltura",
    sintesi: "fioriture, raccolta e smielatura",
    mesi: [3, 4, 5, 6, 7, 8, 9],
    zone: "agrumeti della piana, castagneti di Sila e Aspromonte",
    nota: "Le fioriture si susseguono: agrumi in primavera, castagno in estate. La smielatura segue la raccolta e il confezionamento prosegue nei mesi successivi.",
    fasi: [
      { etichetta: "Fioriture agrumi", mesi: [3, 4] },
      { etichetta: "Raccolta", mesi: [5, 6, 7, 8] },
      { etichetta: "Fioritura castagno", mesi: [6, 7] },
      { etichetta: "Smielatura e confezionamento", mesi: [6, 7, 8, 9] },
    ],
    fonti: ["arsac-pat"],
  },

  /* Prodotti del bosco */
  {
    id: "castagne",
    nome: "Castagne",
    categoria: "bosco",
    sintesi: "raccolta",
    mesi: [9, 10, 11],
    zone: "Sila, Aspromonte, Pollino",
    fonti: ["arsac-pat"],
  },
  {
    id: "funghi",
    nome: "Funghi di bosco",
    categoria: "bosco",
    sintesi: "raccolta",
    mesi: [9, 10, 11],
    zone: "Sila, Pollino, Aspromonte",
    nota: "La comparsa dipende da piogge e temperature: la stagione può spostarsi o essere discontinua.",
    fonti: ["arsac-pat"],
  },
  {
    id: "noci-nocciole",
    nome: "Noci e nocciole",
    categoria: "bosco",
    sintesi: "raccolta",
    mesi: [9, 10],
    zone: "aree collinari e pedemontane",
    fonti: ["arsac-pat"],
  },

  /* Trasformazioni alimentari */
  {
    id: "conserve-pomodoro",
    nome: "Passata e conserve di pomodoro",
    categoria: "trasformazioni",
    sintesi: "trasformazione",
    mesi: [8, 9],
    zone: "laboratori aziendali e piccole imprese della piana",
    fonti: ["arsac-pat"],
  },
  {
    id: "sottoli",
    nome: "Sott'oli e sott'aceti",
    categoria: "trasformazioni",
    sintesi: "trasformazione",
    mesi: [8, 9, 10],
    zone: "laboratori aziendali",
    fonti: ["arsac-pat"],
  },
  {
    id: "essiccazione",
    nome: "Essiccazione di peperoncino e fichi",
    categoria: "trasformazioni",
    sintesi: "trasformazione",
    mesi: [8, 9, 10],
    zone: "Poro, aree collinari e costiere",
    fonti: ["arsac-pat"],
  },
];

/* ────────────────────────────── Periodi ────────────────────────────── */

export type Periodo = {
  id: string;
  titolo: string;
  mesi: Mese[];
};

/**
 * Raggruppamenti bimestrali: struttura di visualizzazione, non un vincolo
 * agronomico. Le attività restano quelle delle singole voci, che possono
 * coprire uno o più bimestri e sono filtrate per intersezione.
 */
export const PERIODI: Periodo[] = [
  { id: "gen-feb", titolo: "Gennaio – Febbraio", mesi: [1, 2] },
  { id: "mar-apr", titolo: "Marzo – Aprile", mesi: [3, 4] },
  { id: "mag-giu", titolo: "Maggio – Giugno", mesi: [5, 6] },
  { id: "lug-ago", titolo: "Luglio – Agosto", mesi: [7, 8] },
  { id: "set-ott", titolo: "Settembre – Ottobre", mesi: [9, 10] },
  { id: "nov-dic", titolo: "Novembre – Dicembre", mesi: [11, 12] },
];

/** Mese corrente in Italia (evita slittamenti di un giorno sul fuso UTC). */
export function meseCorrente(data: Date = new Date()): Mese {
  const mese = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", month: "numeric" }).format(data),
  );
  if (Number.isInteger(mese) && mese >= 1 && mese <= 12) return mese as Mese;
  return (data.getMonth() + 1) as Mese;
}

export function periodoDiMese(mese: Mese): Periodo {
  return PERIODI[Math.floor((mese - 1) / 2)] ?? PERIODI[0];
}

export function periodoCorrente(data: Date = new Date()): Periodo {
  return periodoDiMese(meseCorrente(data));
}

export function vociDelPeriodo(periodo: Periodo): Voce[] {
  return VOCI.filter((voce) => voce.mesi.some((mese) => periodo.mesi.includes(mese)));
}

export type GruppoPeriodo = { categoria: Categoria; voci: Voce[] };

/** Voci del periodo raggruppate per categoria, senza categorie vuote. */
export function gruppiDelPeriodo(periodo: Periodo): GruppoPeriodo[] {
  return CATEGORIE.map((categoria) => ({
    categoria,
    voci: vociDelPeriodo(periodo).filter((voce) => voce.categoria === categoria.id),
  })).filter((gruppo) => gruppo.voci.length > 0);
}

export function etichettaMesi(mesi: Mese[]): string {
  const ordinati = [...new Set(mesi)].sort((a, b) => a - b);
  if (ordinati.length === 0) return "—";
  if (ordinati.length === 12) return "Tutto l'anno";
  if (ordinati.length === 1) return NOMI_MESI[ordinati[0] - 1];
  return `${NOMI_MESI[ordinati[0] - 1]} – ${NOMI_MESI[ordinati[ordinati.length - 1] - 1]}`;
}
