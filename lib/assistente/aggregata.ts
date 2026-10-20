/**
 * LocalHub — Pino: domande informative/aggregate sul catalogo
 *
 * "Quanti tipi di pasta ci sono?" non è una ricerca per parola chiave: se
 * finisce nel retrieval come query libera il gate di pertinenza chiede tutte
 * le parole della frase e restituisce zero risultati.
 *
 * Questo modulo:
 *   - riconosce la domanda aggregata (conteggio o elenco di tipi/prodotti);
 *   - ricostruisce soggetto e filtro già discussi ("pasta" + "all'uovo");
 *   - compone la risposta SOLO con i prodotti realmente recuperati dal
 *     catalogo, dichiarando quando il numero non è affidabile.
 *
 * Nessuna stima, nessun conteggio inventato, nessuna scrittura su DB.
 * Vive solo nel flusso di Pino: non tocca la ricerca pubblica né il catalogo.
 *
 * @module lib/assistente/aggregata
 */

import type { ProdottoRicerca } from "@/lib/ricerca-ai";
import { normalizzaRichiesta } from "./local-intents";

export type DomandaAggregata = {
  tipo: "conteggio" | "elenco";
  /** "di questo tipo", "così", "ne avete": la domanda punta al sottoinsieme già discusso. */
  riferimentoContesto: boolean;
};

const RE_CONTEGGIO = /\b(?:quanti|quante|numero|totale)\b/;
const RE_ELENCO =
  /\b(?:quali|che)\s+(?:tipi|tipo|variet[àa]|varianti|versioni|prodotti|articoli)\b/;
// Senza un referente di tipo/prodotto la domanda non riguarda il catalogo:
// "quante farmacie sono aperte?" o "quanti abitanti ha Castrovillari?" restano
// sui rispettivi percorsi.
const RE_OGGETTO =
  /\b(?:tipi|tipo|variet[àa]|varianti|versioni|prodotti|prodotto|articoli|articolo)\b/;
const RE_RIFERIMENTO =
  /\b(?:di\s+questo\s+tipo|di\s+quel\s+tipo|di\s+questi|di\s+queste|di\s+quelli|di\s+quelle|dello\s+stesso\s+tipo|cos[ìi]|come\s+quest[ie]|ne\s+avete|di\s+cui)\b/;

/** Riconosce una domanda informativa/aggregata sul catalogo. */
export function rilevaDomandaAggregata(query: string): DomandaAggregata | null {
  const q = normalizzaRichiesta(query ?? "");
  if (!q) return null;

  const conteggio = RE_CONTEGGIO.test(q);
  const elenco = RE_ELENCO.test(q);
  if (!conteggio && !elenco) return null;
  if (!RE_OGGETTO.test(q)) return null;

  return {
    tipo: conteggio ? "conteggio" : "elenco",
    riferimentoContesto: RE_RIFERIMENTO.test(q),
  };
}

// ─── Soggetto e filtro della conversazione ───────────────────────────────────

// Parole conversazionali/di cornice: non sono né soggetto né attributo.
const STOP = new Set([
  "voglio", "vorrei", "cerco", "cerca", "trovami", "trova", "mi", "serve",
  "la", "lo", "le", "il", "i", "gli", "un", "una", "uno", "e", "che", "ci",
  "sono", "quanti", "quante", "quale", "quali", "numero", "totale",
  "tipi", "tipo", "varieta", "varianti", "versioni", "prodotti", "prodotto",
  "articoli", "articolo", "avete", "ne", "questo", "questa", "questi",
  "queste", "quel", "quella", "quelli", "quelle", "stesso", "stessa",
  "cosi", "come", "ha", "hanno", "offrite", "esistono", "si", "trova",
  "trovano", "presenti", "disponibili", "anche", "per", "favore",
]);

// Preposizioni: separano il soggetto dagli attributi ("pasta all'uovo").
const PREP = new Set([
  "di", "del", "dello", "della", "dei", "degli", "delle",
  "a", "al", "allo", "alla", "ai", "agli", "alle", "all",
  "con", "senza", "in", "su", "da", "dal", "dallo", "dalla",
  "per", "tra", "fra",
]);

function tokenizza(testo: string): string[] {
  return normalizzaRichiesta(testo ?? "")
    .replace(/['’]/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

type Porzione = { soggetto: string; qualificatore: string | null };

/** "pasta all'uovo" → soggetto "pasta", qualificatore "uovo". */
function scomponi(testo: string): Porzione {
  const tokens = tokenizza(testo).filter((t) => !STOP.has(t));
  const separatore = tokens.findIndex((t) => PREP.has(t));
  const soggettoTokens = (separatore === -1 ? tokens : tokens.slice(0, separatore)).slice(0, 2);
  const qualificatoreTokens =
    separatore === -1 ? [] : tokens.slice(separatore + 1).filter((t) => !PREP.has(t)).slice(0, 2);

  return {
    soggetto: soggettoTokens.join(" ").trim(),
    qualificatore: qualificatoreTokens.length ? qualificatoreTokens.join(" ").trim() : null,
  };
}

/** Soggetto scritto nella domanda stessa ("quanti tipi di pasta ci sono?"). */
function soggettoDallaDomanda(domanda: string): Porzione | null {
  const q = normalizzaRichiesta(domanda ?? "");
  const m = q.match(
    /\b(?:tipi|tipo|variet[àa]|varianti|versioni|prodotti|articoli)\s+(?:di\s+)?([^?.!,;]+)/
  );
  if (!m?.[1]) return null;
  const porzione = scomponi(m[1]);
  return porzione.soggetto ? porzione : null;
}

/**
 * Soggetto e attributo dell'ultima ricerca reale della conversazione.
 * I messaggi che contengono solo un attributo ("La voglio all'uovo") vengono
 * accumulati come filtro; il primo messaggio con un soggetto lo definisce.
 */
function contestoPrecedente(precedenti: string[]): Porzione | null {
  let qualificatore: string | null = null;
  for (let i = precedenti.length - 1; i >= 0; i--) {
    const porzione = scomponi(precedenti[i] ?? "");
    if (!qualificatore && porzione.qualificatore) qualificatore = porzione.qualificatore;
    if (porzione.soggetto) return { soggetto: porzione.soggetto, qualificatore };
  }
  return null;
}

export type SoggettoAggregato = {
  soggetto: string;
  qualificatore: string | null;
  /** true quando soggetto (e filtro) vengono dalla conversazione, non dalla domanda. */
  daContesto: boolean;
};

/**
 * Risolve il soggetto della domanda aggregata. Un soggetto esplicito e diverso
 * da quello già discusso apre una nuova ricerca e non eredita il filtro
 * precedente ("quanti tipi di scarpe ci sono?" dopo una ricerca sulla pasta).
 */
export function risolviSoggettoAggregato(
  domanda: string,
  precedenti: string[]
): SoggettoAggregato | null {
  const contesto = contestoPrecedente((precedenti ?? []).filter(Boolean));
  const chiesto = soggettoDallaDomanda(domanda);

  if (chiesto) {
    const stessoSoggetto =
      contesto != null &&
      normalizzaRichiesta(contesto.soggetto) === normalizzaRichiesta(chiesto.soggetto);
    return {
      soggetto: chiesto.soggetto,
      qualificatore: chiesto.qualificatore ?? (stessoSoggetto ? contesto?.qualificatore ?? null : null),
      daContesto: false,
    };
  }

  if (contesto) {
    return {
      soggetto: contesto.soggetto,
      qualificatore: contesto.qualificatore,
      daContesto: true,
    };
  }

  return null;
}

/** L'attributo ("uovo") è presente nel nome o nella descrizione del prodotto? */
export function prodottoCorrispondeQualificatore(
  prodotto: Pick<ProdottoRicerca, "nome" | "descrizione">,
  qualificatore: string
): boolean {
  const tokens = tokenizza(qualificatore).filter((t) => !PREP.has(t) && t.length >= 3);
  if (tokens.length === 0) return true;
  const testo = normalizzaRichiesta(
    `${prodotto.nome ?? ""} ${prodotto.descrizione ?? ""}`
  );
  return tokens.every((t) => testo.includes(t));
}

// ─── Risposta deterministica ─────────────────────────────────────────────────

export type EsitoAggregato = {
  tipo: "conteggio" | "elenco";
  soggetto: string;
  qualificatore: string | null;
  /** Prodotti recuperati per il soggetto. */
  prodottiSoggetto: ProdottoRicerca[];
  /** Prodotti recuperati per il filtro e verificati su nome/descrizione. */
  prodottiQualificatore?: ProdottoRicerca[];
  /** Limite massimo della ricerca: oltre, il conteggio diventa "almeno". */
  limite: number;
  riferimentoContesto?: boolean;
};

const CAVEAT =
  "Il conteggio si basa solo sulle schede pubblicate dai negozi su InCittà: non è un elenco esaustivo delle varietà esistenti.";

function unici(prodotti: ProdottoRicerca[]): ProdottoRicerca[] {
  const visti = new Set<string>();
  const risultato: ProdottoRicerca[] = [];
  for (const prodotto of prodotti ?? []) {
    const chiave = String(prodotto?.nome ?? "").trim().toLowerCase();
    if (!chiave || visti.has(chiave)) continue;
    visti.add(chiave);
    risultato.push(prodotto);
  }
  return risultato;
}

function conteggio(n: number, limite: number): string {
  const prefix = n >= limite ? "almeno " : "";
  return `${prefix}${n} ${n === 1 ? "prodotto" : "prodotti"}`;
}

function elenco(prodotti: ProdottoRicerca[]): string {
  return prodotti
    .slice(0, 5)
    .map((p) => {
      const prezzo = p.prezzo != null && String(p.prezzo).trim() !== "" ? ` — €${p.prezzo}` : "";
      return `- **${p.nome}**${prezzo}${p.negozio_nome ? ` (${p.negozio_nome})` : ""}`;
    })
    .join("\n");
}

/**
 * Compone la risposta a partire dai risultati REALI. Se il catalogo non ha
 * dati sufficienti la risposta lo dice e non produce alcun numero.
 */
export function componiRispostaAggregata(esito: EsitoAggregato): string {
  const tipo = esito.tipo;
  const soggetto = String(esito.soggetto ?? "").trim();
  const limite = Number.isFinite(esito.limite) && esito.limite > 0 ? esito.limite : 20;

  const base = unici(esito.prodottiSoggetto ?? []);
  const filtrati = esito.qualificatore
    ? unici(esito.prodottiQualificatore ?? [])
    : [];

  // Nessun filtro attivo: si risponde sul soggetto.
  if (!esito.qualificatore) {
    if (base.length === 0) {
      return (
        `Nel catalogo InCittà non risultano prodotti per «${soggetto}», quindi non posso dirti quanti ce ne sono: ` +
        "non invento un conteggio. Posso provare con un sinonimo, una categoria più ampia o un negozio specifico."
      );
    }
    const apertura =
      tipo === "conteggio"
        ? `Nel catalogo InCittà risultano ${conteggio(base.length, limite)} per «${soggetto}».`
        : `Nel catalogo InCittà ho trovato ${conteggio(base.length, limite)} per «${soggetto}».`;
    const nota = base.length >= limite
      ? ` La ricerca si ferma a ${limite} risultati, quindi il numero reale può essere maggiore.`
      : "";
    return `${apertura}${nota}\n\n${elenco(base)}\n\n${CAVEAT}`;
  }

  // Filtro attivo ma nessun prodotto che lo rispetti.
  if (filtrati.length === 0) {
    if (base.length === 0) {
      return (
        `Con il filtro «${esito.qualificatore}» non risulta alcun prodotto per «${soggetto}», ` +
        `e nel catalogo InCittà non trovo prodotti per «${soggetto}» nemmeno senza filtro. ` +
        "Non posso darti un conteggio affidabile e non invento un numero."
      );
    }
    return (
      `Con il filtro «${esito.qualificatore}» non risulta alcun prodotto per «${soggetto}». ` +
      `Senza quel filtro il catalogo InCittà ha ${conteggio(base.length, limite)} per «${soggetto}»:\n\n` +
      `${elenco(base)}\n\n${CAVEAT}`
    );
  }

  const nota = filtrati.length >= limite
    ? ` La ricerca si ferma a ${limite} risultati, quindi il numero reale può essere maggiore.`
    : "";

  // Domanda che punta esplicitamente al sottoinsieme già discusso
  // ("quanti prodotti di questo tipo ci sono?").
  if (esito.riferimentoContesto && tipo === "conteggio") {
    const totale = base.length > filtrati.length
      ? ` Per «${soggetto}» senza filtro il catalogo ne ha ${base.length}.`
      : "";
    return (
      `Con il filtro «${esito.qualificatore}» risultano ${conteggio(filtrati.length, limite)} per «${soggetto}».` +
      `${nota}${totale}\n\n${elenco(filtrati)}\n\n${CAVEAT}`
    );
  }

  // Domanda sul soggetto con un filtro ancora attivo: si dichiarano entrambi.
  return (
    `Per «${soggetto}» il catalogo InCittà ha ${conteggio(base.length, limite)}; ` +
    `${filtrati.length} ${filtrati.length === 1 ? "corrisponde" : "corrispondono"} al filtro «${esito.qualificatore}» già attivo.` +
    `${nota}\n\n${elenco(filtrati)}\n\n${CAVEAT}`
  );
}
