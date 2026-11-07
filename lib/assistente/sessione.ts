/**
 * Pino — memoria minima di sessione.
 *
 * Il contratto della chat è stateless: la cronologia recente viaggia nei
 * messaggi. Dopo un reload, però, «e rosso?» non ha più un soggetto e finiva
 * in una ricerca generica. Qui si conserva SOLO lo stato canonico dell'ultima
 * ricerca (soggetto, attributi, budget), mai il testo della domanda.
 *
 * - lettura solo per i messaggi brevi di continuazione (nessun costo sulle
 *   ricerche normali);
 * - scrittura non bloccante, con timeout breve e degrado silenzioso se la
 *   tabella non è disponibile;
 * - `session_id` è un identificativo casuale generato dal client, validato
 *   prima di ogni query.
 *
 * @module lib/assistente/sessione
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { soggettoAlimentarePino } from "./lexicon";
import { normalizzaRichiesta } from "./local-intents";
import { costruisciStatoConversazionale } from "./semantica";
import { estraiAttributiPino, estraiSoggettoPino } from "./understanding";

export type SessionePino = {
  soggetto: string;
  attributi: string[];
  maxPrice: number | null;
};

type MessaggioSessionePino = {
  role: "user" | "assistant";
  content: string;
};

const RE_SESSION_ID = /^[A-Za-z0-9_-]{8,128}$/;
const TIMEOUT_SESSIONE_MS = 900;

/** L'identificativo è generato dal client: niente spazi, niente testo libero. */
export function sessionIdValidoPino(id: unknown): id is string {
  return typeof id === "string" && RE_SESSION_ID.test(id);
}

const STOP_CONTINUAZIONE: ReadonlySet<string> = new Set([
  "e", "ed", "anche", "solo", "quello", "quella", "quelli", "quelle",
  "allora", "invece", "piu", "più", "con", "senza", "non", "ma", "pero",
  "però", "di", "da", "in", "su", "per", "il", "lo", "la", "i", "gli",
  "le", "un", "uno", "una", "the", "and", "also", "only", "that", "those",
]);

/**
 * Vero se il messaggio è una continuazione breve («e rosso?», «solo rossi»,
 * «e sotto 10 euro?») e non una nuova domanda indipendente.
 */
export function sembraContinuazionePino(query: string): boolean {
  const q = normalizzaRichiesta(query ?? "").replace(/[?.!]+$/g, "").trim();
  if (!q) return false;
  const parole = q.split(/\s+/).filter(Boolean);
  if (parole.length > 6) return false;
  if (/^(?:e|ed|anche|solo|quello|quella|quelli|quelle|allora|invece|piu|più|con|senza|non|ma|pero|però)\b/.test(q)) {
    return true;
  }
  const attributi = estraiAttributiPino(q);
  const valori = [
    ...attributi.colori,
    ...attributi.materiali,
    ...attributi.provenienza,
    ...attributi.altri,
  ];
  if (valori.length === 0) return false;
  return parole.every((parola) => STOP_CONTINUAZIONE.has(parola) || valori.includes(parola));
}

/**
 * Ricostruisce la domanda del turno con il soggetto appreso nella sessione.
 * Se il messaggio contiene già un soggetto alimentare, resta una nuova ricerca.
 */
export function componiDomandaConSessionePino(
  domanda: string,
  sessione: SessionePino | null | undefined
): string {
  if (!sessione?.soggetto) return domanda;
  if (!sembraContinuazionePino(domanda)) return domanda;
  if (soggettoAlimentarePino(domanda)) return domanda;

  const testo = normalizzaRichiesta(domanda ?? "")
    .replace(/[?.!]+$/g, " ")
    .replace(/^(?:e|ed|anche|solo|allora|invece|piu|più|ma|pero|però)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!testo) return domanda;

  const attributi = sessione.attributi
    .map((attributo) => normalizzaRichiesta(attributo))
    .filter((attributo) => attributo && !testo.includes(attributo));
  // Il budget appreso resta valido finché il turno non ne dichiara uno nuovo.
  const haBudget = /\d|\b(?:euro|eur|€)\b/.test(testo);
  const budget =
    sessione.maxPrice !== null && !haBudget
      ? ` sotto ${sessione.maxPrice} euro`
      : "";

  return `${sessione.soggetto}${attributi.length ? ` ${attributi.join(" ")}` : ""} ${testo}${budget}`.trim();
}

function conTimeoutSessione<T>(promessa: Promise<T>, millisecondi: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout sessione Pino")),
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

/** Legge lo stato canonico della sessione. Non lancia mai. */
export async function recuperaSessionePino(
  sessionId: string
): Promise<SessionePino | null> {
  if (!sessionIdValidoPino(sessionId)) return null;
  try {
    const db = createAdminSupabaseClient();
    const query = db
      .from("pino_sessioni")
      .select("soggetto, attributi, max_price")
      .eq("session_id", sessionId)
      .limit(1);
    const { data, error } = await conTimeoutSessione(
      Promise.resolve(query),
      TIMEOUT_SESSIONE_MS
    );
    if (error) {
      console.warn("[pino-sessione] lettura non disponibile:", error.message);
      return null;
    }
    const riga = Array.isArray(data) ? data[0] : null;
    if (!riga || typeof riga.soggetto !== "string" || !riga.soggetto.trim()) {
      return null;
    }
    return {
      soggetto: riga.soggetto,
      attributi: Array.isArray(riga.attributi)
        ? riga.attributi.filter((a: unknown): a is string => typeof a === "string").slice(0, 8)
        : [],
      maxPrice: typeof riga.max_price === "number" ? riga.max_price : null,
    };
  } catch (errore) {
    console.warn(
      "[pino-sessione] lettura non disponibile:",
      errore instanceof Error ? errore.message : String(errore)
    );
    return null;
  }
}

/**
 * Salva lo stato canonico del turno. Il testo della domanda non viene mai
 * scritto: solo soggetto, attributi e budget, utili a ricostruire il contesto.
 */
export async function salvaSessionePino(input: {
  sessionId: string;
  messaggi: ReadonlyArray<MessaggioSessionePino>;
}): Promise<void> {
  if (!sessionIdValidoPino(input.sessionId)) return;
  try {
    const stato = costruisciStatoConversazionale([...input.messaggi]);
    const base = stato.query ?? stato.richiesta;
    if (!base) return;
    const soggetto =
      soggettoAlimentarePino(base) ?? estraiSoggettoPino(base);
    if (!soggetto) return;

    const attributi = estraiAttributiPino(stato.richiesta);
    const elenco = Array.from(
      new Set([
        ...attributi.colori,
        ...attributi.materiali,
        ...attributi.provenienza,
        ...attributi.altri,
      ])
    ).slice(0, 8);

    const db = createAdminSupabaseClient();
    const scrittura = db.from("pino_sessioni").upsert(
      {
        session_id: input.sessionId,
        soggetto,
        attributi: elenco,
        max_price: stato.maxPrice,
        aggiornato_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );
    const { error } = await conTimeoutSessione(
      Promise.resolve(scrittura),
      TIMEOUT_SESSIONE_MS
    );
    if (error) {
      console.warn("[pino-sessione] scrittura non disponibile:", error.message);
    }
  } catch (errore) {
    // La memoria è un di più: non deve mai bloccare o far fallire il turno.
    console.warn(
      "[pino-sessione] scrittura non disponibile:",
      errore instanceof Error ? errore.message : String(errore)
    );
  }
}
