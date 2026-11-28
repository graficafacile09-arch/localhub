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
import { buildFinalPrompt } from "./prompt";
import {
  chiamataAIConBudgetPino,
  tempoRestanteAIPino,
  type BudgetPinoAI,
} from "./budget-ai";

export type SuggerimentoCatalogo = {
  nome: string;
  slug: string;
  categoria: string | null;
  prezzo: number | null;
  negozio: string | null;
};

const LIMITE_SUGGERIMENTI = 5;
const LIMITE_FALLBACK = 8;

// Vino e bevande: il loro abbinamento è il cibo.
const PAROLE_VINO = /\b(vino|vini|rosso|rosato|bianco|cirò|ciro|gaglioppo|magliocco|greco|mantonico|savuto|bivongi|pollino|birra|liquore|amaro|spumante)\b/i;

// Parole che indicano cibo gastronomico da abbinare a un vino.
const CATEGORIE_CIBO = ["salumi", "formaggi", "conserve", "pasta", "dolci", "olio", "miele", "pane"];

export function entitaEVino(entita: string | null | undefined): boolean {
  return PAROLE_VINO.test(String(entita ?? ""));
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
  const entitaVino = entitaEVino(entitaCorrente) || entitaEVino(query);
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

    const { data: prodotti } = await db
      .from("prodotti")
      .select("nome, slug, categoria, prezzo, negozio_id")
      .eq("attivo", true)
      .in("negozio_id", negozi.map((n) => n.id))
      .order("created_at", { ascending: false })
      .limit(200);

    const righe = (prodotti ?? []) as {
      nome: string;
      slug: string | null;
      categoria: string | null;
      prezzo: number | null;
      negozio_id: string;
    }[];

    const candidati = righe.filter((p) => {
      if (!p.slug) return false;
      const categoria = String(p.categoria ?? "").toLowerCase();
      const vinoOBevanda = entitaEVino(`${p.nome} ${categoria}`);
      return entitaVino ? !vinoOBevanda && categoria !== "" : vinoOBevanda;
    });

    // Per il vino preferisce il cibo di categorie note; per il cibo i vini.
    const ordinati = [...candidati].sort((a, b) => {
      const ca = CATEGORIE_CIBO.some((c) => String(a.categoria).toLowerCase().includes(c)) ? 0 : 1;
      const cb = CATEGORIE_CIBO.some((c) => String(b.categoria).toLowerCase().includes(c)) ? 0 : 1;
      return ca - cb;
    });

    // Filtro per parola chiave senza risultati: il catalogo attivo resta visibile
    // con gastronomia e bevande, così il suggerimento non torna mai vuoto.
    const tutti = righe.filter((p) => Boolean(p.slug));
    const èVinoOBevanda = (p: { nome: string; categoria: string | null }) =>
      entitaEVino(`${p.nome} ${p.categoria ?? ""}`);
    const sorgente =
      ordinati.length > 0
        ? ordinati
        : [
            ...tutti.filter((p) => !èVinoOBevanda(p)).slice(0, 4),
            ...tutti.filter((p) => èVinoOBevanda(p)).slice(0, 4),
          ];
    const limite = ordinati.length > 0 ? LIMITE_SUGGERIMENTI : LIMITE_FALLBACK;
    const visti = new Set<string>();
    const risultato: SuggerimentoCatalogo[] = [];
    for (const p of sorgente) {
      const slug = String(p.slug);
      if (visti.has(slug)) continue;
      visti.add(slug);
      risultato.push({
        nome: p.nome,
        slug,
        categoria: p.categoria,
        prezzo: p.prezzo == null ? null : Number(p.prezzo),
        negozio: nomeNegozio.get(String(p.negozio_id)) ?? null,
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
