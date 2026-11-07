/**
 * Pino — Memoria delle correzioni dell'utente.
 *
 * Quando una risposta è sbagliata l'utente lo dice: "no, intendevo un panino",
 * "non è un ristorante, è un panificio". Quelle frasi sono il segnale più
 * affidabile che il sistema ha per capire di aver sbagliato, e oggi vengono
 * trattate come una nuova richiesta qualsiasi: il difetto si ripete.
 *
 * Qui la correzione viene (1) riconosciuta, (2) salvata su `pino_correzioni`
 * con la domanda che l'ha provocata e (3) riapplicata quando la stessa
 * domanda torna. Tutto è non bloccante: la risposta non aspetta la scrittura,
 * e un database assente non rompe il turno.
 *
 * @module lib/assistente/apprendimento
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  ATTIVITA_CATALOGO_PINO,
  SOGGETTI_ALIMENTARI_PINO,
  SOGGETTI_CATALOGO_PINO,
} from "./lexicon";
import { normalizzaRichiesta } from "./local-intents";

export type MessaggioPino = {
  role: "user" | "assistant";
  content: string;
};

export type TipoCorrezionePino = "attivita" | "prodotto" | "altro";

export type CorrezioneRilevataPino = {
  /** La domanda che ha prodotto la risposta sbagliata. */
  domandaPrecedente: string;
  /** Il contenuto corretto estratto dal messaggio dell'utente. */
  correzione: string;
  tipo: TipoCorrezionePino;
};

/**
 * Aperture che segnalano una correzione. Volutamente esplicite: "non" da solo
 * è troppo comune ("non ho budget"), quindi le forme sono ancorate all'inizio
 * del messaggio e seguite da un contenuto.
 */
const RE_APERTURA_CORREZIONE =
  /^(?:no|no[,.]|non|sbagliato|hai sbagliato|non hai capito|hai capito male|non ci siamo|intendevo|intendevo dire|volevo dire|mi riferivo|ti ho detto|in realta|in realtà|piuttosto|cioe|cioè|esatto ma|non proprio|correggo|correzione)\b/;

function normalizzaSpazi(testo: string): string {
  return String(testo ?? "").replace(/\s+/g, " ").trim();
}

function pulisciCorrezione(testo: string): string {
  return normalizzaSpazi(testo)
    .replace(/^(?:e|è|ed|ma|bensi|bensì|cioe|cioè)\s+/i, "")
    .replace(/^(?:un|uno|una|il|lo|la|i|gli|le|del|dello|della|dei|degli|delle)\s+/i, "")
    .replace(/[.?!,;:]+$/g, "")
    .replace(/\b(?:grazie|per favore|please)\b/gi, "")
    .trim()
    .slice(0, 120);
}

/** Estrae la parte corretta del messaggio, non l'intera frase. */
function estraiCorrezione(testo: string): string {
  // "non è un ristorante, è un panificio" → "panificio"
  const contrario = testo.match(
    /\bnon\s+(?:e|è|era)\s+(?:un[oa]?\s+|il\s+|la\s+)?([^,;]{2,60})[,;]?\s+(?:ma|bensi|bensì|e|è|ed)\s+(?:un[oa]?\s+|il\s+|la\s+)?([^,;.!?]{2,60})/i
  );
  if (contrario?.[2]) return pulisciCorrezione(contrario[2]);

  // "intendevo un panino", "cercavo la pasta", "volevo dire olio"
  const esplicito = testo.match(
    /\b(?:intendevo|volevo dire|mi riferivo a|cercavo|cerco|ti ho detto|piuttosto|cioe|cioè)\s+(.{2,90})/i
  );
  if (esplicito?.[1]) return pulisciCorrezione(esplicito[1]);

  // "no, un panino": il contenuto dopo la virgola
  const dopoVirgola = testo.split(/[,;]/).slice(1).join(" ").trim();
  if (dopoVirgola) return pulisciCorrezione(dopoVirgola);

  return pulisciCorrezione(testo.replace(RE_APERTURA_CORREZIONE, "").trim());
}

function classificaCorrezione(correzione: string): TipoCorrezionePino {
  const q = normalizzaRichiesta(correzione);
  if (!q) return "altro";
  if (ATTIVITA_CATALOGO_PINO.some((voce) => voce.pattern.test(q))) return "attivita";
  const token = new Set(q.split(/\s+/));
  // I soggetti di catalogo includono parole come "panino" che non sono
  // ingredienti: senza questo controllo la correzione «intendevo un panino»
  // finiva in "altro" e non veniva usata come soggetto di ricerca.
  if (
    SOGGETTI_CATALOGO_PINO.some((soggetto) =>
      soggetto.forme.some((forma) => token.has(forma))
    ) ||
    SOGGETTI_ALIMENTARI_PINO.some((termine) => token.has(termine))
  ) {
    return "prodotto";
  }
  return "altro";
}

/**
 * Riconosce una correzione solo quando arriva subito dopo una risposta di Pino
 * e contiene un contenuto correttivo reale. Serve l'ultimo messaggio utente e
 * la domanda che l'aveva preceduto.
 */
export function rilevaCorrezionePino(
  storico: ReadonlyArray<MessaggioPino>
): CorrezioneRilevataPino | null {
  const messaggi = Array.isArray(storico) ? [...storico] : [];
  const ultimo = messaggi[messaggi.length - 1];
  if (!ultimo || ultimo.role !== "user") return null;
  if (messaggi[messaggi.length - 2]?.role !== "assistant") return null;

  const testo = normalizzaSpazi(ultimo.content);
  if (!testo || testo.length > 260) return null;
  if (!RE_APERTURA_CORREZIONE.test(testo.toLowerCase())) return null;

  const domandaPrecedente = [...messaggi.slice(0, -1)]
    .reverse()
    .find((messaggio) => messaggio.role === "user")?.content;
  if (!domandaPrecedente || !normalizzaSpazi(domandaPrecedente)) return null;

  const correzione = estraiCorrezione(testo);
  if (!correzione) return null;

  return {
    domandaPrecedente: normalizzaSpazi(domandaPrecedente).slice(0, 240),
    correzione,
    tipo: classificaCorrezione(correzione),
  };
}

/** Chiave stabile della domanda: la stessa domanda riporta la stessa correzione. */
export function chiaveCorrezionePino(query: string): string {
  return normalizzaRichiesta(String(query ?? ""))
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Salvataggio non bloccante: non lancia mai, non ritarda la risposta. */
export async function registraCorrezionePino(
  correzione: CorrezioneRilevataPino
): Promise<void> {
  try {
    const chiave = chiaveCorrezionePino(correzione.domandaPrecedente);
    if (!chiave) return;
    const db = createAdminSupabaseClient();
    const ora = new Date().toISOString();
    const { error } = await db.from("pino_correzioni").upsert(
      {
        chiave,
        domanda: correzione.domandaPrecedente.slice(0, 240),
        correzione: correzione.correzione.slice(0, 160),
        tipo: correzione.tipo,
        ultima_utilizzazione: ora,
      },
      { onConflict: "chiave" }
    );
    if (!error) {
      console.info(
        "[pino-correzioni]",
        JSON.stringify({ tipo: correzione.tipo, chiave, tabella: "pino_correzioni" })
      );
      return;
    }

    // La tabella dedicata può non essere ancora stata creata (migrazione
    // manuale). `pino_memoria` esiste già: si usa come ripiego, così la
    // correzione resta in memoria anche prima della migrazione.
    const { error: erroreMemoria } = await db.from("pino_memoria").upsert(
      {
        termine: chiave,
        concetto: correzione.correzione.slice(0, 160),
        tipo: "correzione",
        frequenza: 1,
        successi: 1,
        fallimenti: 0,
        confidence: 1,
        ultima_utilizzazione: ora,
      },
      { onConflict: "termine,concetto" }
    );
    if (erroreMemoria) {
      console.warn("[pino-correzioni] scrittura fallita:", erroreMemoria.message);
      return;
    }
    console.info(
      "[pino-correzioni]",
      JSON.stringify({ tipo: correzione.tipo, chiave, tabella: "pino_memoria" })
    );
  } catch (errore) {
    console.warn("[pino-correzioni] memoria non disponibile:", errore);
  }
}

/** Correzioni già apprese per una domanda (di solito zero o una). */
export async function correzioniAppresePino(query: string): Promise<string[]> {
  try {
    const chiave = chiaveCorrezionePino(query);
    if (!chiave) return [];
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("pino_correzioni")
      .select("chiave, correzione")
      .eq("chiave", chiave)
      .limit(1);
    if (!error) {
      return ((data ?? []) as Array<{ correzione?: string | null }>)
        .map((riga) => String(riga.correzione ?? "").trim())
        .filter(Boolean);
    }

    // Ripiego sulla memoria esistente (tipo "correzione").
    const { data: memoria } = await db
      .from("pino_memoria")
      .select("concetto")
      .eq("termine", chiave)
      .eq("tipo", "correzione")
      .limit(1);
    return ((memoria ?? []) as Array<{ concetto?: string | null }>)
      .map((riga) => String(riga.concetto ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Applica una correzione appresa alla domanda: se il contenuto corretto è
 * riconoscibile (attività o prodotto) la ricerca usa quello, invece di
 * ripetere l'interpretazione sbagliata.
 */
export function applicaCorrezioniPino(
  query: string,
  correzioni: readonly string[]
): string {
  for (const correzione of correzioni) {
    const testo = normalizzaSpazi(correzione);
    if (!testo) continue;
    const tipo = classificaCorrezione(testo);
    if (tipo !== "altro" || testo.split(/\s+/).length <= 4) return testo;
  }
  return query;
}

/** Testo breve di presa d'atto, da anteporre alla risposta corretta. */
export function messaggioCorrezionePino(lingua: "it" | "en"): string {
  return lingua === "en"
    ? "You're right, I got that wrong — I re-ran the search on your correction."
    : "Hai ragione, avevo capito male: ho rifatto la ricerca sulla richiesta corretta.";
}
