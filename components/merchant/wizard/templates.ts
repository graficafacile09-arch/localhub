export type TemplateNegozio = {
  id: string;
  nome: string;
  descrizione: string;
  icone: string[];
  categorieConsigliate: string[];
  moduli_attivi: string[];
  defaultColor?: { primary: string; secondary: string; accent: string };
};

const TEMPLATES: TemplateNegozio[] = [
  {
    id: "base",
    nome: "Negozio Base",
    descrizione: "Template generico per qualsiasi tipo di attività commerciale. Contiene tutti i moduli essenziali.",
    icone: ["🏪"],
    categorieConsigliate: ["Alimentari", "Abbigliamento", "Tecnologia", "Casa"],
    moduli_attivi: ["informazioni", "immagini", "prodotti", "servizi", "offerte", "eventi", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni"],
  },
  {
    id: "ristorante",
    nome: "Ristorante",
    descrizione: "Per ristoranti, trattorie, osterie e locali con servizio al tavolo. Include menu, prenotazioni e delivery.",
    icone: ["🍝", "🍷"],
    categorieConsigliate: ["Ristorante", "Trattoria", "Osteria", "Cucina tipica"],
    moduli_attivi: ["informazioni", "immagini", "servizi", "offerte", "eventi", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni"],
  },
  {
    id: "bar",
    nome: "Bar",
    descrizione: "Per bar, caffetterie, pub e locali di tendenza. Ottimizzato per orari e promozioni giornaliere.",
    icone: ["☕", "🥐"],
    categorieConsigliate: ["Bar", "Caffetteria", "Pub", "Birreria"],
    moduli_attivi: ["informazioni", "immagini", "offerte", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni"],
  },
  {
    id: "pizzeria",
    nome: "Pizzeria",
    descrizione: "Per pizzerie al taglio, da asporto e con servizio ai tavoli. Include menu e delivery.",
    icone: ["🍕", "🍺"],
    categorieConsigliate: ["Pizzeria", "Pizza al taglio", "Pizzeria d'asporto"],
    moduli_attivi: ["informazioni", "immagini", "prodotti", "offerte", "eventi", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni"],
  },
  {
    id: "hotel",
    nome: "Hotel",
    descrizione: "Per hotel, B&B, residence e strutture ricettive. Ottimizzato per camere, servizi e prenotazioni.",
    icone: ["🏨", "🛏️"],
    categorieConsigliate: ["Hotel", "B&B", "Residence", "Struttura ricettiva"],
    moduli_attivi: ["informazioni", "immagini", "servizi", "offerte", "eventi", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni"],
  },
  {
    id: "farmacia",
    nome: "Farmacia",
    descrizione: "Per farmacie e parafarmacie. Include servizi sanitari, turni e prodotti specifici.",
    icone: ["💊", "⚕️"],
    categorieConsigliate: ["Farmacia", "Parafarmacia", "Sanitario"],
    moduli_attivi: ["informazioni", "immagini", "prodotti", "servizi", "offerte", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni"],
  },
  {
    id: "parrucchiere",
    nome: "Parrucchiere",
    descrizione: "Per parrucchieri, barbieri e centri estetici. Ottimizzato per servizi e prenotazioni appuntamenti.",
    icone: ["💇", "✂️"],
    categorieConsigliate: ["Parrucchiere", "Barbiere", "Estetista", "Centro benessere"],
    moduli_attivi: ["informazioni", "immagini", "servizi", "offerte", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni"],
  },
  {
    id: "professionista",
    nome: "Professionista",
    descrizione: "Per studi professionali, consulenti e liberi professionisti. Focus su servizi e contatti.",
    icone: ["💼", "📋"],
    categorieConsigliate: ["Studio professionale", "Consulenza", "Servizi"],
    moduli_attivi: ["informazioni", "immagini", "servizi", "contatti", "posizione", "orari", "social", "seo", "impostazioni"],
  },
];

export function getTemplates(): TemplateNegozio[] {
  return TEMPLATES;
}

export function getTemplateById(id: string): TemplateNegozio | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getCategoriesConsigliate(): string[] {
  const all = new Set<string>();
  for (const t of TEMPLATES) {
    for (const c of t.categorieConsigliate) {
      all.add(c);
    }
  }
  return Array.from(all).sort();
}
