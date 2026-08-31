/**
 * LocalHub — Ricerca semantica (espansione della query).
 *
 * Espande la query utente in una lista di termini di ricerca usando:
 *   1. gruppi base di sinonimi per categorie/commercio (ereditati da lib/negozi);
 *   2. sinonimi per PROFILO ATTIVITÀ, chiavati sull'`id` dei profili in
 *      lib/profili-attivita.ts (medico, beauty, immobiliare, professionista,
 *      ricettivo, artigiano, ristorante, alimentari, ecommerce...).
 *
 * NB: NON è un dizionario infinito né specifico per singolo negozio. È una
 * "struttura semantica estendibile": l'associazione avviene per profilo
 * attività (un unico valore di `negozi.data.tipo_attivita`), quindi qualsiasi
 * negozio creato in futuro con quel profilo beneficia automaticamente dei
 * termini senza toccare il codice.
 *
 * L'effettivo recupero sul DB (che include anche `tipo_attivita` e
 * `servizi_strutturati`) avviene nella RPC `cerca_negozi_semantico`.
 *
 * @module lib/ricerca-semantica
 */

import { normalizza, radice } from "./text-utils";

// ─── Stopword — non sono mai termini di ricerca significativi ───────────────

const stopWordsRicerca = new Set([
  "a", "ad", "al", "alla", "alle", "allo", "ai", "agli", "all",
  "che", "chi", "con", "da", "dei", "del", "della", "delle", "dello",
  "di", "e", "gli", "ha", "hai", "ho", "i", "il", "in", "io",
  "la", "le", "lo", "mia", "mio", "mie", "miei", "mi",
  "nelle", "nella", "nel", "nei", "per", "serve", "servono", "servire",
  "se", "sul", "sulla", "sulle", "sui", "su", "tra",
  "devo", "fare", "un", "una", "uno", "mi", "cerco", "cerco un", "trovami",
]);

// ─── Gruppi base di sinonimi (categorie / commercio) ────────────────────────
// Ereditati dalla precedente implementazione; coprono commercio e servizi
// trasversali. Ogni gruppo è un array di termini EQUIVALENTI.
//
// V7 — lemmi "ponte" rimossi dall'espansione automatica (fix del leak
// tassonomico "benessere"). "benessere" era condiviso tra i domini salute e
// beauty: un negozio con categoria generica "Salute e benessere" (es. un
// medico) veniva intercettato sia da "farmacia" sia da "tagliarmi i capelli"
// (falsi positivi). "salute" era il ponte analogo per "farmacia" verso
// qualsiasi attività classificata genericamente "Salute e benessere".
// I termini rimossi restano SEMPRE validi come query originali (terminiBase
// non viene mai toccato): "benessere"/"salute" espliciti continuano a
// cercare. L'espansione automatica semplicemente non li usa più per saltare
// da un dominio all'altro.

const gruppiBase: Record<string, string[]> = {
  panificio: ["panificio", "forno", "pane", "pasticceria", "pasticcere", "bakery", "bakery shop", "cornetti", "pizza al taglio", "focaccia", "grissini", "biscotti", "torte", "dolci", "lievitati", "panetteria", "pane casereccio"],
  beauty: ["beauty", "bellezza", "parrucchiere", "parrucchieri", "barber", "barbiere", "estetica", "estetista", "trucco", "makeup", "make-up", "capelli", "taglio", "piega", "barba", "skincare"],
  casa: ["casa", "arredo", "arredamento", "mobili", "interior", "decorazioni", "illuminazione", "cucina", "salotto", "camera", "divano", "tavolo"],
  auto: ["auto", "macchina", "officina", "gomme", "pneumatici", "tagliando", "meccanico", "carrozzeria", "revisione", "olio", "freni", "batteria", "concessionaria"],
  salute: ["farmacia", "parafarmacia", "medicinali", "integratori", "sanitaria", "febbre", "raffreddore", "mal", "testa", "dolore", "ricetta", "analisi", "antibiotico"],
  tech: ["tech", "tecnologia", "tecnologico", "tecnologici", "tecnologica", "elettronica", "telefonia", "cellulari", "cellulare", "smartphone", "telefonino", "telefonini", "computer", "pc", "tablet", "accessori", "riparazioni", "monitor", "stampante", "ricarica"],
  bimbi: ["bimbi", "bambini", "giocattoli", "giocattolo", "infanzia", "scuola", "cartoleria", "neonati", "prima", "infanzia", "zaino", "pannolini", "didattico"],
  sport: ["sport", "fitness", "palestra", "allenamento", "running", "yoga", "pilates", "abbigliamento", "sportivo", "workout", "tapis", "roulant", "pesi", "training"],
  moda: ["moda", "abbigliamento", "boutique", "vestiti", "vestito", "scarpe", "calzature", "elegante", "eleganti", "outfit"],
  ristorazione: ["mangiare", "ristorante", "ristorazione", "ristoranti", "trattoria", "trattorie", "cena", "cene", "pranzo", "pranzi", "cibo", "aperitivo", "aperitivi", "pizzeria", "pizzerie", "cucina", "panificio", "panifici", "forno", "pane", "bakery"],
  promozioni: ["offerte", "offerta", "promozioni", "promozione", "sconti", "sconto", "saldo", "saldi", "affari"],
  regalo: ["regalo", "regali", "regalare", "dono", "doni", "omaggio", "omaggi"],
  pet: ["pet", "animali", "animale", "cani", "cane", "gatti", "gatto", "veterinario", "veterinaria", "toelettatura", "crocchette", "shop", "zecche", "zecca", "pulci", "pulce", "antiparassitario", "antiparassitari", "cucciolo", "croccantini", "lettiera", "guinzaglio", "mangime"],
};

// ─── Sinonimi per PROFILO ATTIVITÀ ──────────────────────────────────────────
// Chiave = `id` in PROFILI_ATTIVITA (lib/profili-attivita.ts).
// Estendibile AGGIUNGENDO una voce per un nuovo profilo: nessun negozio deve
// essere enumerato qui. Vale per TUTTI i negozi con quel tipo_attivita.
export const SINONIMI_TIPO_ATTIVITA: Record<string, string[]> = {
  medico: [
    "medico", "dottore", "dott", "dottoressa", "specialista", "otorino",
    "otorinolaringoiatra", "orecchie", "orecchio", "udito", "uditivo",
    "visita", "ambulatorio", "studio", "sanita", "salute", "dentista",
    "dentale", "oculista", "dermatologo", "pediatra", "ginecologo",
    "cardiologo", "ortopedico",
  ],
  beauty: [
    "parrucchiere", "barbiere", "estetista", "bellezza", "capelli", "taglio",
    "piega", "barba", "unghie", "makeup", "trucco", "skincare",
    "centro estetico", "acconciature",
  ],
  immobiliare: [
    "immobiliare", "immobile", "agenzia", "casa", "vendita casa", "affitto",
    "affittare", "appartamento", "comprare casa", "vendere casa", "mutuo",
    "agenzia immobiliare",
  ],
  professionista: [
    "professionista", "consulenza", "consulente", "commercialista", "avvocato",
    "notaio", "architetto", "ingegnere", "studio", "studi professionali",
    "servizi professionali", "geometra",
  ],
  ricettivo: [
    "hotel", "albergo", "b&b", "bed and breakfast", "affittacamere",
    "pernottamento", "ospitalita", "soggiorno", "guest house",
  ],
  artigiano: [
    "artigiano", "artigianato", "riparazione", "riparare", "manutenzione",
    "falegname", "idraulico", "elettricista", "bricolage", "artigianale",
  ],
  ristorante: [
    "cucina", "locale", "menu", "ristorante", "trattoria", "gourmet",
    "aperitivo", "cena", "pranzo", "chef",
  ],
  alimentari: [
    "alimentari", "drogheria", "pane", "panificio", "forno", "spesa",
    "supermercato", "frutta", "verdura", "gastronomia",
  ],
  ecommerce: [
    "negozio", "shop", "boutique", "comprare", "acquistare", "vendita",
    "catalogo", "prodotti", "store",
  ],
  altro: [],
};

// ─── Normalizzazione token ──────────────────────────────────────────────────

function attivaGruppo(termine: string, voce: string): boolean {
  const t = normalizza(termine).trim();
  const v = normalizza(voce).trim();
  if (!t || !v) return false;
  if (t === v) return true;
  return radice(t) === radice(v);
}

/**
 * Espansione SOLO sui gruppi base di categoria/commercio (senza il vocabolario
 * dei profili attività). Usata dalla ricerca PRODOTTI, dove i sinonimi medici/
 * professionali non hanno senso (evita falsi positivi tipo "dottore" → latte).
 */
// Converti un set di voci-sinonimo (che possono contenere frasi tipo "pizza al
// taglio") in una stringa di SOLI token puliti: ogni parola >= 3 caratteri e
// non-stopword. Così le FRAZIONI delle frasi (es. l'articolo "al" in "pizza
// al taglio") non finiscono mai come filtri generici (%al% → mezzo catalogo).
function setInTokenPuliti(set: Set<string>): string {
  const token: string[] = [];
  for (const voce of set) {
    for (const parola of voce.split(/\s+/)) {
      const p = parola.trim();
      if (p.length >= 3 && !stopWordsRicerca.has(p)) token.push(p);
    }
  }
  return Array.from(new Set(token)).join(" ");
}

export function espandiQueryConSinonimiBase(query: string): string {
  const terminiBase = normalizza(query)
    .split(/[^a-z0-9]+/)
    .map((termino) => termino.trim())
    .filter((termino) => termino && !stopWordsRicerca.has(termino));

  const terminiEspansi = new Set<string>(terminiBase);
  for (const termine of terminiBase) {
    for (const gruppo of Object.values(gruppiBase)) {
      if (gruppo.some((voce) => attivaGruppo(termine, voce))) {
        gruppo.forEach((voce) => terminiEspansi.add(voce));
      }
    }
  }
  return setInTokenPuliti(terminiEspansi);
}

/** Profili attività il cui gruppo di termini "copre" il termine utente. */
function profiliPerTermine(termine: string): string[] {
  const trovati: string[] = [];
  for (const [id, gruppi] of Object.entries(SINONIMI_TIPO_ATTIVITA)) {
    if (gruppi.length === 0) continue;
    if (gruppi.some((voce) => attivaGruppo(termine, voce))) trovati.push(id);
  }
  return trovati;
}

/**
 * Espande la query utente in termini di ricerca (sinonimi di categoria +
 * sinonimi del profilo attività rilevante). Il risultato è una stringa di
 * termini da passare alla RPC/ricerca. Esempio:
 *   "mi serve un dottore per le orecchie" →
 *     "dottore medico specialista otorino orecchie udito ..."
 */
export function espandiQueryConSinonimi(query: string): string {
  const terminiBase = normalizza(query)
    .split(/[^a-z0-9]+/)
    .map((termino) => termino.trim())
    .filter((termino) => termino && !stopWordsRicerca.has(termino));

  const terminiEspansi = new Set<string>(terminiBase);

  // 1) gruppi base (categorie/commercio)
  for (const termine of terminiBase) {
    for (const gruppo of Object.values(gruppiBase)) {
      if (gruppo.some((voce) => attivaGruppo(termine, voce))) {
        gruppo.forEach((voce) => terminiEspansi.add(voce));
      }
    }
  }

  // 2) sinonimi per profilo attività rilevante
  for (const termine of terminiBase) {
    for (const id of profiliPerTermine(termine)) {
      (SINONIMI_TIPO_ATTIVITA[id] ?? []).forEach((voce) => terminiEspansi.add(voce));
    }
  }

  return setInTokenPuliti(terminiEspansi);
}