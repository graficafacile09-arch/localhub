/**
 * LocalHub — Pino: degradazione controllata.
 *
 * Regola: l'utente riceve SEMPRE una risposta utile, anche quando il percorso
 * AI non risponde in tempo o lancia. In quel caso Pino usa il motore di ricerca
 * tradizionale (`lib/search-service.ts`, 100% database) e restituisce i
 * risultati reali con un messaggio preconfezionato.
 *
 * Il modulo non chiama Gemini, non scrive su database e non conosce HTTP:
 * la route decide lo status (sempre 200) e il formato (JSON o streaming).
 *
 * @module lib/assistente/degradazione
 */

import { search, type SearchResult } from "@/lib/search-service";
import { rilevaLinguaConversazionePino } from "@/lib/assistente/understanding";
import type { MessaggioAssistente, RispostaAssistente } from "@/lib/assistente";

/** Esito di una promessa con scadenza: nessuna eccezione per il timeout. */
export type EsitoScadenzaPino<T> =
  | { ok: true; valore: T }
  | { ok: false; motivo: "timeout" };

/**
 * Attende `promessa` al massimo `ms` millisecondi. Allo scadere restituisce
 * `{ ok: false }` senza lanciare: il chiamante prosegue con il fallback.
 * Un'eventuale rejection successiva al timeout non produce unhandled
 * rejection (il gestore è già registrato).
 */
export function conScadenzaPino<T>(
  promessa: Promise<T>,
  ms: number
): Promise<EsitoScadenzaPino<T>> {
  return new Promise((resolve, reject) => {
    let concluso = false;
    const timer = setTimeout(() => {
      if (concluso) return;
      concluso = true;
      resolve({ ok: false, motivo: "timeout" });
    }, Math.max(1, ms));

    promessa.then(
      (valore) => {
        if (concluso) return;
        concluso = true;
        clearTimeout(timer);
        resolve({ ok: true, valore });
      },
      (errore) => {
        if (concluso) return;
        concluso = true;
        clearTimeout(timer);
        reject(errore);
      }
    );
  });
}

const INTRO = {
  it: "La ricerca intelligente non è momentaneamente disponibile. Intanto, la ricerca del catalogo ha trovato questi risultati:",
  en: "Smart search is temporarily unavailable. In the meantime, the catalogue search found these results:",
} as const;

const VUOTO = {
  it: "Non ho trovato prodotti o negozi corrispondenti nel catalogo attuale. È possibile che questi articoli o questa categoria non siano più pubblicati. Prova con un altro prodotto, una categoria o il nome di un negozio.",
  en: "I couldn't find matching products or shops in the current catalogue. These items or this category may no longer be listed. Try another product, category or shop name.",
} as const;

const NESSUN_DATO = {
  it: "In questo momento non riesco a consultare il catalogo. Riprova tra poco.",
  en: "I can't access the catalogue right now. Please try again in a moment.",
} as const;

/** Dipendenze iniettabili: i test usano un motore finto, la route quello vero. */
export type DipendenzeDegradazionePino = {
  cerca?: (query: string) => Promise<Pick<SearchResult, "negozi" | "prodotti">>;
};

function prezzo(p: unknown): string {
  const valore = Number((p as { prezzo?: unknown })?.prezzo);
  return Number.isFinite(valore) && valore > 0 ? `€ ${valore.toFixed(2)}` : "";
}

/**
 * Elenco compatto e deterministico: solo dati già recuperati, nessun testo
 * generato dal modello e nessun prezzo inventato.
 */
function componiElenco(
  risultati: Pick<SearchResult, "negozi" | "prodotti">
): string[] {
  const righe: string[] = [];

  for (const prodotto of risultati.prodotti.slice(0, 5)) {
    const titolo = String((prodotto as { nome?: unknown }).nome ?? "").trim();
    if (!titolo) continue;
    const negozio = String(
      (prodotto as { negozio_nome?: unknown }).negozio_nome ?? ""
    ).trim();
    const costo = prezzo(prodotto);
    righe.push(
      `- **${titolo}**${costo ? ` — ${costo}` : ""}${negozio ? ` · ${negozio}` : ""}`
    );
  }

  for (const negozio of risultati.negozi.slice(0, 3)) {
    const titolo = String((negozio as { nome?: unknown }).nome ?? "").trim();
    if (!titolo) continue;
    const categoria = String(
      (negozio as { categoria?: unknown }).categoria ?? ""
    ).trim();
    righe.push(`- **${titolo}**${categoria ? ` — ${categoria}` : ""}`);
  }

  return righe;
}

/**
 * Risposta di riserva costruita sul motore tradizionale.
 *
 * - nessun messaggio utente → messaggio neutro, nessuna ricerca;
 * - risultati trovati → intro + elenco compatto;
 * - zero risultati → intro + invito a restringere, senza inventare prodotti.
 */
export async function rispostaDegradataPino(
  messaggi: MessaggioAssistente[],
  dipendenze: DipendenzeDegradazionePino = {}
): Promise<RispostaAssistente> {
  const inizio = Date.now();
  const lingua = rilevaLinguaConversazionePino(messaggi) === "en" ? "en" : "it";
  const domanda = (messaggi[messaggi.length - 1]?.content ?? "").trim().slice(0, 400);

  if (!domanda) {
    return {
      risposta: NESSUN_DATO[lingua],
      negozi: [],
      prodotti: [],
      processingMs: Date.now() - inizio,
      source: "assistente",
    };
  }

  const cerca = dipendenze.cerca ?? ((query: string) => search(query));
  const risultati = await cerca(domanda);
  const elenco = componiElenco(risultati);

  return {
    risposta:
      elenco.length > 0
        ? `${INTRO[lingua]}\n\n${elenco.join("\n")}`
        : `${VUOTO[lingua]}`,
    negozi: risultati.negozi,
    prodotti: risultati.prodotti,
    processingMs: Date.now() - inizio,
    source: "assistente",
  };
}

/** Messaggio minimo per il caso in cui anche la ricerca classica fallisce. */
export function rispostaIndisponibilePino(
  messaggi: MessaggioAssistente[]
): RispostaAssistente {
  const lingua = rilevaLinguaConversazionePino(messaggi) === "en" ? "en" : "it";
  return {
    risposta: NESSUN_DATO[lingua],
    negozi: [],
    prodotti: [],
    processingMs: 0,
    source: "assistente",
  };
}
