/**
 * Dizionario IT → EN del sito.
 *
 * La traduzione avviene sui testi già renderizzati (vedi
 * `lib/i18n/traduzione-dom.ts`): ogni testo che compare in pagina viene
 * cercato qui, con spazi compattati e senza spazi ai bordi. Se una frase non
 * c'è, resta in italiano: per tradurre una nuova schermata basta aggiungere la
 * coppia "italiano": "english" in `DIZIONARIO` (o un modello in `MOTIVI` per le
 * frasi con parti variabili, es. i conteggi del carrello).
 */

import { DIZIONARIO_PAGINE } from "./dictionary-pagine";
import { DIZIONARIO_COMPLETAMENTO } from "./dictionary-completamento";
import { DIZIONARIO_INTERFACCIA } from "./dictionary-interfaccia";
import { DIZIONARIO_TERRITORI } from "./dictionary-territori";
import { DIZIONARIO_PRODOTTI } from "./dictionary-prodotti";

export type Lingua = "it" | "en" | "fr" | "es" | "de";

/** Lingue in cui il sito può essere tradotto (l'italiano è l'originale). */
export const LINGUE_TRADOTTE = ["en", "fr", "es", "de"] as const;
export type LinguaTradotta = (typeof LINGUE_TRADOTTE)[number];

/** Cookie (leggibile dal browser) che conserva la lingua scelta. */
export const COOKIE_LINGUA = "lh_lang";

/** Testi fissi: chiave = testo italiano normalizzato, valore = inglese. */
const DIZIONARIO_BASE: Record<string, string> = {
  // ── Struttura, accessibilità, footer legale ───────────────────────────
  "Salta al contenuto": "Skip to content",
  "Termini e condizioni": "Terms and conditions",
  "Termini per gli Acquirenti": "Buyer terms",
  "Condizioni di vendita": "Terms of sale",
  "Termini per i Venditori": "Seller terms",
  "Regolamento Consegne": "Delivery policy",

  // ── Navigazione ───────────────────────────────────────────────────────
  Home: "Home",
  Negozi: "Shops",
  Aziende: "Businesses",
  Offerte: "Deals",
  Categorie: "Categories",
  Territorio: "Territory",
  SALDI: "SALE",
  "Sapori locali": "Local flavours",
  "Luoghi da vedere": "Places to see",
  "Cultura e tradizioni": "Culture and traditions",
  Dintorni: "Surroundings",
  "Navigazione principale": "Main navigation",
  "Sezioni della guida Territorio": "Territory guide sections",

  // ── Barra di ricerca ──────────────────────────────────────────────────
  "Cerca prodotti, filiere, produttori e territori.":
    "Search products, supply chains, producers and territories.",
  "Cerca prodotti, filiere, produttori e territori":
    "Search products, supply chains, producers and territories",
  Cerca: "Search",
  Ricerca: "Search",
  "Cerca nella tua città": "Search in your city",

  // ── Account ───────────────────────────────────────────────────────────
  Accedi: "Sign in",
  "Entra come Cliente": "Continue as Customer",
  "Entra come Venditore": "Continue as Seller",
  "Area Corriere Locale": "Local Courier Area",
  "Area Clienti": "Customer Area",
  "Area Venditore": "Seller Area",
  "Area Amministratore": "Admin Area",
  Amministrazione: "Administration",
  OSPITE: "GUEST",
  "senza account": "no account",
  "Modalità ospite · acquisto senza account": "Guest mode · buying without an account",
  "Stai acquistando come ospite. Nome, email e telefono ti verranno chiesti nell'ordine.":
    "You are buying as a guest. Your name, email and phone number will be requested at checkout.",
  "ESCI DALLA MODALITÀ OSPITE": "EXIT GUEST MODE",
  Esci: "Sign out",
  "Menu utente": "User menu",
  Acquirente: "Buyer",
  Venditore: "Seller",
  Amministratore: "Administrator",
  "Corriere locale": "Local courier",
  "Modalità ospite attiva: stai acquistando senza account":
    "Guest mode active: you are buying without an account",
  "Modalità ospite": "Guest mode",

  // ── Meteo ─────────────────────────────────────────────────────────────
  Sereno: "Clear",
  "Prevalentemente sereno": "Mostly clear",
  "Parzialmente nuvoloso": "Partly cloudy",
  Coperto: "Overcast",
  Nebbia: "Fog",
  Pioggerella: "Drizzle",
  "Pioggerella intensa": "Heavy drizzle",
  Pioggia: "Rain",
  "Pioggia intensa": "Heavy rain",
  Neve: "Snow",
  "Neve intensa": "Heavy snow",
  Rovesci: "Showers",
  "Rovesci intensi": "Heavy showers",
  Temporale: "Thunderstorm",
  "Temporale con grandine": "Thunderstorm with hail",
  "Temporale intenso": "Severe thunderstorm",
  "Condizioni variabili": "Variable conditions",
  "Meteo attuale": "Current weather",
  "Apri dettagli meteo di Castrovillari": "Open Castrovillari weather details",
  "Dettagli meteo di Castrovillari": "Castrovillari weather details",
  "Chiudi dettagli meteo": "Close weather details",
  "Condizioni e temperatura rilevate in tempo reale tramite Open-Meteo.":
    "Conditions and temperature detected in real time via Open-Meteo.",

  // ── Homepage: hero ────────────────────────────────────────────────────
  "“La filiera d'eccellenza": "“The supply chain of excellence",
  "arriva in città": "reaches the city",
  "in un unico posto": "in one single place",
  "in unico posto": "in one single place",
  "Vigneti e uliveti del territorio visti dall'alto":
    "Vineyards and olive groves of the territory seen from above",
  "Sostieni il commercio locale": "Support local business",
  "Trova tutto in un unico posto": "Find everything in one place",
  "Offerte dal territorio": "Deals from the territory",

  // ── Homepage: sezioni ─────────────────────────────────────────────────
  Scopri: "Discover",
  "Negozi in evidenza": "Featured shops",
  "Vedi tutti": "See all",
  "Vedi tutte": "See all",
  "Scopri il negozio": "Visit the shop",
  "Scopri le migliori offerte e prodotti selezionati.":
    "Discover the best deals and selected products.",
  "Eccellenze calabresi": "Calabrian excellence",
  "ECCELLENZE CALABRESI": "CALABRIAN EXCELLENCE",
  "Prodotti tipici": "Local specialities",
  "Per i commercianti": "For businesses",
  "Porta la tua realtà dentro Radici Calabria": "Bring your business into Radici Calabria",
  "Fai conoscere la tua attività, valorizza i tuoi prodotti e racconta le tue produzioni. Entra in una rete che collega produttori, imprese, distributori e attività commerciali ai consumatori, portando le eccellenze dei territori nelle città.":
    "Make your business known, showcase your products and tell the story of what you produce. Join a network that connects producers, businesses, distributors and shops with consumers, bringing local specialities into cities.",
  "Dai valore a ciò che fai. Entra nella rete.": "Give value to what you do. Join the network.",
  "[ Entra in Radici Calabria ]": "[ Join Radici Calabria ]",
  "Entra in Radici Calabria": "Join Radici Calabria",
  "Apri il tuo negozio": "Open your shop",
  "Consumatori": "Consumers",
  "Imprese e operatori": "Businesses and Operators",
  "Logistica e consegne": "Logistics and Delivery",
  "Area consumatori": "Consumers area",
  "Area imprese e operatori": "Businesses and Operators area",
  "Area logistica e consegne": "Logistics and Delivery area",
  "Area consumatori — Radici Calabria": "Consumers area — Radici Calabria",
  "Area imprese e operatori — Radici Calabria": "Businesses and Operators area — Radici Calabria",
  "Menu Area consumatori": "Consumers area menu",
  "Pannello imprese e operatori": "Businesses and operators panel",
  "Registra la tua impresa": "Register your business",
  "Accesso imprese e operatori": "Businesses and operators sign-in",
  "Accesso logistica e consegne": "Logistics and delivery sign-in",
  "Registrati come operatore logistico": "Register as a logistics operator",
  "INCITTÀ · AREA CONSUMATORI": "INCITTÀ · CONSUMERS AREA",
  "INCITTÀ · IMPRESE E OPERATORI": "INCITTÀ · BUSINESSES AND OPERATORS",
  "INCITTÀ · LOGISTICA E CONSEGNE": "INCITTÀ · LOGISTICS AND DELIVERY",
  "Filiere": "Supply chains",
  "Imprese": "Businesses",
  "Accedi per scoprire prodotti, imprese e filiere.": "Sign in to discover products, businesses and supply chains.",
  "Gestisci ordini, prodotti e attività dal tuo pannello operativo.": "Manage orders, products and business from your operational panel.",
  "Gestisci ritiri, trasporti e consegne.": "Manage pickups, transport and deliveries.",
  "Scopri prodotti, imprese e filiere dei territori, ogni giorno.": "Discover the products, businesses and supply chains of the territories, every day.",
  "Crea l'account della tua impresa e gestisci ordini, prodotti e attività.": "Create your business account and manage orders, products and business.",
  "Crea il tuo account. L'accesso operativo sarà disponibile dopo l'approvazione amministrativa.": "Create your account. Operational access will be available after administrative approval.",
  "Le filiere dei territori incontrano le città.": "The supply chains of the territories meet the cities.",
  "Area riservata alle imprese e agli operatori di Radici Calabria.": "Area reserved for the businesses and operators of Radici Calabria.",
  "Area riservata agli operatori di logistica approvati da Radici Calabria.": "Area reserved for logistics operators approved by Radici Calabria.",
  "La tua area personale su Radici Calabria": "Your personal area on Radici Calabria",
  "Esplora i negozi": "Explore shops",
  "Le filiere dei territori arrivano in città: produzioni, imprese e identità territoriali in rete, a partire dal Pollino e dalla Calabria.":
    "Bringing local supply chains into cities: production, businesses and territorial identities in one network, starting from the Pollino and Calabria.",
  Esplora: "Explore",
  "Le tue aree": "Your areas",
  Informazioni: "Information",
  Notizie: "News",

  // ── Commercio: azioni e stati ─────────────────────────────────────────
  "Aggiungi al carrello": "Add to cart",
  "Nel carrello": "In cart",
  "Acquista ora": "Buy now",
  Carrello: "Cart",
  "Carrello vuoto": "Your cart is empty",
  Totale: "Total",
  Subtotale: "Subtotal",
  Spedizione: "Shipping",
  Quantità: "Quantity",
  Prezzo: "Price",
  Disponibile: "Available",
  Esaurito: "Out of stock",
  "Vedi tutti i prodotti": "See all products",
  "Vedi tutti i negozi": "See all shops",
  "Vedi di più": "See more",
  "Scopri di più": "Learn more",
  "Prodotti consigliati": "Recommended products",
  Filtri: "Filters",
  "Ordina per": "Sort by",
  "Nessun risultato": "No results",
  "Nessun risultato trovato": "No results found",
  Chiudi: "Close",
  Annulla: "Cancel",
  Salva: "Save",
  Conferma: "Confirm",
  Continua: "Continue",
  Indietro: "Back",
  Avanti: "Next",
  "Torna alla home": "Back to home",
  Registrati: "Sign up",
  "Nessun ruolo assegnato": "No role assigned",
  "Consumatore, impresa e operatore logistico comunicano sullo stesso ordine.": "Consumer, business and logistics operator communicate on the same order.",
  "Impresa": "Business",
  "Impresa:": "Business:",
  "Consumatore:": "Consumer:",
  "Impresa e operatore": "Business and Operator",
  "Operatore logistico": "Logistics Operator",
  "Operatori logistici": "Logistics Operators",
  "Consumatore": "Consumer",
  "Torna all'area consumatori": "Back to the consumer area",
  "Navigazione area consumatori mobile": "Consumer area mobile navigation",
  "Caricamento area imprese e operatori": "Loading the businesses and operators area",
  "Esegui la migrazione SQL per attivare l'area imprese e operatori.": "Run the SQL migration to enable the businesses and operators area.",
  "Si è verificato un errore durante il caricamento dell'area imprese e operatori. Riprova tra qualche istante.": "Something went wrong while loading the businesses and operators area. Please try again in a moment.",
  "Caricamento dashboard logistica e consegne…": "Loading the logistics and delivery dashboard…",
  "Approvazione operatori logistici": "Logistics operator approvals",
  "Gestisci le richieste degli operatori logistici. L'approvazione usa lo stesso sistema account già presente nella piattaforma.": "Manage logistics operator requests. Approval uses the same account system already in place on the platform.",
  "Nessuna richiesta di operatore logistico.": "No logistics operator requests.",
  "Assegna gli ordini di logistica e consegne esclusivamente agli operatori logistici approvati.": "Assign logistics and delivery orders only to approved logistics operators.",
  "Netto impresa": "Business net",
  "Cerca numero, consumatore o negozio…": "Search number, consumer or store…",
  "Es. articolo non disponibile, richiesta consumatore…": "E.g. item unavailable, consumer request…",
  "I payout compaiono quando un'impresa calcola un periodo.": "Payouts appear when a business calculates a period.",
  "Gestisci il catalogo del negozio con lo stesso sistema delle imprese: AI, modifica ed eliminazione incluse.": "Manage the store catalogue with the same system businesses use: AI, editing and deletion included.",
  "Dati consumatore": "Consumer details",
  "Il consumatore deve inserire la sua email": "The consumer must enter their email",
  "Il consumatore deve inserire il suo telefono": "The consumer must enter their phone",
  "Il consumatore deve scrivere un messaggio": "The consumer must write a message",
  "Pulsante visibile ai consumatori": "Button visible to consumers",
  "Presenta ai consumatori i servizi che offri.": "Show consumers the services you offer.",
  "I consumatori li vedono": "Consumers see them",
  "Ricevi richieste dai consumatori": "Receive requests from consumers",
  "Ricevi richieste dai consumatori dalla tua pagina.": "Receive requests from consumers on your page.",
  "Appuntamenti dei consumatori": "Consumer appointments",
  "Ricevi e gestisci gli appuntamenti dei consumatori": "Receive and manage consumer appointments",
  "Ricevi e gestisci gli appuntamenti dei consumatori.": "Receive and manage consumer appointments.",
  "Tieni aggiornate le informazioni che i consumatori vedono sul tuo negozio.": "Keep the information consumers see on your store up to date.",
  "Come i consumatori ti comprano e come ricevono i prodotti.": "How consumers buy from you and receive products.",
  "Come i consumatori ricevono i tuoi prodotti": "How consumers receive your products",
  "Il consumatore passa a ritirare l'ordine nel tuo punto vendita.": "The consumer picks the order up at your store.",
  "Consegni tu, direttamente al consumatore.": "You deliver directly to the consumer.",
  "Permetti ai consumatori di contattarti via WhatsApp": "Let consumers contact you on WhatsApp",
  "Consenti ai consumatori di prenotare i tuoi servizi": "Let consumers book your services",
  "I servizi che offri ai consumatori.": "The services you offer to consumers.",
  "Calendario e appuntamenti dei consumatori.": "Calendar and consumer appointments.",
  "Come vedono il negozio i consumatori": "How consumers see the store",
  "Bonifico bancario diretto all'impresa": "Bank transfer directly to the business",
  "Pagamento manuale sul conto bancario dell'impresa": "Manual payment to the business bank account",
  "Messaggio inviato al consumatore. Verrà avvisato via email.": "Message sent to the consumer. They will be notified by email.",
  "Scrivi una risposta al consumatore…": "Write a reply to the consumer…",
  "Il consumatore riceverà un'email.": "The consumer will receive an email.",
  "Ordine rifiutato per prodotto non disponibile. Il consumatore riceverà un'email.": "Order rejected because the item is unavailable. The consumer will receive an email.",
  "Ordine annullato. Il consumatore riceverà un'email.": "Order cancelled. The consumer will receive an email.",
  "Note del consumatore": "Consumer notes",
  "Eventuali dettagli per il consumatore…": "Any details for the consumer…",
  "Quando un consumatore effettua un acquisto dal sito, l'ordine comparirà qui con tutti i dettagli da gestire.": "When a consumer buys on the site, the order will appear here with all the details to manage.",
  "Quando un consumatore segnala un problema su un ordine, il reclamo comparirà qui.": "When a consumer reports an issue with an order, the claim will appear here.",
  "Attiva solo i servizi che vuoi offrire ai tuoi consumatori.": "Enable only the services you want to offer your consumers.",
  "Il consumatore non pagherà le spese di spedizione.": "The consumer will not pay shipping costs.",
  "Se attiva, il consumatore non pagherà le spese di spedizione per questo metodo.": "If enabled, the consumer will not pay shipping costs for this method.",
  "In attesa che l'impresa prepari il pacco": "Waiting for the business to prepare the parcel",
  "Consumatore, impresa e operatore logistico parlano nello stesso ordine. Le conversazioni con messaggi nuovi sono evidenziate nelle consegne.": "Consumer, business and logistics operator talk on the same order. Conversations with new messages are highlighted in deliveries.",
  "Pacco pronto per l'operatore logistico": "Parcel ready for the logistics operator",
  "L'impresa ha completato la preparazione. Il ritiro e la conferma della consegna spettano all'operatore logistico.": "The business has completed the preparation. Pickup and delivery confirmation are up to the logistics operator.",
  "Pagamento tramite bonifico diretto all'impresa": "Payment by bank transfer directly to the business",
  "Costo predefinito: €2,00. L'impresa può modificarlo.": "Default cost: €2.00. The business can change it.",
  "Operatore logistico approvato": "Approved logistics operator",
  "Nessun operatore logistico approvato disponibile": "No approved logistics operator available",
  "Un amministratore deve approvare almeno un account operatore logistico prima di poter affidare la consegna.": "An administrator must approve at least one logistics operator account before a delivery can be assigned.",
  "Scegli l'operatore logistico approvato che dovrà prendere in carico questo ordine.": "Choose the approved logistics operator who will take charge of this order.",
  "Affida operatore logistico": "Assign logistics operator",
  "Caricamento affidamento operatore logistico…": "Loading operator assignment…",
  "Seleziona un operatore logistico…": "Select a logistics operator…",
  "Consegna affidata all'operatore logistico. Può ora gestirla dalla sua area.": "Delivery assigned to the logistics operator. They can now manage it from their area.",
  "Impossibile caricare gli operatori logistici.": "Unable to load logistics operators.",
  "Accedi al tuo account": "Sign in to your account",
  Nome: "Name",
  Cognome: "Surname",
  Telefono: "Phone",
  Indirizzo: "Address",
  Preferiti: "Favourites",
  Ordini: "Orders",
  Profilo: "Profile",
  "Il mio profilo": "My profile",
  "In evidenza": "Featured",
  Novità: "New",
  Gratis: "Free",
  Aperto: "Open",
  Chiuso: "Closed",
  "Aperto ora": "Open now",
  Orari: "Opening hours",
  Contatti: "Contact",
  Indicazioni: "Directions",
  Condividi: "Share",
  Recensioni: "Reviews",
  "Nessuna recensione": "No reviews",
  "Scrivi una recensione": "Write a review",
  Valutazione: "Rating",
  Servizi: "Services",
  Prodotti: "Products",
  Descrizione: "Description",
  Dettagli: "Details",
  Certificazioni: "Certifications",
  "Marchi di certificazione": "Certification marks",

  // ── Schede prodotto e controlli della vetrina ─────────────────────────
  "Mostra i prodotti": "Show products",
  "Torna alla foto": "Back to the photo",
  "Torna alla foto della homepage": "Back to the homepage photo",
  "Scopri i prodotti: scorri per vedere i prodotti":
    "Discover the products: swipe to see the products",
  "Homepage Radici Calabria: scorri orizzontalmente per passare dalla foto ai prodotti":
    "Radici Calabria homepage: swipe horizontally to switch from the photo to the products",
  "Chiedi all'AI": "Ask the AI",
  negozio: "shop",
  disponibili: "available",

  // ── Orari di apertura ─────────────────────────────────────────────────
  "Aperto 24h": "Open 24h",
  lunedì: "Monday",
  martedì: "Tuesday",
  mercoledì: "Wednesday",
  giovedì: "Thursday",
  venerdì: "Friday",
  sabato: "Saturday",
  domenica: "Sunday",
};

/**
 * Frasi con parti variabili (conteggi, nomi, ruoli): [modello, sostituzione].
 * Il modello è applicato al testo italiano normalizzato.
 */
/** Dizionario base (chrome + home) fuso con le voci raccolte pagina per pagina. */
export const DIZIONARIO: Record<string, string> = {
  ...DIZIONARIO_BASE,
  ...DIZIONARIO_PAGINE,
  ...DIZIONARIO_COMPLETAMENTO,
  ...DIZIONARIO_INTERFACCIA,
  ...DIZIONARIO_TERRITORI,
  ...DIZIONARIO_PRODOTTI,
};


/**
 * Frasi con parti variabili (conteggi, nomi, ruoli), una tabella per lingua.
 * Il modello è applicato al testo italiano normalizzato.
 */
export const MOTIVI: Record<LinguaTradotta, Array<[RegExp, string]>> = {
  en: [
  [/^(\d+) negozio$/, "$1 shop"],
  [/^(\d+) negozi$/, "$1 shops"],
  [/^(\d+) disponibil[ei]$/, "$1 available"],

  // ── Etichette accessibili delle schede prodotto e dei negozi ──────────
  [/^Salva (.+) nei preferiti$/, "Save $1 to favourites"],
  [/^Rimuovi (.+) dai preferiti$/, "Remove $1 from favourites"],
  [/^Acquista (.+)$/, "Buy $1"],
  [/^Aggiungi (.+) al carrello$/, "Add $1 to cart"],
  [/^Condividi (.+)$/, "Share $1"],
  [/^Segnala abuso o violazione per (.+)$/, "Report abuse or violation for $1"],
  [/^Indicazioni stradali per (.+) su Google Maps$/, "Directions to $1 on Google Maps"],
  [/^Fotografia del negozio (.+)$/, "Photo of the shop $1"],
  [/^Logo (.+) non ancora impostato$/, "$1 logo not set yet"],
  [/^Apri dettagli farmacia di turno: (.+)$/, "Open on-duty pharmacy details: $1"],
  [/^Torna a (.+)$/, "Back to $1"],

  // ── Orari di apertura ─────────────────────────────────────────────────
  [/^Apre (.+) alle (.+)$/, "Opens $1 at $2"],
  [/^Apre alle (.+)$/, "Opens at $1"],
  [/^Aperto fino alle (.+)$/, "Open until $1"],
  [/^(\d+) prodott[oi]$/, "$1 product"],
  [/^(\d+) prodotti$/, "$1 products"],
  [/^Prodotti \((\d+)\)$/, "Products ($1)"],
  [/^Negozi \((\d+)\)$/, "Shops ($1)"],
  [/^Pagina (\d+) di (\d+)$/, "Page $1 of $2"],
  [/^(\d+) prodotti per “(.+)” · (\d+) negozi$/, "$1 products for “$2” · $3 shops"],
  [/^(\d+) prodotti per “(.+)” · (\d+) negozio$/, "$1 products for “$2” · $3 shop"],
  [/^Edizione (\d{4}): (.+)$/, "Edition $1: $2"],
  [/^(\d+) recension[ei]$/, "$1 reviews"],
  [/^(\d+) preferit[oi]$/, "$1 favourites"],
  [/^Vai al negozio (.+)$/, "Go to the shop $1"],
  [/^Carrello \((\d+) articol[oi]\)$/, "Cart ($1 items)"],
  [/^Carrello$/, "Cart"],
  [/^(\d+) articol[oi]$/, "$1 items"],
  [/^(\d+) righe$/, "$1 rows"],
  [/^(\d+) per pagina$/, "$1 per page"],
  [/^Vai al negozio (.+)$/, "Go to the shop $1"],
  [/^Logo (.+)$/, "$1 logo"],
  [/^Menu utente di (.+)$/, "User menu for $1"],

  // ── Scheda prodotto e checkout ────────────────────────────────────────
  [/^Variante: (.+)$/, "Variant: $1"],
  [/^Mostra immagine (.+)$/, "Show image $1"],
  [/^Pacco: (.+) kg ·$/, "Parcel: $1 kg ·"],
  [/^(.+) · fino a (.+) kg$/, "$1 · up to $2 kg"],

  // ── Intervalli di mesi, conteggi e didascalie ────────────────────────
  [/^((?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s*[–-]\s*(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre))?)$/i, "$1"],
  [/^Prodotti di (.+)$/, "Products from $1"],
  [/^Mesi di attività: (.+)$/, "Active months: $1"],
  [/^I prodotti di (.+) non sono disponibili in questo momento\.$/, "The products of $1 are not available right now."],
  [/^(\d+) prodotti attivi$/, "$1 active products"],
  [/^(\d+) contenuti in archivio$/, "$1 items in the archive"],
  [/^(\d+) milioni di euro$/, "$1 million euros"],
  [/^(\d+) mln €$/, "€$1m"],
  [/^Foto: (.+)$/, "Photo: $1"],
  ],

  fr: [
    [/^(\d+) negozio$/, "$1 boutique"],
    [/^(\d+) negozi$/, "$1 boutiques"],
    [/^(\d+) disponibil[ei]$/, "$1 disponibles"],
    [/^Salva (.+) nei preferiti$/, "Enregistrer $1 dans les favoris"],
    [/^Rimuovi (.+) dai preferiti$/, "Retirer $1 des favoris"],
    [/^Acquista (.+)$/, "Acheter $1"],
    [/^Aggiungi (.+) al carrello$/, "Ajouter $1 au panier"],
    [/^Condividi (.+)$/, "Partager $1"],
    [/^Segnala abuso o violazione per (.+)$/, "Signaler un abus ou une violation pour $1"],
    [/^Indicazioni stradali per (.+) su Google Maps$/, "Itinéraire vers $1 sur Google Maps"],
    [/^Fotografia del negozio (.+)$/, "Photo de la boutique $1"],
    [/^Logo (.+) non ancora impostato$/, "Logo $1 pas encore défini"],
    [/^Apri dettagli farmacia di turno: (.+)$/, "Ouvrir les détails de la pharmacie de garde : $1"],
    [/^Torna a (.+)$/, "Retour à $1"],
    [/^Apre (.+) alle (.+)$/, "Ouvre $1 à $2"],
    [/^Apre alle (.+)$/, "Ouvre à $1"],
    [/^Aperto fino alle (.+)$/, "Ouvert jusqu'à $1"],
    [/^(\d+) prodott[oi]$/, "$1 produit"],
    [/^(\d+) prodotti$/, "$1 produits"],
    [/^Prodotti \((\d+)\)$/, "Produits ($1)"],
    [/^Negozi \((\d+)\)$/, "Boutiques ($1)"],
    [/^Pagina (\d+) di (\d+)$/, "Page $1 sur $2"],
    [/^(\d+) prodotti per “(.+)” · (\d+) negozi$/, "$1 produits pour « $2 » · $3 boutiques"],
    [/^(\d+) prodotti per “(.+)” · (\d+) negozio$/, "$1 produits pour « $2 » · $3 boutique"],
    [/^Edizione (\d{4}): (.+)$/, "Édition $1 : $2"],
    [/^(\d+) recension[ei]$/, "$1 avis"],
    [/^(\d+) preferit[oi]$/, "$1 favoris"],
    [/^Vai al negozio (.+)$/, "Aller à la boutique $1"],
    [/^Carrello \((\d+) articol[oi]\)$/, "Panier ($1 articles)"],
    [/^Carrello$/, "Panier"],
    [/^(\d+) articol[oi]$/, "$1 articles"],
    [/^(\d+) righe$/, "$1 lignes"],
    [/^(\d+) per pagina$/, "$1 par page"],
    [/^Logo (.+)$/, "Logo $1"],
    [/^Menu utente di (.+)$/, "Menu utilisateur de $1"],
    [/^Variante: (.+)$/, "Variante : $1"],
    [/^Mostra immagine (.+)$/, "Afficher l'image $1"],
    [/^Pacco: (.+) kg ·$/, "Colis : $1 kg ·"],
    [/^(.+) · fino a (.+) kg$/, "$1 · jusqu'à $2 kg"],
    [/^Prodotti di (.+)$/, "Produits de $1"],
    [/^Mesi di attività: (.+)$/, "Mois d'activité : $1"],
    [/^(\d+) prodotti attivi$/, "$1 produits actifs"],
    [/^(\d+) contenuti in archivio$/, "$1 contenus archivés"],
    [/^(\d+) milioni di euro$/, "$1 millions d'euros"],
    [/^(\d+) mln €$/, "$1 M€"],
    [/^Foto: (.+)$/, "Photo : $1"],
    [/^I prodotti di (.+) non sono disponibili in questo momento\.$/, "Les produits de $1 ne sont pas disponibles pour le moment."],
  ],

  de: [
    [/^(\d+) negozio$/, "$1 Geschäft"],
    [/^(\d+) negozi$/, "$1 Geschäfte"],
    [/^(\d+) disponibil[ei]$/, "$1 verfügbar"],
    [/^Salva (.+) nei preferiti$/, "$1 zu Favoriten hinzufügen"],
    [/^Rimuovi (.+) dai preferiti$/, "$1 aus den Favoriten entfernen"],
    [/^Acquista (.+)$/, "$1 kaufen"],
    [/^Aggiungi (.+) al carrello$/, "$1 zum Warenkorb hinzufügen"],
    [/^Condividi (.+)$/, "$1 teilen"],
    [/^Segnala abuso o violazione per (.+)$/, "Missbrauch oder Verstoß für $1 melden"],
    [/^Indicazioni stradali per (.+) su Google Maps$/, "Route zu $1 auf Google Maps"],
    [/^Fotografia del negozio (.+)$/, "Foto des Geschäfts $1"],
    [/^Logo (.+) non ancora impostato$/, "Logo $1 noch nicht festgelegt"],
    [/^Apri dettagli farmacia di turno: (.+)$/, "Details der Notfallapotheke öffnen: $1"],
    [/^Torna a (.+)$/, "Zurück zu $1"],
    [/^Apre (.+) alle (.+)$/, "Öffnet $1 um $2"],
    [/^Apre alle (.+)$/, "Öffnet um $1"],
    [/^Aperto fino alle (.+)$/, "Geöffnet bis $1"],
    [/^(\d+) prodott[oi]$/, "$1 Produkt"],
    [/^(\d+) prodotti$/, "$1 Produkte"],
    [/^Prodotti \((\d+)\)$/, "Produkte ($1)"],
    [/^Negozi \((\d+)\)$/, "Geschäfte ($1)"],
    [/^Pagina (\d+) di (\d+)$/, "Seite $1 von $2"],
    [/^(\d+) prodotti per “(.+)” · (\d+) negozi$/, "$1 Produkte für „$2“ · $3 Geschäfte"],
    [/^(\d+) prodotti per “(.+)” · (\d+) negozio$/, "$1 Produkte für „$2“ · $3 Geschäft"],
    [/^Edizione (\d{4}): (.+)$/, "Ausgabe $1: $2"],
    [/^(\d+) recension[ei]$/, "$1 Bewertungen"],
    [/^(\d+) preferit[oi]$/, "$1 Favoriten"],
    [/^Vai al negozio (.+)$/, "Zum Geschäft $1"],
    [/^Carrello \((\d+) articol[oi]\)$/, "Warenkorb ($1 Artikel)"],
    [/^Carrello$/, "Warenkorb"],
    [/^(\d+) articol[oi]$/, "$1 Artikel"],
    [/^(\d+) righe$/, "$1 Zeilen"],
    [/^(\d+) per pagina$/, "$1 pro Seite"],
    [/^Logo (.+)$/, "Logo $1"],
    [/^Menu utente di (.+)$/, "Benutzermenü von $1"],
    [/^Variante: (.+)$/, "Variante: $1"],
    [/^Mostra immagine (.+)$/, "Bild $1 anzeigen"],
    [/^Pacco: (.+) kg ·$/, "Paket: $1 kg ·"],
    [/^(.+) · fino a (.+) kg$/, "$1 · bis zu $2 kg"],
    [/^Prodotti di (.+)$/, "Produkte aus $1"],
    [/^Mesi di attività: (.+)$/, "Aktive Monate: $1"],
    [/^(\d+) prodotti attivi$/, "$1 aktive Produkte"],
    [/^(\d+) contenuti in archivio$/, "$1 Inhalte im Archiv"],
    [/^(\d+) milioni di euro$/, "$1 Millionen Euro"],
    [/^(\d+) mln €$/, "$1 Mio. €"],
    [/^Foto: (.+)$/, "Foto: $1"],
    [/^I prodotti di (.+) non sono disponibili in questo momento\.$/, "Die Produkte von $1 sind derzeit nicht verfügbar."],
  ],

  es: [
    [/^(\d+) negozio$/, "$1 tienda"],
    [/^(\d+) negozi$/, "$1 tiendas"],
    [/^(\d+) disponibil[ei]$/, "$1 disponibles"],
    [/^Salva (.+) nei preferiti$/, "Guardar $1 en favoritos"],
    [/^Rimuovi (.+) dai preferiti$/, "Quitar $1 de favoritos"],
    [/^Acquista (.+)$/, "Comprar $1"],
    [/^Aggiungi (.+) al carrello$/, "Añadir $1 al carrito"],
    [/^Condividi (.+)$/, "Compartir $1"],
    [/^Segnala abuso o violazione per (.+)$/, "Denunciar abuso o infracción por $1"],
    [/^Indicazioni stradali per (.+) su Google Maps$/, "Indicaciones a $1 en Google Maps"],
    [/^Fotografia del negozio (.+)$/, "Foto de la tienda $1"],
    [/^Logo (.+) non ancora impostato$/, "Logotipo $1 aún no configurado"],
    [/^Apri dettagli farmacia di turno: (.+)$/, "Abrir detalles de la farmacia de guardia: $1"],
    [/^Torna a (.+)$/, "Volver a $1"],
    [/^Apre (.+) alle (.+)$/, "Abre $1 a las $2"],
    [/^Apre alle (.+)$/, "Abre a las $1"],
    [/^Aperto fino alle (.+)$/, "Abierto hasta las $1"],
    [/^(\d+) prodott[oi]$/, "$1 producto"],
    [/^(\d+) prodotti$/, "$1 productos"],
    [/^Prodotti \((\d+)\)$/, "Productos ($1)"],
    [/^Negozi \((\d+)\)$/, "Tiendas ($1)"],
    [/^Pagina (\d+) di (\d+)$/, "Página $1 de $2"],
    [/^(\d+) prodotti per “(.+)” · (\d+) negozi$/, "$1 productos para «$2» · $3 tiendas"],
    [/^(\d+) prodotti per “(.+)” · (\d+) negozio$/, "$1 productos para «$2» · $3 tienda"],
    [/^Edizione (\d{4}): (.+)$/, "Edición $1: $2"],
    [/^(\d+) recension[ei]$/, "$1 reseñas"],
    [/^(\d+) preferit[oi]$/, "$1 favoritos"],
    [/^Vai al negozio (.+)$/, "Ir a la tienda $1"],
    [/^Carrello \((\d+) articol[oi]\)$/, "Carrito ($1 artículos)"],
    [/^Carrello$/, "Carrito"],
    [/^(\d+) articol[oi]$/, "$1 artículos"],
    [/^(\d+) righe$/, "$1 filas"],
    [/^(\d+) per pagina$/, "$1 por página"],
    [/^Logo (.+)$/, "Logotipo $1"],
    [/^Menu utente di (.+)$/, "Menú de usuario de $1"],
    [/^Variante: (.+)$/, "Variante: $1"],
    [/^Mostra immagine (.+)$/, "Mostrar imagen $1"],
    [/^Pacco: (.+) kg ·$/, "Paquete: $1 kg ·"],
    [/^(.+) · fino a (.+) kg$/, "$1 · hasta $2 kg"],
    [/^Prodotti di (.+)$/, "Productos de $1"],
    [/^Mesi di attività: (.+)$/, "Meses de actividad: $1"],
    [/^(\d+) prodotti attivi$/, "$1 productos activos"],
    [/^(\d+) contenuti in archivio$/, "$1 contenidos en archivo"],
    [/^(\d+) milioni di euro$/, "$1 millones de euros"],
    [/^(\d+) mln €$/, "€$1 M"],
    [/^Foto: (.+)$/, "Foto: $1"],
    [/^I prodotti di (.+) non sono disponibili in questo momento\.$/, "Los productos de $1 no están disponibles en este momento."],
  ],
};

/** Mesi italiani dentro date e periodi ("7–17 febbraio"), per lingua. */
const MESI: Record<LinguaTradotta, Array<[RegExp, string]>> = {
  en: [
    [/gennaio/gi, "January"],
    [/febbraio/gi, "February"],
    [/marzo/gi, "March"],
    [/aprile/gi, "April"],
    [/maggio/gi, "May"],
    [/giugno/gi, "June"],
    [/luglio/gi, "July"],
    [/agosto/gi, "August"],
    [/settembre/gi, "September"],
    [/ottobre/gi, "October"],
    [/novembre/gi, "November"],
    [/dicembre/gi, "December"],
  ],
  fr: [
    [/gennaio/gi, "janvier"],
    [/febbraio/gi, "février"],
    [/marzo/gi, "mars"],
    [/aprile/gi, "avril"],
    [/maggio/gi, "mai"],
    [/giugno/gi, "juin"],
    [/luglio/gi, "juillet"],
    [/agosto/gi, "août"],
    [/settembre/gi, "septembre"],
    [/ottobre/gi, "octobre"],
    [/novembre/gi, "novembre"],
    [/dicembre/gi, "décembre"],
  ],
  de: [
    [/gennaio/gi, "Januar"],
    [/febbraio/gi, "Februar"],
    [/marzo/gi, "März"],
    [/aprile/gi, "April"],
    [/maggio/gi, "Mai"],
    [/giugno/gi, "Juni"],
    [/luglio/gi, "Juli"],
    [/agosto/gi, "August"],
    [/settembre/gi, "September"],
    [/ottobre/gi, "Oktober"],
    [/novembre/gi, "November"],
    [/dicembre/gi, "Dezember"],
  ],
  es: [
    [/gennaio/gi, "enero"],
    [/febbraio/gi, "febrero"],
    [/marzo/gi, "marzo"],
    [/aprile/gi, "abril"],
    [/maggio/gi, "mayo"],
    [/giugno/gi, "junio"],
    [/luglio/gi, "julio"],
    [/agosto/gi, "agosto"],
    [/settembre/gi, "septiembre"],
    [/ottobre/gi, "octubre"],
    [/novembre/gi, "noviembre"],
    [/dicembre/gi, "diciembre"],
  ],
};

function sostituisciMesi(testo: string, lingua: LinguaTradotta): string {
  let out = testo;
  for (const [modello, mese] of MESI[lingua]) out = out.replace(modello, mese);
  return out;
}

/** Giorni della settimana e "domani" dentro gli orari di apertura. */
const GIORNI: Record<LinguaTradotta, Array<[RegExp, string]>> = {
  en: [
    [/lunedì/g, "Monday"],
    [/martedì/g, "Tuesday"],
    [/mercoledì/g, "Wednesday"],
    [/giovedì/g, "Thursday"],
    [/venerdì/g, "Friday"],
    [/sabato/g, "Saturday"],
    [/domenica/g, "Sunday"],
    [/domani/g, "tomorrow"],
  ],
  fr: [
    [/lunedì/g, "lundi"],
    [/martedì/g, "mardi"],
    [/mercoledì/g, "mercredi"],
    [/giovedì/g, "jeudi"],
    [/venerdì/g, "vendredi"],
    [/sabato/g, "samedi"],
    [/domenica/g, "dimanche"],
    [/domani/g, "demain"],
  ],
  de: [
    [/lunedì/g, "Montag"],
    [/martedì/g, "Dienstag"],
    [/mercoledì/g, "Mittwoch"],
    [/giovedì/g, "Donnerstag"],
    [/venerdì/g, "Freitag"],
    [/sabato/g, "Samstag"],
    [/domenica/g, "Sonntag"],
    [/domani/g, "morgen"],
  ],
  es: [
    [/lunedì/g, "lunes"],
    [/martedì/g, "martes"],
    [/mercoledì/g, "miércoles"],
    [/giovedì/g, "jueves"],
    [/venerdì/g, "viernes"],
    [/sabato/g, "sábado"],
    [/domenica/g, "domingo"],
    [/domani/g, "mañana"],
  ],
};

function sostituisciGiorni(testo: string, lingua: LinguaTradotta): string {
  let out = testo;
  for (const [modello, giorno] of GIORNI[lingua]) out = out.replace(modello, giorno);
  return out;
}

/** Date italiane ("7 novembre 2026", "7–17 febbraio"). */
const DATA_ITALIANA =
  /^(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(\d{4}))?$/;

/** Compatta gli spazi (anche newline da JSX) e toglie quelli ai bordi. */
export function normalizza(testo: string): string {
  return testo.replace(/\s+/g, " ").trim();
}

/** Entità HTML che il browser rende come caratteri nel testo visibile. */
const ENTITA: Record<string, string> = {
  "&apos;": "'",
  "&#39;": "'",
  "&quot;": '"',
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&amp;": "&",
  "&#224;": "à",
  "&#232;": "è",
  "&#8217;": "’",
  "&#8212;": "—",
};

function decodificaEntita(testo: string): string {
  return testo.replace(/&(?:apos|quot|amp|ldquo|rdquo|#\d+);/g, (entita) => ENTITA[entita] ?? entita);
}

// Le chiavi estratte dal JSX possono contenere entità HTML (`&apos;`, `&quot;`, ...)
// mentre il testo renderizzato dal browser le ha già decodificate: si aggiunge
// la variante decodificata così la voce resta raggiungibile in pagina.
for (const [italiano, inglese] of Object.entries(DIZIONARIO)) {
  const decodificato = decodificaEntita(italiano);
  if (decodificato !== italiano && !Object.prototype.hasOwnProperty.call(DIZIONARIO, decodificato)) {
    DIZIONARIO[decodificato] = inglese;
  }
}

/**
 * Dizionari caricati su richiesta (francese, spagnolo e tedesco). Restano
 * fuori dal bundle iniziale: si scaricano solo quando l'utente sceglie quella
 * lingua.
 */
const DIZIONARI_EXTRA: Partial<Record<LinguaTradotta, Record<string, string>>> = {};

/** Registra il dizionario di una lingua appena caricata. */
export function registraDizionario(
  lingua: LinguaTradotta,
  dizionario: Record<string, string>,
): void {
  DIZIONARI_EXTRA[lingua] = dizionario;
}

function dizionarioPer(lingua: LinguaTradotta): Record<string, string> | undefined {
  return lingua === "en" ? DIZIONARIO : DIZIONARI_EXTRA[lingua];
}

/**
 * Ritorna il testo tradotto nella lingua richiesta, oppure `null` quando la
 * frase non è nel dizionario (resta in italiano, come per l'inglese).
 */
export function traduci(testo: string, lingua: Lingua = "en"): string | null {
  if (lingua === "it") return null;
  return traduciIn(testo, lingua);
}

function traduciIn(testo: string, lingua: LinguaTradotta): string | null {
  const dizionario = dizionarioPer(lingua);
  if (!dizionario) return null;
  const chiave = normalizza(testo);
  if (!chiave) return null;
  if (chiave.includes("&")) {
    const decodificata = normalizza(decodificaEntita(chiave));
    if (decodificata !== chiave) {
      const trovata = traduciIn(decodificata, lingua);
      if (trovata !== null) return trovata;
    }
  }
  // Confronto insensibile al caso: le etichette in MAIUSCOLO ("OFFERTE",
  // "SCOPRI") devono trovare la stessa voce di "Offerte"/"Scopri".
  const varianti = [
    chiave,
    chiave.toUpperCase(),
    chiave.toLowerCase(),
    chiave.charAt(0).toUpperCase() + chiave.slice(1).toLowerCase(),
  ];
  for (const variante of varianti) {
    // SOLO il dizionario della lingua scelta: prima si ripiegava sull'inglese,
    // così una voce mancante in francese/spagnolo/tedesco compariva in inglese
    // in mezzo alla pagina (testo misto). Se manca, resta l'italiano.
    const voce = dizionario[variante];
    if (typeof voce === "string") {
      return chiave === chiave.toUpperCase() ? voce.toUpperCase() : voce;
    }
  }
  // Etichette con conteggio tra parentesi ("Prodotti ( 11 )") e voci tra
  // virgolette ("“ Alimentari ”"): si traduce la parte interna con le stesse
  // regole, così i filtri seguono la lingua dei conteggi che mostrano.
  const conteggio = chiave.match(/^(.*?)\s*\(\s*(\d+)\s*\)$/);
  if (conteggio) {
    const interno = traduciIn(conteggio[1], lingua);
    if (interno !== null) return interno + " (" + conteggio[2] + ")";
  }
  const virgolette = chiave.match(/^[“"](.+?)[”"]$/);
  if (virgolette) {
    const interno = traduciIn(virgolette[1], lingua);
    if (interno !== null) return "“" + interno + "”";
  }
  // Etichette con i due punti finali ("Raccolta :", "Periodo in corso:"):
  // si traduce il titolo e restano tradotti i mesi o i giorni che contiene.
  const duePunti = chiave.match(/^(.+?)\s*:$/);
  if (duePunti) {
    const interno = traduciIn(duePunti[1], lingua);
    if (interno !== null) {
      return sostituisciGiorni(sostituisciMesi(interno + ":", lingua), lingua);
    }
  }

  // Etichetta con la parentesi aperta e il conteggio in un nodo separato
  // ("Tutti (", "Alimentari ("): si traduce la parte prima della parentesi.
  const parentesiAperta = chiave.match(/^(.*?)\s*\($/);
  if (parentesiAperta) {
    const interno = traduciIn(parentesiAperta[1], lingua);
    if (interno !== null) return interno + " (";
  }

  if (DATA_ITALIANA.test(chiave)) return sostituisciMesi(chiave, lingua);

  for (const [modello, tradotto] of MOTIVI[lingua]) {
    if (modello.test(chiave)) {
      return sostituisciGiorni(sostituisciMesi(chiave.replace(modello, tradotto), lingua), lingua);
    }
  }
  return null;
}
