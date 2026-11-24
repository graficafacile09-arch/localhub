/**
 * Appartenenza di un prodotto a una categoria GENERICA di alimento.
 *
 * Il catalogo Radici Calabria non ripete la categoria generica nel nome del prodotto:
 * un «Pecorino di Castrovillari» è un formaggio, ma la parola «formaggio» non
 * compare nel nome; un prodotto dal nome proprio non contiene nemmeno un
 * sottotipo noto. Una mappa curata da sola è quindi destinata a restare
 * incompleta: ogni
 * nuovo prodotto con un nome locale («felciata», «giuncata», «cacioricotta»)
 * richiederebbe una voce in più, e finché la voce manca Pino non lo trova.
 *
 * La regola è quindi a tre livelli, dal più forte al più debole:
 *   1. la categoria è DICHIARATA dal prodotto stesso (nome, categoria,
 *      sottocategoria, marca, parole chiave), confrontata per radice così che
 *      singolare e plurale coincidano («formaggio» ≡ «Formaggi»);
 *   2. il prodotto è un SOTTOTIPO reale della categoria (pecorino, ricotta,
 *      caciocavallo → formaggio): mappa curata, piccola e verificabile;
 *   3. la descrizione DEFINISCE il prodotto come quella categoria
 *      («La giuncata è il formaggio fresco per eccellenza», «Formaggio estivo
 *      di latte…»). Vale solo per i prodotti che SE NE DICHIARANO parte.
 *
 * Il terzo livello non promuove chi la categoria la cita di passaggio: conta
 * solo la prima frase e solo con la copula («è un/il …») o con la descrizione
 * che si apre proprio con la categoria. «Ottima con formaggi e carni» non rende
 * una confettura un formaggio.
 *
 * La stessa funzione è usata dal gate di pertinenza di Pino, dalla ricerca
 * prodotti pubblica e dall'espansione della query: una sola interpretazione.
 */

import { estraiToken, normalizza } from "./text-utils.ts";

/**
 * Sottotipi per categoria: nomi reali con cui il catalogo pubblica il prodotto
 * specifico. Restano utili perché il nome non contiene la categoria
 * («Pecorino»), ma non sono più l'unica prova accettata.
 *
 * Non è un dizionario infinito: le parole identiche in italiano e inglese
 * ("pasta", "pizza") non vanno inserite qui come chiavi generiche.
 */
export const SOTTOTIPI_PRODOTTO: Record<string, string[]> = {
  formaggio: [
    "formaggi",
    "pecorino",
    "pecorini",
    "caciocavallo",
    "caciotta",
    "ricotta",
    "mozzarella",
    "provola",
    "provolone",
    "parmigiano",
    "grana",
    "canestrato",
    "stracchino",
    "gorgonzola",
    "scamorza",
    "burrata",
    "caprino",
    "toma",
    "asiago",
    "fontina",
    "cacioricotta",
    "giuncata",
    "felciata",
  ],
};

/** Campi del prodotto che possono dichiarare la categoria. */
export type ProdottoClassificabile = {
  nome?: string | null;
  categoria?: string | null;
  sottocategoria?: string | null;
  marca?: string | null;
  descrizione?: string | null;
  descrizione_completa?: string | null;
  parole_chiave?: string[] | null;
  parole_chiave_normalizzate?: string[] | null;
};

/** Lunghezza minima della radice: sotto questa soglia si confronta il token intero. */
const RADICE_MINIMA = 4;

/**
 * Radice di confronto: toglie la vocale finale, così singolare e plurale
 * coincidono («formaggio»/«formaggi» → «formagg», «salume»/«salumi» → «salum»).
 * Non è uno stemmer: non tocca il resto della parola.
 */
function radiceParola(parola: string): string {
  return (
    normalizza(parola ?? "")
      .trim()
      // Plurale duro italiano: «funghi»/«fungo», «laghi»/«lago». Senza questa
      // normalizzazione le due forme avevano radici diverse e una categoria
      // pubblicata solo al singolare non si riconosceva al plurale.
      .replace(/gh/, "g")
      .replace(/[aeiou]+$/, "")
  );
}

/** Due parole appartengono alla stessa famiglia solo se la radice è identica. */
function stessaRadice(a: string, b: string): boolean {
  const ra = radiceParola(a);
  const rb = radiceParola(b);
  return ra.length >= RADICE_MINIMA && ra === rb;
}

/** Token dei metadati che IDENTIFICANO il prodotto (mai la descrizione). */
function tokenIdentita(prodotto: ProdottoClassificabile): string[] {
  const chiavi = (
    prodotto.parole_chiave_normalizzate ??
    prodotto.parole_chiave ??
    []
  ).map((chiave) => normalizza(String(chiave ?? "")));
  return [
    prodotto.nome,
    prodotto.categoria,
    prodotto.sottocategoria,
    prodotto.marca,
    ...chiavi,
  ]
    .filter((valore): valore is string => typeof valore === "string" && valore.length > 0)
    .flatMap((valore) => estraiToken(valore));
}

/** Sottotipi curati della categoria richiesta, anche al plurale. */
export function sottotipiCategoria(chiave: string): string[] {
  const trovati = new Set<string>();
  for (const [categoria, sottotipi] of Object.entries(SOTTOTIPI_PRODOTTO)) {
    if (normalizza(categoria) === chiave || stessaRadice(categoria, chiave)) {
      for (const sottotipo of sottotipi) {
        const voce = normalizza(sottotipo).trim();
        if (voce) trovati.add(voce);
      }
    }
  }
  return Array.from(trovati);
}

/** Prima frase di un testo: la definizione sta lì, non nelle note di servizio. */
function primaFrase(testo: string | null | undefined): string {
  if (typeof testo !== "string" || !testo.trim()) return "";
  return normalizza(testo).split(/[.!?;:]/)[0]?.trim() ?? "";
}

/**
 * Varianti di numero della categoria: «pasta» → pasta/paste/pasti/pasto.
 * Il confronto avviene sulla PAROLA intera: senza questa distinzione il
 * prefisso «past» farebbe combaciare «pastorale» e un pecorino diventerebbe
 * pasta.
 */
function variantiCategoria(chiave: string): string[] {
  const base = normalizza(chiave).trim();
  if (!/^[a-z]{4,}$/.test(base)) return [base];
  const radice = base.slice(0, -1);
  return Array.from(
    new Set([base, ...["a", "e", "i", "o"].map((vocale) => radice + vocale)])
  );
}

/**
 * La descrizione DEFINISCE il prodotto come la categoria richiesta:
 * «La giuncata è il formaggio fresco per eccellenza», «Formaggio estivo di
 * latte di capra».
 * La copula ammette al massimo tre parole tra l'articolo e la categoria, così
 * «è una conserva che si abbina ai formaggi» non viene promosso.
 */
function descrizioneDichiaraCategoria(
  prodotto: ProdottoClassificabile,
  chiave: string
): boolean {
  if (chiave.length < RADICE_MINIMA) return false;
  const gruppo = variantiCategoria(chiave).join("|");
  const copula = new RegExp(
    `\\b(?:e|è|sono)\\s+(?:un|uno|una|il|lo|la|i|gli|le)\\s+(?:[a-z]+\\s+){0,3}(?:${gruppo})\\b`
  );
  const inizio = new RegExp(`^\\s*(?:${gruppo})\\b`);
  for (const testo of [prodotto.descrizione, prodotto.descrizione_completa]) {
    const frase = primaFrase(testo);
    if (!frase) continue;
    if (copula.test(frase) || inizio.test(frase)) return true;
  }
  return false;
}

/**
 * Vero quando il prodotto appartiene alla categoria generica richiesta.
 * `soggetto` è la parola dell'utente («formaggio», «formaggi», «salumi»).
 * Con soggetto assente non c'è nulla da dimostrare: la funzione non promuove.
 */
export function appartieneCategoriaGenericaProdotto(
  prodotto: ProdottoClassificabile | Record<string, unknown> | null | undefined,
  soggetto: string | undefined
): boolean {
  const p = (prodotto ?? {}) as ProdottoClassificabile;
  const chiave = normalizza(soggetto ?? "").trim();
  if (!chiave) return false;

  const token = tokenIdentita(p);

  // 1) La categoria è dichiarata nei metadati identitari del prodotto.
  if (token.includes(chiave) || token.some((t) => stessaRadice(t, chiave))) {
    return true;
  }

  // 2) Il prodotto è un sottotipo reale della categoria.
  const sottotipi = sottotipiCategoria(chiave);
  if (
    sottotipi.length > 0 &&
    token.some(
      (t) => sottotipi.includes(t) || sottotipi.some((s) => stessaRadice(s, t))
    )
  ) {
    return true;
  }

  // 3) La descrizione definisce il prodotto come quella categoria.
  return descrizioneDichiaraCategoria(p, chiave);
}
