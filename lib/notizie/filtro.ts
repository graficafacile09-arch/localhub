import { FONTI_ID } from "./fonti";
import type { CategoriaNotizia } from "./types";

/**
 * FILTRO CASTROVILLARI — deterministico, senza IA, facilmente modificabile.
 *
 * Regole:
 * 1. Le notizie del Comune di Castrovillari sono SEMPRE pertinenti
 *    (la fonte pubblica solo notizie locali).
 * 2. Una notizia è pertinente se titolo O excerpt contengono una keyword
 *    FORTE ("castrovillari", "castrovillarese").
 * 3. Le keyword DEBOLI ("pollino", …) da sole NON bastano (punteggio
 *    sotto la soglia): servono almeno due occorrenze distinte oppure
 *    l'abbinamento con una keyword forte.
 * 4. Se non c'è certezza sufficiente → NON importare.
 *
 * Le liste sono costanti qui: modificarle NON richiede migration.
 */

/** Keyword forti — menzione diretta di Castrovillari (punteggio 10). */
const KEYWORD_FORTI: readonly string[] = ["castrovillari", "castrovillarese"];

/** Keyword deboli — contesto territoriale, MAI sufficienti da sole. */
const KEYWORD_DEBOLI: readonly string[] = ["pollino", "parco nazionale del pollino"];

/** Punteggi e soglia: forte=10, debole=2; serve ≥ 10. */
const PESO_FORTE = 10;
const PESO_DEBOLE = 2;
const SOGLIA_PERTINENZA = 10;

/** Fonti le cui notizie sono sempre pertinenti (Comune di Castrovillari). */
const SORGENTI_SEMPRE_PERTINENTI: ReadonlySet<string> = new Set([FONTI_ID.COMUNE]);

/** Normalizza il testo per il match: minuscolo + rimozione accenti. */
export function normalizzaTesto(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Punteggio di pertinenza di un testo (0 se nessuna keyword). */
export function punteggioPertinenza(testo: string): number {
  const t = normalizzaTesto(testo);
  let punti = 0;
  for (const k of KEYWORD_FORTI) {
    if (t.includes(normalizzaTesto(k))) punti += PESO_FORTE;
  }
  for (const k of KEYWORD_DEBOLI) {
    if (t.includes(normalizzaTesto(k))) punti += PESO_DEBOLE;
  }
  return punti;
}

/**
 * Decide se una notizia è pertinente a Castrovillari.
 * Controlla titolo + excerpt (l'excerpt è il "contenuto disponibile").
 */
export function isPertinenteCastrovillari(params: {
  fonteId: string;
  title: string;
  excerpt?: string | null;
}): boolean {
  if (SORGENTI_SEMPRE_PERTINENTI.has(params.fonteId)) return true;
  const testo = `${params.title} ${params.excerpt ?? ""}`;
  return punteggioPertinenza(testo) >= SOGLIA_PERTINENZA;
}

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORIA
   ═══════════════════════════════════════════════════════════════════════ */

/** Mappa keyword → categoria (le prime corrispondenze vincono). */
const MAPPA_CATEGORIE: ReadonlyArray<{ keywords: readonly string[]; categoria: CategoriaNotizia }> = [
  {
    keywords: ["protezione civile", "allerta", "maltempo", "incendio", "incendi", "terremoto", "alluvione"],
    categoria: "Protezione civile",
  },
  {
    keywords: ["cultura", "mostra", "concerto", "teatro", "biblioteca", "evento", "spettacolo", "musica"],
    categoria: "Cultura",
  },
  {
    keywords: ["ambiente", "parco nazionale", "natura", "sostenibil", "rifiuti", "biodiversit"],
    categoria: "Ambiente",
  },
  {
    keywords: ["comune di castrovillari", "comune", "giunta", "consiglio comunale", "delibera", "avviso", "bandi", "elezioni"],
    categoria: "Comune",
  },
  {
    keywords: ["provincia", "regione", "istituzioni", "ente", "prefettura", "lavori pubblici", "scuola", "edilizia"],
    categoria: "Istituzioni",
  },
];

/** Categoria di una notizia: keyword prima, poi default della fonte. */
export function assegnaCategoria(
  title: string,
  excerpt: string | null,
  categoriaDefault: CategoriaNotizia
): CategoriaNotizia {
  const t = normalizzaTesto(`${title} ${excerpt ?? ""}`);
  for (const riga of MAPPA_CATEGORIE) {
    if (riga.keywords.some((k) => t.includes(normalizzaTesto(k)))) {
      return riga.categoria;
    }
  }
  return categoriaDefault;
}