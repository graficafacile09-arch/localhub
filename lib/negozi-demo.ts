import { calcolaPunteggioNegozio, filtraNegoziPerPertinenza } from "./ranking-negozi";

export type NegozioDemo = {
  id: string;
  nome: string;
  categoria: string;
  descrizione: string;
  indirizzo: string;
  telefono: string;
  email: string;
  whatsapp: string;
  sito_web: string;
  orari: string;
  immagine: string;
  parole_chiave: string[];
};

export type ProdottoDemo = {
  id: string;
  negozio_id: string;
  nome: string;
  descrizione: string;
  categoria: string;
  prezzo: number;
};

const sinonimiRicerca: Record<string, string[]> = {
  beauty: ["beauty", "bellezza", "parrucchiere", "parrucchieri", "barber", "barbiere", "estetica", "estetista", "trucco", "makeup", "make-up", "benessere", "capelli", "taglio", "piega", "barba", "skincare"],
  casa: ["casa", "arredo", "arredamento", "mobili", "interior", "decorazioni", "illuminazione", "cucina", "salotto", "camera", "divano", "tavolo"],
  auto: ["auto", "macchina", "officina", "gomme", "pneumatici", "tagliando", "meccanico", "carrozzeria", "revisione", "olio", "freni", "batteria", "concessionaria"],
  salute: ["salute", "farmacia", "parafarmacia", "medicinali", "integratori", "benessere", "sanitaria", "febbre", "raffreddore", "mal", "testa", "dolore", "ricetta", "analisi", "antibiotico"],
  tech: ["tech", "tecnologia", "elettronica", "telefonia", "cellulari", "cellulare", "smartphone", "computer", "pc", "tablet", "accessori", "riparazioni", "monitor", "stampante", "ricarica"],
  bimbi: ["bimbi", "bambini", "giocattoli", "giocattolo", "infanzia", "scuola", "cartoleria", "neonati", "prima", "infanzia", "zaino", "pannolini", "didattico"],
  sport: ["sport", "fitness", "palestra", "allenamento", "running", "yoga", "pilates", "abbigliamento", "sportivo", "workout", "tapis", "roulant", "pesi", "training"],
  moda: ["moda", "abbigliamento", "boutique", "vestiti", "vestito", "scarpe", "calzature", "elegante", "eleganti", "outfit"],
  pet: ["pet", "animali", "animale", "cani", "cane", "gatti", "gatto", "veterinario", "veterinaria", "toelettatura", "crocchette", "shop", "zecche", "zecca", "pulci", "pulce", "antiparassitario", "antiparassitari", "cucciolo", "croccantini", "lettiera", "guinzaglio", "mangime"],
};

const stopWordsRicerca = new Set([
  "a",
  "ad",
  "al",
  "alla",
  "alle",
  "allo",
  "ai",
  "agli",
  "all",
  "che",
  "chi",
  "con",
  "da",
  "dei",
  "del",
  "della",
  "delle",
  "dello",
  "di",
  "e",
  "gli",
  "ha",
  "hai",
  "ho",
  "i",
  "il",
  "in",
  "io",
  "la",
  "le",
  "lo",
  "mia",
  "mio",
  "mie",
  "miei",
  "mi",
  "nelle",
  "nella",
  "nel",
  "nei",
  "per",
  "serve",
  "servono",
  "servire",
  "se",
  "sul",
  "sulla",
  "sulle",
  "sui",
  "su",
  "tra",
  "devo",
  "fare",
  "un",
  "una",
  "uno",
]);

function normalizzaTesto(testo: string) {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function radice(termine: string) {
  if (termine.length <= 4) {
    return termine;
  }

  return termine.replace(/[aeiou]$/i, "");
}

function attivaGruppo(termine: string, voce: string) {
  const termineNorm = normalizzaTesto(termine).trim();
  const voceNorm = normalizzaTesto(voce).trim();

  if (!termineNorm || !voceNorm) {
    return false;
  }

  if (termineNorm === voceNorm) {
    return true;
  }

  return radice(termineNorm) === radice(voceNorm);
}

function normalizzaTermini(query: string) {
  const terminiBase = normalizzaTesto(query)
    .split(/[^a-z0-9]+/)
    .map((termine) => termine.trim())
    .filter((termine) => termine && !stopWordsRicerca.has(termine));

  const terminiEspansi = new Set(terminiBase);

  for (const termine of terminiBase) {
    for (const gruppo of Object.values(sinonimiRicerca)) {
      if (gruppo.some((voce) => attivaGruppo(termine, voce))) {
        gruppo.forEach((voce) => terminiEspansi.add(voce));
      }
    }
  }

  return Array.from(terminiEspansi);
}



export const negoziDemo: NegozioDemo[] = [
  {
    id: "demo-beauty-1",
    nome: "Atelier Bellezza",
    categoria: "Beauty",
    descrizione:
      "Centro beauty specializzato in skincare, make-up e trattamenti viso personalizzati.",
    indirizzo: "Via Roma 24, Centro",
    telefono: "333 1200456",
    email: "ciao@atelierbellezza.it",
    whatsapp: "333 1200456",
    sito_web: "www.atelierbellezza.it",
    orari: "Lun-Sab 09:00 - 19:30",
    immagine: "beauty.svg",
    parole_chiave: ["parrucchiere", "barber", "estetista", "trucco", "make-up", "skincare", "viso", "beauty center"],
  },
  {
    id: "demo-casa-1",
    nome: "Casa Moderna",
    categoria: "Casa",
    descrizione:
      "Showroom di arredo contemporaneo con complementi, luci decorative e consulenza d'interni.",
    indirizzo: "Corso Italia 81, Centro",
    telefono: "333 4821907",
    email: "info@casamoderna.it",
    whatsapp: "333 4821907",
    sito_web: "www.casamoderna.it",
    orari: "Mar-Sab 10:00 - 13:00 / 16:00 - 20:00",
    immagine: "casa.svg",
    parole_chiave: ["arredamento", "mobili", "interior design", "decorazioni", "lampade", "showroom", "cucine", "salotto"],
  },
  {
    id: "demo-auto-1",
    nome: "Auto Point Service",
    categoria: "Auto",
    descrizione:
      "Officina e centro servizi auto per manutenzione, pneumatici, check-up e assistenza rapida.",
    indirizzo: "Viale Europa 12, Zona Sud",
    telefono: "333 7745102",
    email: "service@autopoint.it",
    whatsapp: "333 7745102",
    sito_web: "www.autopointservice.it",
    orari: "Lun-Ven 08:30 - 18:30",
    immagine: "auto.svg",
    parole_chiave: ["officina", "meccanico", "tagliando", "pneumatici", "gomme", "batteria", "revisione", "assistenza auto"],
  },
  {
    id: "demo-salute-1",
    nome: "Salus Farma",
    categoria: "Salute",
    descrizione:
      "Farmacia di quartiere con prodotti benessere, parafarmacia e consulenza professionale.",
    indirizzo: "Piazza Garibaldi 5, Centro",
    telefono: "333 9081176",
    email: "contatti@salusfarma.it",
    whatsapp: "333 9081176",
    sito_web: "www.salusfarma.it",
    orari: "Lun-Sab 08:30 - 20:00",
    immagine: "salute.svg",
    parole_chiave: ["farmacia", "parafarmacia", "integratori", "medicinali", "vitamine", "autoanalisi", "salute", "benessere"],
  },
  {
    id: "demo-tech-1",
    nome: "Tech Lab Store",
    categoria: "Tech & Elettronica",
    descrizione:
      "Negozio di tecnologia con smartphone, accessori, assistenza e configurazioni su misura.",
    indirizzo: "Via Verdi 37, Centro",
    telefono: "333 6512088",
    email: "hello@techlabstore.it",
    whatsapp: "333 6512088",
    sito_web: "www.techlabstore.it",
    orari: "Lun-Sab 09:30 - 19:30",
    immagine: "elettronica.svg",
    parole_chiave: ["smartphone", "cellulari", "telefonia", "computer", "pc", "tablet", "riparazioni", "accessori tech"],
  },
  {
    id: "demo-bimbi-1",
    nome: "Mondo Bimbi",
    categoria: "Bimbi & Giocattoli",
    descrizione:
      "Articoli per l'infanzia, giochi educativi, idee regalo e prodotti per la scuola.",
    indirizzo: "Via Manzoni 18, Quartiere Nord",
    telefono: "333 3402214",
    email: "info@mondobimbi.it",
    whatsapp: "333 3402214",
    sito_web: "www.mondobimbi.it",
    orari: "Lun-Sab 09:00 - 13:00 / 16:00 - 19:30",
    immagine: "bimbi.svg",
    parole_chiave: ["giocattoli", "bambini", "infanzia", "scuola", "cartoleria", "zaini", "regali bimbi", "prima infanzia"],
  },
  {
    id: "demo-sport-1",
    nome: "Urban Sport Hub",
    categoria: "Sport & Fitness",
    descrizione:
      "Abbigliamento sportivo, accessori training e consulenza per fitness e attività outdoor.",
    indirizzo: "Via Torino 55, Zona Ovest",
    telefono: "333 2198740",
    email: "team@urbansporthub.it",
    whatsapp: "333 2198740",
    sito_web: "www.urbansporthub.it",
    orari: "Lun-Sab 09:30 - 20:00",
    immagine: "sport.svg",
    parole_chiave: ["palestra", "fitness", "running", "yoga", "pilates", "abbigliamento sportivo", "training", "workout"],
  },
  {
    id: "demo-pet-1",
    nome: "Amici a Quattro Zampe",
    categoria: "Pet Shop & Animali",
    descrizione:
      "Pet shop con alimentazione, giochi, accessori e servizi dedicati a cane, gatto, cani e gatti.",
    indirizzo: "Via Leopardi 9, Quartiere Est",
    telefono: "333 7614509",
    email: "shop@4zampe.it",
    whatsapp: "333 7614509",
    sito_web: "www.amicia4zampe.it",
    orari: "Lun-Sab 09:00 - 19:30",
    immagine: "pet.svg",
    parole_chiave: ["pet shop", "animali", "cane", "gatto", "cani", "gatti", "crocchette", "toelettatura", "guinzagli", "accessori pet"],
  },
];

export const prodottiDemo: ProdottoDemo[] = [
  {
    id: "prod-demo-beauty-1",
    negozio_id: "demo-beauty-1",
    nome: "Trattamento Glow Viso",
    descrizione: "Percorso illuminante con detersione, maschera e idratazione profonda.",
    categoria: "Skincare",
    prezzo: 39,
  },
  {
    id: "prod-demo-beauty-2",
    negozio_id: "demo-beauty-1",
    nome: "Make-up Evento",
    descrizione: "Servizio make-up professionale per cerimonie, shooting ed eventi speciali.",
    categoria: "Make-up",
    prezzo: 55,
  },
  {
    id: "prod-demo-casa-1",
    negozio_id: "demo-casa-1",
    nome: "Lampada Design Soft",
    descrizione: "Lampada da tavolo minimal con luce calda e finiture moderne.",
    categoria: "Illuminazione",
    prezzo: 89,
  },
  {
    id: "prod-demo-casa-2",
    negozio_id: "demo-casa-1",
    nome: "Consulenza Arredo",
    descrizione: "Progetto su misura per valorizzare soggiorno, camera o ufficio domestico.",
    categoria: "Interior",
    prezzo: 120,
  },
  {
    id: "prod-demo-auto-1",
    negozio_id: "demo-auto-1",
    nome: "Tagliando Completo",
    descrizione: "Controllo generale, cambio olio, filtri e verifica sicurezza del veicolo.",
    categoria: "Officina",
    prezzo: 149,
  },
  {
    id: "prod-demo-auto-2",
    negozio_id: "demo-auto-1",
    nome: "Cambio Pneumatici",
    descrizione: "Servizio rapido di sostituzione e bilanciatura pneumatici.",
    categoria: "Gomme",
    prezzo: 45,
  },
  {
    id: "prod-demo-salute-1",
    negozio_id: "demo-salute-1",
    nome: "Kit Benessere Invernale",
    descrizione: "Integratori, tisane e prodotti utili per affrontare la stagione fredda.",
    categoria: "Benessere",
    prezzo: 29,
  },
  {
    id: "prod-demo-salute-2",
    negozio_id: "demo-salute-1",
    nome: "Autoanalisi Rapida",
    descrizione: "Servizio di controllo rapido con supporto del personale specializzato.",
    categoria: "Servizi Farmacia",
    prezzo: 18,
  },
  {
    id: "prod-demo-tech-1",
    negozio_id: "demo-tech-1",
    nome: "Smartphone X Pro",
    descrizione: "Telefono di ultima generazione con fotocamera avanzata e memoria espandibile.",
    categoria: "Telefonia",
    prezzo: 699,
  },
  {
    id: "prod-demo-tech-2",
    negozio_id: "demo-tech-1",
    nome: "Setup PC e Trasferimento Dati",
    descrizione: "Configurazione iniziale, aggiornamenti e migrazione completa dei contenuti.",
    categoria: "Assistenza",
    prezzo: 79,
  },
  {
    id: "prod-demo-bimbi-1",
    negozio_id: "demo-bimbi-1",
    nome: "Zaino Scuola Explorer",
    descrizione: "Zaino leggero e resistente con spazi organizzati per scuola e tempo libero.",
    categoria: "Scuola",
    prezzo: 42,
  },
  {
    id: "prod-demo-bimbi-2",
    negozio_id: "demo-bimbi-1",
    nome: "Gioco Educativo Creativo",
    descrizione: "Set didattico pensato per stimolare fantasia, logica e manualità.",
    categoria: "Giocattoli",
    prezzo: 27,
  },
  {
    id: "prod-demo-sport-1",
    negozio_id: "demo-sport-1",
    nome: "Completo Training DryFit",
    descrizione: "Outfit tecnico traspirante ideale per palestra, running e allenamento funzionale.",
    categoria: "Abbigliamento Sportivo",
    prezzo: 64,
  },
  {
    id: "prod-demo-sport-2",
    negozio_id: "demo-sport-1",
    nome: "Tappetino Yoga Pro",
    descrizione: "Tappetino antiscivolo ad alta densità per yoga, stretching e pilates.",
    categoria: "Accessori Fitness",
    prezzo: 34,
  },
  {
    id: "prod-demo-pet-1",
    negozio_id: "demo-pet-1",
    nome: "Crocchette Premium Adult",
    descrizione: "Alimento completo con ingredienti selezionati per il benessere quotidiano del cane.",
    categoria: "Alimentazione",
    prezzo: 26,
  },
  {
    id: "prod-demo-pet-2",
    negozio_id: "demo-pet-1",
    nome: "Toelettatura Base",
    descrizione: "Bagno, asciugatura e cura del mantello per animali di piccola e media taglia.",
    categoria: "Servizi Pet",
    prezzo: 30,
  },
];

export function getNegozioDemoById(id: string) {
  return negoziDemo.find((negozio) => negozio.id === id) ?? null;
}

export function cercaNegoziDemo(query: string) {
  const termini = normalizzaTermini(query);

  if (termini.length === 0) {
    return [];
  }

  const filtrati = negoziDemo.filter(
    (negozio) => calcolaPunteggioNegozio(negozio, termini.join(" ")) > 0
  );

  return filtraNegoziPerPertinenza(filtrati, termini.join(" "));
}

export function getProdottiDemoByNegozioId(negozioId: string) {
  return prodottiDemo.filter((prodotto) => prodotto.negozio_id === negozioId);
}

export function espandiQueryConSinonimi(query: string) {
  return normalizzaTermini(query).join(" ");
}
