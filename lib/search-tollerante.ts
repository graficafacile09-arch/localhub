/**
 * LocalHub — Ricerca tollerante (homepage /ricerca)
 *
 * Utility pure per rendere la ricerca di negozi e prodotti tollerante a:
 *   - maiuscole/minuscole        (già gestite da ilike; qui normalizziamo i token)
 *   - accenti                    (varianti accentate italiane dei termini)
 *   - errori di battitura        (pattern ilike con wildcard `_` + distanza Levenshtein)
 *   - spazi e punteggiatura      (normalizzazione dei token)
 *   - singolare/plurale          (distanza 1 + radice condivisa, es. "panini"/"panino")
 *   - query con più parole       (tokenizzazione multi-termine)
 *
 * Nessuna chiamata AI: la tolleranza è gestita dal motore di ricerca
 * (operatori ilike di PostgREST) e da confronti in memoria. Il ranking
 * esistente non viene toccato: la fase tollerante scatta solo quando la
 * ricerca esatta non produce risultati sufficienti.
 *
 * @module lib/search-tollerante
 */

// ─── Normalizzazione ─────────────────────────────────────────────────────────

const VOCALI_ACCENTATE: Record<string, readonly string[]> = {
  a: ["à"],
  e: ["è", "é"],
  i: ["ì", "í"],
  o: ["ò", "ó"],
  u: ["ù", "ú"],
};

/**
 * Normalizza un termine per i filtri ilike: lowercase, accenti rimossi,
 * punteggiatura e spazi ridotti a un separatore.
 */
export function pulisciTermine(termine: string): string {
  return (termine ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // `_` e `%` sono wildcard di ilike: li neutralizziamo per evitare che
    // l'input utente allarghi il match in modo incontrollato.
    .replace(/[,_%'’"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Varianti accentate ──────────────────────────────────────────────────────

/**
 * Varianti accentate italiane di un termine accent-free.
 * Esempio: "caffe" → ["caffe", "caffè", "caffé"]. Il risultato include
 * sempre il termine base e viene limitato per evitare esplosioni.
 */
export function variantiAccento(termine: string): string[] {
  const base = pulisciTermine(termine);
  if (!base) return [];

  const posizioni: Array<{ idx: number; alternative: readonly string[] }> = [];
  for (let i = 0; i < base.length; i++) {
    const alternative = VOCALI_ACCENTATE[base[i]];
    if (alternative) posizioni.push({ idx: i, alternative });
  }

  let varianti = [base];
  for (const { idx, alternative } of posizioni) {
    const prossime: string[] = [];
    for (const v of varianti) {
      prossime.push(v);
      for (const accento of alternative) {
        prossime.push(v.slice(0, idx) + accento + v.slice(idx + 1));
      }
    }
    varianti = Array.from(new Set(prossime));
    if (varianti.length > 20) break;
  }
  return varianti.slice(0, 20);
}

/**
 * Pattern ilike per un termine: solo corrispondenza esatta + varianti
 * accentate (nessun wildcard): usato nella fase "esatta" della ricerca.
 * Esempio: "caffe" → ["%caffe%", "%caffè%", "%caffé%"].
 */
export function patternIlikeConAccenti(termine: string): string[] {
  return variantiAccento(termine).map((variante) => `%${variante}%`);
}

// ─── Pattern tolleranti (wildcard) ───────────────────────────────────────────

/**
 * Pattern ilike per un termine con tolleranza a errori di battitura:
 * sostituzione di un carattere (`_`) e inserimento di un carattere (`_`).
 * "pizeria" → "%piz_eria%" matchea anche "pizzeria" (doppia z nel DB).
 * I termini troppo corti (< 4) o troppo lunghi (> 12) restano solo esatti
 * per evitare falsi positivi.
 */
export function patternIlikeTolleranti(termine: string, maxErrori = 1): string[] {
  const base = pulisciTermine(termine);
  if (!base) return [];

  // Ordine importante: base, poi wildcard di tolleranza (sostituzioni e
  // inserzioni), infine le varianti accentate. I consumer applicano un cap
  // ai pattern: se le varianti accentate venissero prima, i wildcard di
  // tolleranza verrebbero tagliati e i refusi non verrebbero trovati.
  const pattern: string[] = [`%${base}%`];

  if (maxErrori >= 1 && base.length >= 4 && base.length <= 12) {
    // Sostituzione: un carattere qualsiasi al posto di uno del termine.
    for (let i = 0; i < base.length; i++) {
      pattern.push(`%${base.slice(0, i)}_${base.slice(i + 1)}%`);
    }
    // Inserzione: il DB ha un carattere in più rispetto al termine
    // (es. "panifcio" → "panificio", "pizeria" → "pizzeria").
    for (let i = 1; i < base.length; i++) {
      pattern.push(`%${base.slice(0, i)}_${base.slice(i)}%`);
    }
  }

  // Varianti accentate in coda ("caffe" → "caffè"): utili ma meno
  // prioritarie dei wildcard di tolleranza.
  for (const variante of patternIlikeConAccenti(base)) {
    if (!pattern.includes(variante)) pattern.push(variante);
  }

  return pattern;
}

// ─── Distanza Levenshtein ───────────────────────────────────────────────────

/** Distanza di Levenshtein tra due stringhe (normalizzate). */
export function distanzaLevenshtein(a: string, b: string): number {
  const aa = pulisciTermine(a);
  const bb = pulisciTermine(b);
  if (aa === bb) return 0;
  if (!aa) return bb.length;
  if (!bb) return aa.length;

  const rigaPrec = Array.from({ length: bb.length + 1 }, (_, j) => j);
  for (let i = 1; i <= aa.length; i++) {
    const rigaCorr = [i];
    for (let j = 1; j <= bb.length; j++) {
      const costo = aa[i - 1] === bb[j - 1] ? 0 : 1;
      rigaCorr[j] = Math.min(
        rigaCorr[j - 1] + 1, // cancellazione
        rigaPrec[j] + 1, // inserimento
        rigaPrec[j - 1] + costo // sostituzione
      );
    }
    rigaPrec.splice(0, rigaPrec.length, ...rigaCorr);
  }
  return rigaPrec[bb.length];
}

/** Similarità normalizzata 0..1 (1 = identiche). */
export function similaritaLevenshtein(a: string, b: string): number {
  const aa = pulisciTermine(a);
  const bb = pulisciTermine(b);
  const max = Math.max(aa.length, bb.length);
  if (max === 0) return 1;
  return 1 - distanzaLevenshtein(aa, bb) / max;
}

// ─── Termini significativi ───────────────────────────────────────────────────

// Stopword italiane comuni: non sono mai termini di ricerca significativi e
// genererebbero solo pattern-spazzatura nella fase tollerante.
const STOPWORD: ReadonlySet<string> = new Set([
  "cerco", "cerca", "cerchi", "trovare", "trova", "dove", "quale", "quali",
  "qualche", "uno", "una", "un", "del", "della", "delle", "dei", "degli",
  "dello", "il", "lo", "la", "gli", "le", "di", "da", "per", "con",
  "nel", "nella", "nei", "nelle", "su", "sul", "sulla", "sui", "sulle",
  "a", "ad", "in", "mi", "ti", "si", "che", "e", "ed", "o", "piu", "più",
  "ho", "hai", "ha", "abbiamo", "voglio", "vorrei", "devo", "bisogno",
  "aiutami", "mi", "favore", "perfavore", "grazie", "dammi", "elenco",
  "lista", "mostra", "apri", "dimmi", "quanto", "quale", "meglio", "come",
]);

/**
 * Estrae i primi termini "significativi" della query (≥ 3 caratteri, non
 * stopword) usati dalla fase tollerante: la tolleranza ai refusi si applica
 * alle parole dell'utente, non ai sinonimi espansi né alle stopword.
 */
export function terminiSignificativi(query: string, max = 2): string[] {
  const token = pulisciTermine(query)
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORD.has(t));
  return Array.from(new Set(token)).slice(0, max);
}

// ─── Punteggio fuzzy in memoria ──────────────────────────────────────────────

/**
 * Punteggio di rilevanza "fuzzy" per un record (prodotto o negozio) rispetto
 * ai termini significativi: sottostringa = 3, similarità Levenshtein ≥ 0.7 = 2.
 * Serve solo alla fase tollerante (fallback quando la ricerca esatta fallisce).
 */
export function punteggioFuzzy(
  campi: Array<string | null | undefined>,
  termini: readonly string[]
): number {
  let score = 0;
  const campiPuliti = campi.map((c) => pulisciTermine(String(c ?? ""))).filter(Boolean);

  for (const termine of termini) {
    for (const campo of campiPuliti) {
      if (!campo) continue;
      if (campo.includes(termine)) {
        score += 3;
        continue;
      }
      const token = campo.split(/[^a-z0-9]+/);
      for (const tok of token) {
        if (tok.length < 4 || termine.length < 4) continue;
        if (similaritaLevenshtein(tok, termine) >= 0.7) {
          score += 2;
          break;
        }
      }
    }
  }
  return score;
}
