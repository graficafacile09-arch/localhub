/**
 * Interfaccia pubblica: testi che restavano in italiano dopo il passaggio a EN.
 *
 * Raccolti confrontando l'HTML reale delle pagine pubbliche con `DIZIONARIO`
 * (vedi `.backup-i18n-20261114/estrai.cjs`). Restano fuori, come da regola dei
 * dizionari storici, i dati: nomi e descrizioni dei prodotti, nomi dei negozi,
 * titoli e testi delle notizie, indirizzi, toponimi e contenuti editoriali.
 *
 * Viene fuso in `DIZIONARIO` per ultimo, così queste voci completano quelle
 * già presenti senza modificarle.
 */
export const DIZIONARIO_INTERFACCIA: Record<string, string> = {
  // ── Ricerca, navigazione, lingua ───────────────────────────────────────
  "Cerca prodotti e attività": "Search products and businesses",
  "Torna alla pagina precedente": "Go back to the previous page",
  "Stagionalità": "Seasonality",
  "Stagionalità in Calabria": "Seasonality in Calabria",
  "Passa all'inglese": "Switch to English",
  "Passa all'italiano": "Switch to Italian",
  "Apri la stagionalità delle produzioni calabresi":
    "Open the seasonality of Calabrian produce",
  "negozi in": "shops in",
  "prodotti per": "products for",
  "Torna alla pagina precedente.": "Go back to the previous page.",

  // ── Titoli di sezione e testi di servizio ──────────────────────────────
  "Aziende del territorio": "Local businesses",
  "Catalogo delle imprese": "Business catalogue",
  "Territori di Radici Calabria": "Territories of Radici Calabria",
  "Vetrina territoriale": "Territorial showcase",
  "Dal territorio": "From the territory",
  "Promozioni": "Promotions",
  "Assistenza": "Support",
  "Opportunità": "Opportunities",
  "Eccellenza": "Excellence",
  "Vini autoctoni": "Native wines",
  "Categorie delle notizie": "News categories",
  "Notizia": "News item",
  "Evento": "Event",
  "Prossimi appuntamenti": "Upcoming events",
  "Precedenti": "Previous",
  "Ricotta e latticini tradizionali": "Ricotta and traditional dairy products",
  "Caricamento foto ufficiale": "Loading official photo",
  "Calendario per periodo": "Calendar by period",
  "Fonti documentali": "Documentary sources",
  "Fonti:": "Sources:",
  "Periodo in corso:": "Current period:",
  "periodo in corso": "current period",
  "Tutto l'anno": "All year round",
  "Mesi di attività": "Active months",
  "livelli pre-pandemia = 100": "pre-pandemic levels = 100",

  // ── Homepage: banda commercianti e accento della hero ──────────────────
  "Porta la tua realtà dentro": "Bring your business into",
  "che produce": "that produces",
  "La Calabria": "Calabria",
  "Tradizione, qualità e futuro.": "Tradition, quality and the future.",

  // ── Territorio e filiere ───────────────────────────────────────────────
  "Parchi": "Parks",
  "Aree territoriali": "Territorial areas",
  "Comuni": "Municipalities",
  "ARCEA — liquidato nell'ultimo anno: 282 mln €":
    "ARCEA — paid out in the last year: €282m",
  "Bando SRE01 — insediamento giovani agricoltori under 41: 44 mln €":
    "Call SRE01 — young farmer settlement under 41: €44m",
  "TuttoFood — Milano (aziende): 133": "TuttoFood — Milan (businesses): 133",
  "Vinitaly — Verona (cantine): 100": "Vinitaly — Verona (wineries): 100",

  // ── Categorie, reparti e filtri ────────────────────────────────────────
  "Alimenti": "Foodstuffs",
  "Conserve": "Preserves",
  "Dolciumi": "Sweets",
  "Dolci": "Sweets",
  "Dolci tipici calabresi": "Typical Calabrian sweets",
  "Biscotti tipici": "Typical biscuits",
  "Prodotti da forno": "Baked goods",
  "Vini": "Wines",
  "Vini rossi": "Red wines",
  "Miele": "Honey",
  "Olio": "Oil",
  "Olio e condimenti": "Oil and condiments",
  "Ortaggi tipici": "Local vegetables",
  "Pasta tipica": "Local pasta",
  "Castagne": "Chestnuts",
  "Funghi di bosco": "Wild mushrooms",
  "Noci e nocciole": "Walnuts and hazelnuts",
  "Olive da olio": "Olives for oil",
  "Formaggi e latticini": "Cheese and dairy",
  "Carni e salumi": "Meat and cured meats",
  "Coltivazioni e ortaggi": "Crops and vegetables",
  "Prodotti del bosco": "Forest products",
  "Trasformazioni alimentari": "Food processing",
  "Sott'oli e sott'aceti": "Oil and vinegar preserves",
  "Passata e conserve di pomodoro": "Tomato passata and preserves",
  "Essiccazione di peperoncino e fichi": "Drying of chilli peppers and figs",
  "Ortaggi estivi (pomodoro, melanzana, peperone)":
    "Summer vegetables (tomato, aubergine, pepper)",
  "Ortaggi autunno-invernali (cavolo, broccolo, finocchio, spinacio)":
    "Autumn-winter vegetables (cabbage, broccoli, fennel, spinach)",
  "Grano duro e altri cereali": "Durum wheat and other cereals",
  "Vino e viticoltura": "Wine and viticulture",
  "Olio e olivicoltura": "Olive oil and olive growing",

  // ── Categorie delle notizie ────────────────────────────────────────────
  "Agricoltura calabrese": "Calabrian agriculture",
  "Eventi e fiere": "Events and fairs",
  "Prodotti tipici e qualità": "Local products and quality",
  "Filiere e produzioni": "Supply chains and production",
  "Politiche agricole e finanziamenti": "Agricultural policy and funding",
  "Mercati ed esportazioni": "Markets and exports",
  "Innovazione e ricerca": "Innovation and research",
  "Territori e biodiversità": "Territories and biodiversity",

  // ── Stagionalità: colture, fasi e lavorazioni ──────────────────────────
  "Viticoltura": "Viticulture",
  "Olivicoltura": "Olive growing",
  "Apicoltura": "Beekeeping",
  "Raccolta": "Harvest",
  "Trapianto": "Transplanting",
  "Semina": "Sowing",
  "Fioritura": "Flowering",
  "Fioriture agrumi": "Citrus flowering",
  "Fioritura castagno": "Chestnut flowering",
  "Vendemmia": "Grape harvest",
  "Vinificazione": "Winemaking",
  "Affinamento": "Ageing",
  "Potatura": "Pruning",
  "Invaiatura": "Veraison",
  "Molitura": "Milling",
  "Olio nuovo": "New oil",
  "Produzione": "Production",
  "Stagionatura": "Ageing",
  "Essiccazione": "Drying",
  "Asciugatura": "Drying",
  "Coltivazione": "Cultivation",
  "Conservazione": "Preservation",
  "Smielatura e confezionamento": "Honey extraction and packaging",
  "Preparazione e insacco": "Preparation and stuffing",
  "Lavorazione e insacco": "Processing and stuffing",
  "Stagionatura semiduro (60–90 gg)": "Semi-cured ageing (60–90 days)",
  "Stagionatura oltre 90 gg": "Ageing over 90 days",
  "Stagionatura (30 gg – 1 anno)": "Ageing (30 days – 1 year)",
  "Stagionatura (minimo 45 gg)": "Ageing (minimum 45 days)",
  "Conservazione in cella refrigerata (4–6 °C)": "Cold-room storage (4–6 °C)",
  "Asciugatura (circa un mese)": "Drying (about one month)",
  "Raccolta Navelina": "Navelina harvest",
  "Raccolta Vaniglia": "Vaniglia harvest",
  "Raccolta Tondo Piatta": "Tondo Piatta harvest",
  "Raccolta Mezza Campana": "Mezza Campana harvest",
  "Raccolta Allungata": "Allungata harvest",
  "raccolta": "harvest",
  "raccolta dei frutti": "fruit harvest",
  "raccolta e avvio dell'essiccazione": "harvest and start of drying",
  "raccolta, molitura e olio nuovo": "harvest, milling and new oil",
  "raccolta degli ecotipi primaticcio, medio e tardivo":
    "harvest of the early, mid and late ecotypes",
  "preparazione e stagionatura": "preparation and ageing",
  "produzione e stagionatura": "production and ageing",
  "salatura e stagionatura": "salting and ageing",
  "lavorazioni casearie": "dairy processing",
  "lavorazioni casearie e stagionatura": "dairy processing and ageing",
  "fioriture, raccolta e smielatura": "flowering, harvesting and honey extraction",
  "trasformazione": "processing",
  "laboratori aziendali": "farm labs",
  "laboratori aziendali e piccole imprese della piana":
    "farm labs and small businesses of the plain",
  "tutto il territorio regionale": "the whole regional territory",
  "pianure costiere e aree irrigue": "coastal plains and irrigated areas",
  "colline e pianure costiere": "hills and coastal plains",
  "aree collinari e pedemontane": "hilly and foothill areas",
  "Sila e territori indicati dal disciplinare":
    "Sila and the areas set by the specification",
  "Disciplinare cipolla IGP": "Onion IGP specification",

  "Essiccazione e conservazione": "Drying and storage",
  "Ciclo della vite": "Vine cycle",
  "Miele calabrese": "Calabrian honey",
  "Arance (Navelina e Vaniglia)": "Oranges (Navelina and Vaniglia)",
  "Le attività raggruppate nei sei bimestri dell'anno.":
    "Activities grouped into the six two-month periods of the year.",
  "Raccolta delle olive, molitura e produzione dell'olio.":
    "Olive harvest, milling and oil production.",
  "Olive da olio (raccolta, molitura e olio nuovo) .":
    "Olives for oil (harvest, milling and new oil) .",
  "Miele calabrese (fioriture, raccolta e smielatura) .":
    "Calabrian honey (flowering, harvest and extraction) .",
  "Castagne (raccolta); Funghi di bosco (raccolta) .":
    "Chestnuts (harvest); Wild mushrooms (harvest) .",
  "Mesi di attività: Tutto l'anno": "Active months: all year round",
  "Raccolta dichiarata dal Consorzio: da ottobre a febbraio.":
    "Harvest declared by the Consortium: from October to February.",
  "Stagionatura minima di 45 giorni secondo il disciplinare.":
    "Minimum ageing of 45 days under the specification.",
  "potatura, fioritura, invaiatura, vendemmia e vinificazione":
    "pruning, flowering, veraison, grape harvest and winemaking",
  "Fioriture, raccolta del miele e produzioni tradizionali.":
    "Flowering, honey harvest and traditional production.",
  "Calendario di raccolta per ecotipo e zona di produzione.":
    "Harvest calendar by ecotype and production area.",
  "52 comuni tra le province di Crotone, Catanzaro e Cosenza":
    "52 municipalities across the provinces of Crotone, Catanzaro and Cosenza",
  "agrumeti della piana, castagneti di Sila e Aspromonte":
    "citrus groves of the plain, chestnut woods of Sila and Aspromonte",
  "Novembre – Dicembre — Novembre": "November – December — November",
  "Radici Calabria · servizio informativo": "Radici Calabria · information service",

  // ── Mesi abbreviati (grafici e calendari) ─────────────────────────────
  Gen: "Jan",
  Mag: "May",
  Giu: "Jun",
  Lug: "Jul",
  Ago: "Aug",
  Set: "Sep",
  Ott: "Oct",
  Dic: "Dec",

  // ── Condizioni di vendita ──────────────────────────────────────────────
  "fornire dati corretti e aggiornati;": "provide accurate and up-to-date data;",
  "utilizzare legittimamente la piattaforma e l'account;":
    "use the platform and the account lawfully;",
  "autorizzare e utilizzare correttamente i pagamenti;":
    "authorise and use payments correctly;",
  "non effettuare ordini fraudolenti o contestazioni abusive;":
    "not place fraudulent orders or file abusive complaints;",
  "comunicare in modo corretto e pertinente nei reclami;":
    "communicate correctly and relevantly in complaints;",
};
