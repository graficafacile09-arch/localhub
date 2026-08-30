/**
 * PROFILI ATTIVITÀ — configurazione centralizzata del tipo di attività.
 *
 * Modello (Fase 1):
 *   ATTIVITÀ → PROFILO → MODULI ATTIVI → MODALITÀ OPERATIVA
 *
 * Un profilo determina il preset iniziale di `negozi.moduli_attivi` e viene
 * persistito in `negozi.data.tipo_attivita` (con `negozi.data.operativita`).
 * Non richiede nuove API né migration: `PUT /api/merchant/stores/[id]/settings`
 * accetta già sia `moduli_attivi` sia `data` (merge jsonb).
 *
 * I valori di `moduli_attivi` devono essere slug esistenti nel registry dei
 * moduli (lib/modules/registry.ts). I profili NON e-commerce non attivano i
 * moduli commerciali (prodotti, pagamenti).
 *
 * I negozi esistenti senza `data.tipo_attivita` continuano a funzionare come
 * prima: questa configurazione viene applicata SOLO alle nuove creazioni.
 */

import type { Negozio } from "@/types/negozio";

export type ProfiloAttivitaId =
  | "ecommerce"
  | "alimentari"
  | "ristorante"
  | "beauty"
  | "medico"
  | "immobiliare"
  | "artigiano"
  | "ricettivo"
  | "professionista"
  | "altro";

/** Modalità operativa principale del profilo (persistita in data.operativita). */
export type OperativitaId = "vendita" | "prenotazione" | "informazioni";

export type ProfiloAttivita = {
  id: ProfiloAttivitaId;
  nome: string;
  descrizione: string;
  icona: string;
  moduli_attivi: string[];
  operativita: OperativitaId;
};

export const PROFILI_ATTIVITA: ProfiloAttivita[] = [
  {
    id: "ecommerce",
    nome: "E-commerce",
    descrizione: "Negozio con catalogo prodotti, acquisti online e pagamenti.",
    icona: "🛒",
    moduli_attivi: [
      "informazioni",
      "immagini",
      "prodotti",
      "offerte",
      "eventi",
      "contatti",
      "posizione",
      "orari",
      "social",
      "seo",
      "ai",
      "pagamenti",
      "impostazioni",
    ],
    operativita: "vendita",
  },
  {
    id: "alimentari",
    nome: "Alimentari",
    descrizione: "Alimentari, supermercati, panetterie e gastronomie con vendita.",
    icona: "🥖",
    moduli_attivi: [
      "informazioni",
      "immagini",
      "prodotti",
      "offerte",
      "contatti",
      "posizione",
      "orari",
      "social",
      "seo",
      "ai",
      "pagamenti",
      "impostazioni",
    ],
    operativita: "vendita",
  },
  {
    id: "ristorante",
    nome: "Ristorante",
    descrizione: "Ristoranti, bar, pizzerie e locali con servizio, menu e orari.",
    icona: "🍝",
    moduli_attivi: [
      "informazioni",
      "immagini",
      "servizi",
      "offerte",
      "eventi",
      "contatti",
      "posizione",
      "orari",
      "social",
      "seo",
      "ai",
      "impostazioni",
      "prenotazioni",
    ],
    operativita: "prenotazione",
  },
  {
    id: "beauty",
    nome: "Beauty & Benessere",
    descrizione: "Parrucchieri, barbieri, estetiste e centri benessere su appuntamento.",
    icona: "💇",
    moduli_attivi: [
      "informazioni",
      "immagini",
      "servizi",
      "offerte",
      "contatti",
      "posizione",
      "orari",
      "social",
      "seo",
      "ai",
      "impostazioni",
      "richiesta_info",
      "prenotazioni",
    ],
    operativita: "prenotazione",
  },
  {
    id: "medico",
    nome: "Medico & Dentista",
    descrizione: "Studi medici, dentistici e sanitari con servizi e appuntamenti.",
    icona: "🩺",
    moduli_attivi: [
      "informazioni",
      "immagini",
      "servizi",
      "contatti",
      "posizione",
      "orari",
      "social",
      "seo",
      "impostazioni",
      "richiesta_info",
      "prenotazioni",
    ],
    operativita: "prenotazione",
  },
  {
    id: "immobiliare",
    nome: "Immobiliare",
    descrizione: "Agenzie immobiliari con servizi, foto, richieste e appuntamenti.",
    icona: "🏠",
    moduli_attivi: [
      "informazioni",
      "immagini",
      "servizi",
      "contatti",
      "posizione",
      "orari",
      "social",
      "seo",
      "impostazioni",
      "richiesta_info",
      "prenotazioni",
    ],
    operativita: "prenotazione",
  },
  {
    id: "artigiano",
    nome: "Artigiano",
    descrizione: "Artigiani e professionisti tecnici con servizi e preventivi.",
    icona: "🛠️",
    moduli_attivi: [
      "informazioni",
      "immagini",
      "servizi",
      "offerte",
      "contatti",
      "posizione",
      "orari",
      "social",
      "seo",
      "ai",
      "impostazioni",
      "richiesta_info",
      "prenotazioni",
    ],
    operativita: "prenotazione",
  },
  {
    id: "ricettivo",
    nome: "Ricettivo",
    descrizione: "Hotel, B&B e strutture ricettive con servizi e prenotazioni.",
    icona: "🏨",
    moduli_attivi: [
      "informazioni",
      "immagini",
      "servizi",
      "offerte",
      "eventi",
      "contatti",
      "posizione",
      "orari",
      "social",
      "seo",
      "ai",
      "impostazioni",
      "richiesta_info",
      "prenotazioni",
    ],
    operativita: "prenotazione",
  },
  {
    id: "professionista",
    nome: "Professionista",
    descrizione: "Studi professionali e liberi professionisti con servizi, consultenze e appuntamenti.",
    icona: "💼",
    moduli_attivi: [
      "informazioni",
      "immagini",
      "servizi",
      "contatti",
      "posizione",
      "orari",
      "social",
      "seo",
      "impostazioni",
      "richiesta_info",
      "prenotazioni",
    ],
    operativita: "prenotazione",
  },
  {
    id: "altro",
    nome: "Altro",
    descrizione: "Qualsiasi altra attività locale senza vendita online automatica.",
    icona: "🏪",
    moduli_attivi: [
      "informazioni",
      "immagini",
      "servizi",
      "contatti",
      "posizione",
      "orari",
      "social",
      "seo",
      "ai",
      "impostazioni",
      "richiesta_info",
    ],
    operativita: "informazioni",
  },
];

/** Restituisce il profilo per id (undefined se non esiste). */
export function getProfiloAttivita(
  id: string | null | undefined
): ProfiloAttivita | undefined {
  if (!id) return undefined;
  return PROFILI_ATTIVITA.find((p) => p.id === id);
}

/**
 * Mapping template di sistema → profilo. I template esistenti restano
 * intatti (nessuna modifica a templates.ts): questo mapping li rende
 * "preset compatibili" con il nuovo modello, persistendo data.tipo_attivita
 * sui negozi creati da template. I template personali (uuid) non hanno
 * mapping → si conserva il comportamento attuale.
 */
const PROFILO_DI_TEMPLATE: Record<string, ProfiloAttivitaId> = {
  base: "altro",
  ristorante: "ristorante",
  bar: "alimentari",
  pizzeria: "ristorante",
  hotel: "ricettivo",
  farmacia: "ecommerce",
  parrucchiere: "beauty",
  professionista: "professionista",
};

/** Profilo associato a un template di sistema (undefined = nessun mapping). */
export function getProfiloPerTemplate(
  templateId: string | null | undefined
): ProfiloAttivita | undefined {
  if (!templateId) return undefined;
  return getProfiloAttivita(PROFILO_DI_TEMPLATE[templateId]);
}

/**
 * Moduli attivi effettivi di un negozio per l'editor condizionale.
 *
 * Priorità:
 *   1. `negozi.data.tipo_attivita` → preset del profilo (questo file);
 *   2. `negozi.moduli_attivi` (configurazione per-negozio, default di sistema);
 *   3. `null` → nessuna informazione: comportamento attuale (tutti gli step).
 *
 * I negozi esistenti senza `tipo_attivita` NON vengono modificati
 * retroattivamente: il loro `moduli_attivi` (default di sistema) contiene
 * prodotti/offerte, quindi gli step condizionali restano tutti visibili e il
 * prerequisito prodotti rimane attivo come prima.
 */
export function getModuliAttiviNegozio(
  store: Negozio | null | undefined
): string[] | null {
  if (!store) return null;
  const data = store.data as Record<string, unknown> | null | undefined;
  const tipo = data?.tipo_attivita;
  const profilo = typeof tipo === "string" ? getProfiloAttivita(tipo) : undefined;
  if (profilo) return profilo.moduli_attivi;
  if (Array.isArray(store.moduli_attivi) && store.moduli_attivi.length > 0) {
    return store.moduli_attivi;
  }
  return null;
}

/**
 * AGENDA — determina in modo centralizzato se l'attività dispone del modulo
 * prenotazioni/agenda. NON usa `if categoria === "medico"` né elenchi
 * paralleli: la decisione deriva dalla classificazione già esistente
 * (`getModuliAttiviNegozio` → profilo `data.tipo_attivita`, altrimenti
 * `negozi.moduli_attivi`), controllando la presenza dello slug "prenotazioni".
 *
 * Le attività commerciali al dettaglio (ecommerce/alimentari, es. panificio,
 * gioielleria, bar) NON hanno "prenotazioni" nei moduli → niente Agenda,
 * anche se dispongono di orari universali. Lo stesso helper va usato ovunque
 * si debba decidere se mostrare l'Agenda.
 */
export function attivitaHaAgenda(store: Negozio | null | undefined): boolean {
  const moduli = getModuliAttiviNegozio(store);
  return !!moduli && moduli.includes("prenotazioni");
}
