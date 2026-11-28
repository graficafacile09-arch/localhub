/**
 * Suggerimenti di abbinamento letti dal catalogo in tempo reale.
 *
 * Pino non ha una lista fissa di prodotti: ogni richiesta legge da Supabase le
 * voci pubblicate oggi (prodotti attivi di negozi attivi). Così i prodotti
 * inseriti in futuro entrano automaticamente nei suggerimenti senza modificare
 * il codice. Non inventa nulla: ogni suggerimento è una riga reale con il suo
 * slug, da linkare come /prodotto/[slug].
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { callGroqText } from "@/lib/ai/groq";
import type { ProdottoRicerca } from "@/lib/ricerca-ai";
import { buildFinalPrompt } from "./prompt";
import {
  categoriaProdottoPino,
  eBevandaProdottoPino,
  eProdottoFinitoPino,
  type CategoriaProdottoPino,
} from "./prodotti-pino";
import {
  chiamataAIConBudgetPino,
  tempoRestanteAIPino,
  type BudgetPinoAI,
} from "./budget-ai";

export type SuggerimentoCatalogo = {
  id: string;
  nome: string;
  slug: string;
  categoria: string | null;
  descrizione: string | null;
  prezzo: number | null;
  negozio: string | null;
  negozio_id: string;
  immagine_principale: string | null;
  ha_varianti: boolean;
  quantita_disponibile: number | null;
  quantita_riservata: number | null;
};

/** Suggerimento pronto per le mini-card prodotto della chat. */
export function prodottoDaSuggerimentoCatalogo(s: SuggerimentoCatalogo): ProdottoRicerca {
  return {
    id: s.id,
    slug: s.slug,
    negozio_id: s.negozio_id,
    nome: s.nome,
    descrizione: s.descrizione,
    categoria: s.categoria,
    prezzo: s.prezzo ?? 0,
    negozio_nome: s.negozio ?? "",
    immagine_principale: s.immagine_principale,
    ha_varianti: s.ha_varianti,
    quantita_disponibile: s.quantita_disponibile,
    quantita_riservata: s.quantita_riservata,
  };
}

/**
 * Mini-card da mostrare in chat: prima i prodotti che Pino ha citato davvero,
 * poi i più pertinenti all'abbinamento, al massimo `massimo` card.
 */
export function selezionaProdottiSuggeritiPino(
  suggerimenti: SuggerimentoCatalogo[],
  testo: string,
  massimo = 3,
  famiglia: CategoriaProdottoPino | null = null
): ProdottoRicerca[] {
  const normalizzato = normalizzaTesto(testo);
  const citati = suggerimenti.filter((s) => {
    const nome = normalizzaTesto(s.nome);
    return nome.length > 3 && normalizzato.includes(nome);
  });
  const ordine = [
    ...citati,
    ...suggerimenti.filter((s) => !citati.includes(s)),
  ];
  let scelti = ordine.slice(0, Math.max(0, massimo));
  // Su un alimento da cucinare la card del vino non deve mai mancare, anche se
  // il modello non l'ha linkato: se nei primi posti non c'è, entra al posto
  // dell'ultimo complemento.
  if (famiglia === "alimento" && massimo > 0) {
    const vino = ordine.find((s) => eVinoCalabreseSuggerimento(s));
    if (vino && !scelti.includes(vino)) {
      scelti = [...scelti.slice(0, Math.max(0, massimo - 1)), vino];
    }
  }
  return scelti.map(prodottoDaSuggerimentoCatalogo);
}

function eVinoCalabreseSuggerimento(s: SuggerimentoCatalogo): boolean {
  return eBevandaProdottoPino(`${s.nome} ${s.categoria ?? ""}`) && !eProdottoFinitoPino(s.nome);
}

type RigaProdottoCatalogo = {
  id: string;
  nome: string;
  slug: string | null;
  categoria: string | null;
  descrizione: string | null;
  prezzo: number | null;
  negozio_id: string;
  immagine_principale: string | null;
  ha_varianti: boolean | null;
  quantita_disponibile: number | null;
  quantita_riservata: number | null;
};

const CAMPI_PRODOTTO_CATALOGO =
  "id, nome, slug, categoria, descrizione, prezzo, negozio_id, immagine_principale, ha_varianti, quantita_disponibile, quantita_riservata";

const LIMITE_SUGGERIMENTI = 5;
const LIMITE_FALLBACK = 8;

// Parole che indicano cibo gastronomico da abbinare a un vino.
const CATEGORIE_CIBO = ["salumi", "formaggi", "conserve", "pasta", "dolci", "olio", "miele", "pane"];

// Abbinamento ai dolci e ai prodotti finiti: si cercano passiti e liquori.
const TERMINI_PASSITI_LIQUORI = [
  "moscato",
  "passito",
  "liquore",
  "amaro",
  "greco di bianco",
  "magliocco dolce",
  "vino",
];

// Alimenti da cucinare: prima le etichette calabresi, poi il resto dei vini.
const TERMINI_VINI_ALIMENTO = [
  "terre di cosenza",
  "montonico",
  "pollino rosato",
  "pollino rosso",
  "cirò",
  "ciro",
  "gaglioppo",
  "magliocco",
  "mantonico",
  "greco",
  "savuto",
  "bivongi",
  "vino",
  "rosato",
  "rosso",
];

// Termini delle etichette calabresi da abbinare a un alimento da cucinare.
const TERMINI_VINI_CALABRESI_DEDICATI = [
  "vino",
  "doc",
  "igp",
  "cirò",
  "ciro",
  "pollino",
  "montonico",
  "mantonico",
  "gaglioppo",
  "magliocco",
  "savuto",
  "terre di cosenza",
  "rosato",
  "rosso",
];

// Ingredienti complementari da suggerire accanto a un ortaggio o un legume.
const TERMINI_COMPLEMENTI_ALIMENTO = [
  "pecorino",
  "caciocavallo",
  "ricotta",
  "olio",
  "guanciale",
  "peperoncino",
  "pane",
];

// Cibo gastronomico da abbinare quando la domanda è su un vino.
const TERMINI_CIBO_VINO = [
  "salumi",
  "formaggi",
  "conserve",
  "pasta",
  "olio",
  "miele",
  "pane",
  "pecorino",
  "caciocavallo",
  "nduja",
];

/**
 * Vero per un vino o una bevanda: usa la classificazione di prodotti-pino, che
 * non scambia «Cipolla bianca di Castrovillari» per un vino bianco.
 */
export function entitaEVino(entita: string | null | undefined): boolean {
  return eBevandaProdottoPino(String(entita ?? ""));
}

function normalizzaTesto(testo: string): string {
  return String(testo ?? "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vero per passiti, vini dolci e liquori: l'abbinamento di un dolce. */
function eBevandaAbbinamentoPino(p: RigaProdottoCatalogo): boolean {
  const testo = `${p.nome} ${p.categoria ?? ""}`;
  return eBevandaProdottoPino(testo) || /\b(liquor\w*|amar[oi])\b/.test(normalizzaTesto(testo));
}

/** Vero per un'etichetta di vino (i liquori restano fuori). */
function eVinoPino(p: RigaProdottoCatalogo): boolean {
  const testo = `${p.nome} ${p.categoria ?? ""}`;
  return eBevandaProdottoPino(testo) && !eProdottoFinitoPino(testo);
}

/** Vero per formaggi, salumi, olio e altri ingredienti da portare in tavola. */
function eComplementoAlimentoPino(p: RigaProdottoCatalogo): boolean {
  const categoria = String(p.categoria ?? "").toLowerCase();
  if (CATEGORIE_CIBO.some((c) => categoria.includes(c))) return true;
  const testo = normalizzaTesto(`${p.nome} ${categoria}`);
  return TERMINI_COMPLEMENTI_ALIMENTO.some((termine) => testo.includes(termine));
}

function punteggioTermini(p: RigaProdottoCatalogo, termini: string[]): number {
  const testo = normalizzaTesto(`${p.nome} ${p.categoria ?? ""}`);
  const indice = termini.findIndex((termine) => testo.includes(termine));
  return indice === -1 ? termini.length : indice;
}

function terminiMiratiPino(famiglia: CategoriaProdottoPino): string[] {
  switch (famiglia) {
    case "dolce":
      return TERMINI_PASSITI_LIQUORI;
    case "alimento":
      return [...TERMINI_VINI_ALIMENTO, ...TERMINI_COMPLEMENTI_ALIMENTO];
    default:
      return TERMINI_CIBO_VINO;
  }
}

/** Famiglia del prodotto corrente: il modello chiede sempre il caso giusto. */
export function famigliaProdottoPino(
  entitaCorrente: string | null | undefined,
  query: string
): CategoriaProdottoPino {
  const entita = String(entitaCorrente ?? "").trim();
  return categoriaProdottoPino(entita || query);
}

function deduplicaPerSlug(righe: RigaProdottoCatalogo[]): RigaProdottoCatalogo[] {
  const visti = new Set<string>();
  const uniche: RigaProdottoCatalogo[] = [];
  for (const riga of righe) {
    const chiave = String(riga.slug ?? riga.id);
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    uniche.push(riga);
  }
  return uniche;
}

async function cercaProdottiCatalogo(
  db: ReturnType<typeof createAdminSupabaseClient>,
  idsNegozi: string[],
  termini: string[] | null,
  limite: number
): Promise<RigaProdottoCatalogo[]> {
  let query = db
    .from("prodotti")
    .select(CAMPI_PRODOTTO_CATALOGO)
    .eq("attivo", true)
    .in("negozio_id", idsNegozi);
  if (termini && termini.length > 0) {
    query = query.or(
      termini
        .flatMap((termine) => [`nome.ilike.%${termine}%`, `categoria.ilike.%${termine}%`])
        .join(",")
    );
  }
  const { data } = await query.order("created_at", { ascending: false }).limit(limite);
  return (data ?? []) as unknown as RigaProdottoCatalogo[];
}

function ordinaCandidatiPino(
  righe: RigaProdottoCatalogo[],
  famiglia: CategoriaProdottoPino
): RigaProdottoCatalogo[] {
  // Dolci e prodotti finiti: solo passiti, vini dolci e liquori, i più vicini
  // all'abbinamento per primi (Moscato al Governo, Greco di Bianco, liquori).
  if (famiglia === "dolce") {
    return righe
      .filter(eBevandaAbbinamentoPino)
      .sort((a, b) => punteggioTermini(a, TERMINI_PASSITI_LIQUORI) - punteggioTermini(b, TERMINI_PASSITI_LIQUORI));
  }
  // Alimento da cucinare: prima i vini calabresi (servono all'abbinamento),
  // poi gli ingredienti complementari. Così la ricetta ha sempre la bottiglia.
  if (famiglia === "alimento") {
    const vini = righe
      .filter(eVinoPino)
      .sort((a, b) => punteggioTermini(a, TERMINI_VINI_ALIMENTO) - punteggioTermini(b, TERMINI_VINI_ALIMENTO))
      .slice(0, 3);
    const complementi = righe
      .filter((p) => !eBevandaAbbinamentoPino(p) && eComplementoAlimentoPino(p))
      .sort(
        (a, b) =>
          punteggioTermini(a, TERMINI_COMPLEMENTI_ALIMENTO) -
          punteggioTermini(b, TERMINI_COMPLEMENTI_ALIMENTO)
      );
    return [...vini, ...complementi];
  }
  // Domanda su un vino: il cibo gastronomico di categorie note viene prima.
  return righe
    .filter((p) => !eBevandaAbbinamentoPino(p) && String(p.categoria ?? "").trim() !== "")
    .sort((a, b) => punteggioTermini(a, TERMINI_CIBO_VINO) - punteggioTermini(b, TERMINI_CIBO_VINO));
}

/**
 * Restituisce fino a 5 prodotti reali da abbinare alla domanda corrente:
 * - se l'entità è un vino/bevanda, prodotti gastronomici (salumi, formaggi, ecc.);
 * - se è un alimento, vini e bevande del catalogo.
 * In caso di errore o di catalogo vuoto restituisce [] (il chiamante resta onesto).
 */
export async function recuperaSuggerimentiCatalogoDinamici(
  entitaCorrente: string | null | undefined,
  query: string
): Promise<SuggerimentoCatalogo[]> {
  const famiglia = famigliaProdottoPino(entitaCorrente, query);
  try {
    const db = createAdminSupabaseClient();
    const { data: negoziAttivi } = await db
      .from("negozi")
      .select("id, nome")
      .eq("attivo", true)
      .is("deleted_at", null)
      .limit(500);
    const negozi = (negoziAttivi ?? []) as { id: string; nome: string }[];
    if (negozi.length === 0) return [];
    const nomeNegozio = new Map(negozi.map((n) => [String(n.id), n.nome]));

    const idsNegozi = negozi.map((n) => String(n.id));

    // Due letture in parallelo: una mirata sui termini dell'abbinamento (così i
    // passiti e le etichette calabresi entrano anche se sono righe vecchie) e
    // una recente come rete di sicurezza quando il catalogo non ha quei termini.
    const [mirati, recenti, vini] = await Promise.all([
      cercaProdottiCatalogo(db, idsNegozi, terminiMiratiPino(famiglia), 60),
      cercaProdottiCatalogo(db, idsNegozi, null, 200),
      // Per un alimento: lettura dedicata ai vini calabresi, così la bottiglia
      // da abbinare c'è sempre anche se le altre letture l'hanno esclusa.
      famiglia === "alimento"
        ? cercaProdottiCatalogo(db, idsNegozi, TERMINI_VINI_CALABRESI_DEDICATI, 40)
        : Promise.resolve([] as RigaProdottoCatalogo[]),
    ]);
    const righe = deduplicaPerSlug([...vini, ...mirati, ...recenti]);
    const tutti = righe.filter((p) => Boolean(p.slug));
    const ordinati = ordinaCandidatiPino(tutti, famiglia);

    // Filtro per parola chiave senza risultati: il catalogo attivo resta visibile
    // con gastronomia e bevande, così il suggerimento non torna mai vuoto.
    const sorgente =
      ordinati.length > 0
        ? ordinati
        : [
            ...tutti.filter((p) => !eBevandaAbbinamentoPino(p)).slice(0, 4),
            ...tutti.filter((p) => eBevandaAbbinamentoPino(p)).slice(0, 4),
          ];
    const limite = ordinati.length > 0 ? LIMITE_SUGGERIMENTI : LIMITE_FALLBACK;
    const visti = new Set<string>();
    const risultato: SuggerimentoCatalogo[] = [];
    for (const p of sorgente) {
      const slug = String(p.slug);
      if (visti.has(slug)) continue;
      visti.add(slug);
      risultato.push({
        id: String(p.id),
        nome: p.nome,
        slug,
        categoria: p.categoria,
        descrizione: p.descrizione,
        prezzo: p.prezzo == null ? null : Number(p.prezzo),
        negozio: nomeNegozio.get(String(p.negozio_id)) ?? null,
        negozio_id: String(p.negozio_id),
        immagine_principale: p.immagine_principale,
        ha_varianti: Boolean(p.ha_varianti),
        quantita_disponibile: p.quantita_disponibile,
        quantita_riservata: p.quantita_riservata,
      });
      if (risultato.length >= limite) break;
    }
    return risultato;
  } catch (errore) {
    console.warn("[pino-suggerimenti] catalogo non disponibile:", errore);
    return [];
  }
}

/**
 * Risposta discorsiva finale di Pino (Chef & Sommelier): il modello scrive il
 * testo con la cronologia, l'entità corrente, i dati di catalogo e i
 * suggerimenti letti adesso. Se Groq non risponde (errore, timeout o budget
 * esaurito) restituisce null e il chiamante usa il paracadute deterministico.
 */
export async function componiRispostaChefPino({
  systemPrompt,
  storico,
  blocchi,
  budgetAI,
  deadlineMs,
  signal,
}: {
  systemPrompt: string;
  storico: Parameters<typeof buildFinalPrompt>[0];
  blocchi: string;
  budgetAI: BudgetPinoAI | undefined;
  deadlineMs?: number;
  signal?: AbortSignal;
}): Promise<string | null> {
  try {
    const testo = await chiamataAIConBudgetPino(budgetAI, () =>
      callGroqText({
        systemPrompt,
        userPrompt: buildFinalPrompt(storico, blocchi),
        temperature: 0.45,
        maxTokens: 1500,
        timeoutMs: Math.max(1_000, Math.min(8_000, tempoRestanteAIPino(budgetAI))),
        deadlineMs,
        signal,
      })
    );
    return testo?.trim() ? testo.trim() : null;
  } catch (errore) {
    console.warn("[pino-finale] risposta AI non disponibile:", errore);
    return null;
  }
}
