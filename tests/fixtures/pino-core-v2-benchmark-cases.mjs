/**
 * Pino Core v2 benchmark corpus.
 * 150 hand-labelled, realistic utterances. Labels describe intent, not catalog availability.
 * Keep this dataset independent from production Pino and never use it to fabricate model scores.
 */
const groups = [
  ["products-it", "catalog", "products", [
    "Cerco pasta", "Mi trovi del pane", "Vorrei comprare olio extravergine", "Sto cercando formaggio",
    "Trovami biscotti artigianali", "Mi servono scarpe", "Cerco un orologio", "Vorrei una borsa",
    "Mi trovi un profumo", "Cerco una giacca", "Dove compro un portafoglio", "Mi serve un regalo",
    "Cerco cuffie bluetooth", "Vorrei una maglietta", "Trovami un computer portatile"
  ]],
  ["products-en", "catalog", "products", [
    "I'm looking for a watch", "Find me some shoes", "I need a leather wallet", "Show me handbags",
    "Can you find a jacket?", "I want a perfume", "Looking for headphones", "Please find a backpack",
    "I need a phone", "Show me sunglasses", "I'm after a dress", "Find a pair of jeans",
    "I want a laptop", "Can you find a gift?", "Looking for a shirt"
  ]],
  ["stores-it", "catalog", "stores", [
    "Cerco un parrucchiere", "Mi trovi un dentista", "Vorrei un idraulico", "Cerco un elettricista",
    "Mi serve un meccanico", "Trova un veterinario", "Cerco un barbiere", "Mi trovi un'estetista",
    "Vorrei un ristorante", "Cerco una pizzeria", "Dove trovo un commercialista", "Mi serve un fotografo",
    "Cerco un negozio di fiori", "Mi trovi un sarto", "Cerco un'impresa di pulizie"
  ]],
  ["stores-en", "catalog", "stores", [
    "Find me a hairdresser", "I need a dentist", "Looking for a plumber", "Show me electricians",
    "I need a mechanic", "Find a vet near me", "Looking for a barber", "Can you find a restaurant?",
    "I need a pizzeria", "Find a photographer", "Looking for a tailor", "I need a cleaning service",
    "Show me local shops", "Find a doctor", "I'm looking for a florist"
  ]],
  ["budget", "catalog", "products", [
    "Cerco pasta sotto 5 euro", "Mi trovi un orologio sotto 100 euro", "Scarpe tra 50 e 120 euro",
    "Vorrei una borsa al massimo 80 euro", "Cerco un regalo meno di 30 euro", "Mi serve una giacca sopra 40 euro",
    "Find a watch under 100 euros", "Shoes between 40 and 90 euros", "A wallet below 25 euros",
    "Show me bags up to 60 euros", "Cerco olio entro 15 euro", "Vorrei biscotti massimo 8 euro",
    "Mi trovi cuffie non oltre 50 euro", "Looking for a laptop over 300 euros", "Find perfume at least 20 euros"
  ]],
  ["constraints", "catalog", "products", [
    "Cerco pasta senza glutine", "Mi trovi una borsa rossa", "Vorrei scarpe da uomo in pelle",
    "Cerco un orologio impermeabile", "Mi serve una giacca taglia M", "Find a black leather wallet",
    "Show me silver watches", "Looking for a red handbag", "I need gluten free pasta",
    "Find shoes without leather", "Cerco una maglietta di cotone", "Vorrei un profumo da donna",
    "Mi trovi un regalo per mia madre", "Cerco cuffie senza fili", "Find a blue backpack"
  ]],
  ["colloquial-typos", "catalog", "products", [
    "Oh Pino mi trovi un orologgio?", "Mi servirebbe na borsa carina", "Hai mica pasta buona?",
    "Cerco scarpe da ginnastica ma non troppo care", "Mi dai una mano a trovare un profumo",
    "Un regalino per la mia ragazza sui 30 euro", "Mi occorre un paio di occhiali da sole",
    "Pino, dove posso beccare un portafoglio?", "Avete qualcosa tipo cuffie bluetooth?",
    "Sto a cerca' un giubbotto", "Mi trovi un orologio che non costi assai",
    "Una cosa elegante da regalare a mio padre", "Cerco na giacca taglia L",
    "Mi trovi un paio di scarpe comode?", "Mi serve qualcosa per ascoltare musica"
  ]],
  ["conversation", "conversation", "none", [
    "Ciao", "Buongiorno Pino", "Ciao Pino, come stai?", "Ti va di fare due chiacchiere?",
    "Come va oggi?", "Grazie mille", "Perfetto, grazie", "Hey, how are you?",
    "Would you like to chat?", "Good morning", "Thanks for your help", "That's great, thank you",
    "Ciao, tutto bene?", "Ci sei?", "Tell me a joke"
  ]],
  ["attractions", "attractions", "none", [
    "Cosa posso visitare a Castrovillari?", "Quali sono le attrazioni?", "Cosa vedere nel centro storico",
    "Fammi un itinerario turistico", "Ci sono monumenti da visitare?", "Vorrei conoscere i dintorni",
    "What can I visit in Castrovillari?", "Show me tourist attractions", "Places to visit nearby",
    "What should I see in town?", "Ci sono borghi da vedere?", "Consigliami un tour",
    "Vorrei visitare La Civita", "Quali luoghi interessanti ci sono?", "Things to see around here"
  ]],
  ["events", "events", "none", [
    "Quali eventi ci sono questo weekend?", "Ci sono concerti in programma?", "Cerca le sagre",
    "Che manifestazioni ci sono?", "Vorrei vedere le mostre", "Quando c'è il festival?",
    "Show me upcoming events", "Any concerts this weekend?", "What festivals are on?",
    "Find exhibitions", "Ci sono fiere in città?", "Eventi per bambini",
    "Cosa succede stasera in città?", "Calendario degli eventi", "Are there any local shows?"
  ]],
  ["weather-pharmacy", "mixed", "none", [
    "Che tempo fa domani?", "Pioverà oggi?", "Dammi le previsioni meteo", "Is it raining now?",
    "Weather forecast for tomorrow", "Quale farmacia è di turno?", "Farmacie aperte ora",
    "Find the pharmacy on duty", "Where is a pharmacy?", "Che temperatura ci sarà?",
    "Meteo per il fine settimana", "Is the weather sunny today?", "Mi serve una farmacia",
    "Pharmacies open now", "Previsioni del tempo a Castrovillari"
  ]]
];

export const pinoBenchmarkCases = groups.flatMap(([group, route, surface, utterances]) =>
  utterances.map((text, index) => ({
    id: `${group}-${String(index + 1).padStart(2, "0")}`,
    group,
    text,
    expected: {
      route: group === "weather-pharmacy"
        ? (/farmac|pharmacy/i.test(text) ? "pharmacies" : "weather")
        : route,
      surface: group === "weather-pharmacy"
        ? (/farmac|pharmacy/i.test(text) ? "stores" : "none")
        : surface
    }
  }))
);

if (pinoBenchmarkCases.length !== 150) {
  throw new Error(`Benchmark corpus must contain 150 cases; found ${pinoBenchmarkCases.length}`);
}
