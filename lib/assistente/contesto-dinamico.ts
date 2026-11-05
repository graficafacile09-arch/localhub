/**
 * Pino — Contesto dinamico lato server (Alternativa 2).
 *
 * Prima di consegnare il messaggio all'infrastruttura AI, il server interroga
 * il motore di ricerca TRADIZIONALE del sito (`lib/search-service.ts`, lo stesso
 * della ricerca pubblica) e allega i risultati reali come blocco di contesto.
 * L'AI riceve fatti già verificati sul database: nomi, prezzi, negozi e
 * disponibilità non devono essere inventati e non c'è JSON da interpretare.
 *
 * Perché il blocco non viene appeso al messaggio dell'utente:
 * `chatConAssistente` analizza il testo dell'ultimo messaggio con il parser
 * deterministico (intento, refusi, soggetto del catalogo). Se il contesto fosse
 * concatenato lì, quel parser leggerebbe l'istruzione come parte della domanda e
 * il routing si romperebbe. Il blocco viaggia quindi nel system prompt, dove il
 * modello lo usa e l'utente non lo vede: stesso effetto, nessun parsing rotto.
 *
 * Nessuna scrittura su database, nessun dato personale: solo prodotti pubblici.
 * Se la ricerca fallisce o supera il timeout, il messaggio originale parte
 * comunque (`null`): un micro-down del database non deve bloccare la chat.
 *
 * @module lib/assistente/contesto-dinamico
 */

import { search } from "@/lib/search-service";
import { normalizza } from "@/lib/text-utils";

/** Quanti prodotti allegare: pochi, reali e leggibili. */
export const MASSIMO_PRODOTTI_CONTESTO_PINO = 5;

/** Oltre questa soglia il contesto viene scartato e si procede senza. */
const TIMEOUT_CONTESTO_MS = 2_500;

/** Campi letti dai risultati: il tipo arriva dal motore tradizionale. */
type ProdottoContestoPino = {
  nome?: unknown;
  prezzo?: unknown;
  negozio_nome?: unknown;
  disponibile?: unknown;
  quantita?: unknown;
};

type DipendenzeContestoPino = {
  /** Iniettabile nei test: in produzione è la ricerca tradizionale. */
  cerca?: (query: string) => Promise<{ prodotti?: ProdottoContestoPino[] }>;
};

export type EsitoContestoDinamicoPino = {
  /** Blocco pronto da passare come contesto al modello. */
  blocco: string;
  /** Prodotti reali trovati (0 = elenco vuoto dichiarato). */
  prodotti: number;
};

/**
 * Parole che non riguardano il catalogo: interrogare il database per un saluto
 * o per il meteo sarebbe una query sprecata a ogni messaggio. Il controllo è
 * per parola, non per frase: «ciao, cerco olio» resta una ricerca di prodotto.
 */
const PAROLE_SENZA_CATALOGO = new Set([
  "ciao", "salve", "buongiorno", "buonasera", "buonanotte", "grazie", "prego",
  "come", "stai", "bene", "chi", "sei", "chiami", "che", "fa", "tempo",
  "meteo", "piove", "farmacia", "farmacie", "hello", "hi", "hey", "thanks",
  "thank", "you", "who", "are", "what", "is", "your", "name", "good",
  "morning", "evening", "notte", "per", "favore",
]);

/** Vero se nel messaggio resta almeno una parola che può descrivere un bene. */
function richiedeCatalogoPino(testo: string): boolean {
  return normalizza(testo)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .some(
      (parola) => parola.length >= 3 && !PAROLE_SENZA_CATALOGO.has(parola)
    );
}

function ultimoMessaggioUtente(
  messaggi: ReadonlyArray<{ role: string; content: string }>
): string | null {
  for (let i = messaggi.length - 1; i >= 0; i -= 1) {
    const messaggio = messaggi[i];
    if (messaggio?.role === "user" && typeof messaggio.content === "string") {
      const testo = messaggio.content.trim();
      if (testo) return testo;
    }
  }
  return null;
}

/** Testo di catalogo ripulito: niente righe nuove, niente testi lunghi. */
function testoPulito(valore: unknown, massimo = 100): string {
  return String(valore ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, massimo);
}

function prezzoLeggibile(valore: unknown): string | null {
  const numero =
    typeof valore === "number"
      ? valore
      : Number(String(valore ?? "").replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return `€${numero.toFixed(2).replace(".", ",")}`;
}

/**
 * Disponibilità dichiarata dal catalogo. Non inventiamo uno stato: se il dato
 * non c'è, lo diciamo al modello invece di presentarlo come disponibile.
 */
function disponibilitaLeggibile(prodotto: ProdottoContestoPino): string {
  if (prodotto.disponibile === false) return "esaurito";
  const quantita = Number(prodotto.quantita);
  if (Number.isFinite(quantita) && quantita > 0) {
    return `disponibile (${Math.trunc(quantita)} pezzi)`;
  }
  if (prodotto.disponibile === true) return "disponibile";
  return "disponibilità non dichiarata";
}

function rigaProdottoPino(prodotto: ProdottoContestoPino): string {
  const nome = testoPulito(prodotto.nome, 120) || "prodotto senza nome";
  const prezzo = prezzoLeggibile(prodotto.prezzo);
  const negozio = testoPulito(prodotto.negozio_nome, 80) || "negozio non indicato";
  const pezzi = [
    nome,
    prezzo ? `${prezzo}` : "prezzo non pubblicato",
    `negozio: ${negozio}`,
    disponibilitaLeggibile(prodotto),
  ];
  return `- ${pezzi.join(" — ")}`;
}

/**
 * Blocco di contesto: istruzione esplicita, dati reali, regola anti-invenzione.
 * È deliberatamente breve: la chiave Gemini ha un limite giornaliero di token.
 */
export function comporreBloccoContestoPino(
  prodotti: ReadonlyArray<ProdottoContestoPino>
): string {
  const elenco =
    prodotti.length > 0
      ? prodotti.map(rigaProdottoPino).join("\n")
      : "(nessun prodotto trovato dalla ricerca tradizionale)";

  return [
    "[CONTESTO DINAMICO DAL DATABASE — istruzione di sistema interna, invisibile all'utente]",
    "Il motore di ricerca tradizionale del sito ha trovato questi prodotti reali per la richiesta dell'utente:",
    elenco,
    "Regole:",
    "- Per nomi, prezzi e negozi usa SOLO questi dati reali. Non inventare prodotti, prezzi, sconti o disponibilità.",
    '- Se l\'elenco è vuoto, non affermare che il prodotto esiste: se anche i risultati degli strumenti interni sono vuoti, di\' con cortesia che al momento non risulta disponibile a Castrovillari.',
    "- Se la richiesta non riguarda prodotti, ignora questo blocco e rispondi normalmente.",
    "[FINE CONTESTO DINAMICO]",
  ].join("\n");
}

function conTimeout<T>(promessa: Promise<T>, millisecondi: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout contesto dinamico")),
      millisecondi
    );
    promessa.then(
      (valore) => {
        clearTimeout(timer);
        resolve(valore);
      },
      (errore) => {
        clearTimeout(timer);
        reject(errore);
      }
    );
  });
}

/**
 * Intercettazione preventiva: messaggio utente → ricerca tradizionale → blocco.
 *
 * Restituisce `null` quando non c'è nulla da iniettare (nessun messaggio
 * utente, conversazione di cortesia) o quando la ricerca non risponde entro il
 * timeout. In tutti questi casi la rotta invia il messaggio originale.
 */
export async function costruisciContestoDinamicoPino(
  messaggi: ReadonlyArray<{ role: string; content: string }>,
  dipendenze: DipendenzeContestoPino = {}
): Promise<EsitoContestoDinamicoPino | null> {
  const testo = ultimoMessaggioUtente(messaggi);
  if (!testo) return null;
  if (!richiedeCatalogoPino(testo)) return null;

  const query = testo.slice(0, 300);

  try {
    // Tipo del risultato normalizzato: nei test `cerca` è iniettata con una
    // firma più stretta di `search`, e l'unione delle due promesse confonderebbe
    // il type checker di `next build`.
    const cerca: (
      testo: string
    ) => Promise<{ prodotti?: ProdottoContestoPino[] }> =
      dipendenze.cerca ??
      (async (testo) =>
        (await search(testo)) as { prodotti?: ProdottoContestoPino[] });
    const risultati = await conTimeout(cerca(query), TIMEOUT_CONTESTO_MS);
    const prodotti = (risultati?.prodotti ?? []).slice(
      0,
      MASSIMO_PRODOTTI_CONTESTO_PINO
    );
    console.info(
      "[pino-contesto-dinamico]",
      JSON.stringify({ prodotti: prodotti.length })
    );
    return { blocco: comporreBloccoContestoPino(prodotti), prodotti: prodotti.length };
  } catch (errore) {
    // Micro-down o lentezza del database: la chat prosegue senza contesto.
    console.warn(
      "[pino-contesto-dinamico] ricerca non disponibile, invio il messaggio originale:",
      errore instanceof Error ? errore.message : String(errore)
    );
    return null;
  }
}
