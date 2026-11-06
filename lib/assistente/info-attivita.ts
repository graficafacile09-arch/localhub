/**
 * Pino — informazioni pubblicate su un'attività.
 *
 * "A che ora chiude il panificio?" non è una ricerca di prodotti: è una domanda
 * su dati che InCittà possiede (orari, indirizzo, telefono). La risposta viene
 * composta qui, in modo deterministico, così il modello non può inventare un
 * orario o un recapito. Se il dato non è pubblicato, Pino lo dichiara.
 *
 * @module lib/assistente/info-attivita
 */

import { fasceNormalizzate } from "@/lib/orari";
import { DAYS, formatTime, type DaySchedule, type Orari } from "@/types/negozio";
import type { NegozioRicerca } from "@/lib/ricerca-ai";
import { normalizzaRichiesta } from "./local-intents";

export type InfoAttivitaPino =
  | "orari"
  | "orari-settimanali"
  | "indirizzo"
  | "telefono"
  | "completa";

const RE_ORARI = /\borari[oi]?\b|\borario\b|\bapertura\b|\bchiusura\b/;
const RE_ORA_SPECIFICA =
  /\ba che ora\b|\bquando (?:apre|aprono|chiude|chiudono)\b|\b(?:apre|aprono|chiude|chiudono)\b|\bwhat time\b|\bwhen (?:do you )?(?:open|close)\b/;
const RE_INDIRIZZO =
  /\bindirizzo\b|\bdove (?:si trova|si trovano|sta|sono|e|è)\b|\bdove si trova\b|\bcome (?:ci )?arrivo\b|\baddress\b|\bwhere is\b|\bwhere are\b/;
const RE_TELEFONO =
  /\btelefono\b|\bnumero di telefono\b|\bcellulare\b|\bcontatt[oi]\b|\bchiamare\b|\bphone\b|\btelephone\b|\bcall\b/;

/** Riconosce una domanda informativa esplicita su un'attività. */
export function rilevaRichiestaInfoAttivitaPino(input: string): InfoAttivitaPino | null {
  const q = normalizzaRichiesta(input ?? "");
  if (!q) return null;

  const orari = RE_ORARI.test(q) || RE_ORA_SPECIFICA.test(q);
  const indirizzo = RE_INDIRIZZO.test(q);
  const telefono = RE_TELEFONO.test(q);

  if (orari && indirizzo) return "completa";
  if (orari) {
    // "orari" / "orario" chiede il quadro settimanale; "a che ora chiude"
    // chiede solo il giorno corrente.
    return RE_ORA_SPECIFICA.test(q) && !/\borari[oi]?\b|\borario\b/.test(q)
      ? "orari"
      : "orari-settimanali";
  }
  if (indirizzo) return "indirizzo";
  if (telefono) return "telefono";
  return null;
}

/**
 * Estrae il soggetto reale da una domanda informativa, togliendo la cornice
 * ("qual è il telefono di", "a che ora chiude", "where is"). Serve al piano di
 * ricerca: senza questa pulizia "qual e il telefono..." diventava una query di
 * negozi e non arrivava mai al ramo informativo.
 */
export function estraiSoggettoInfoAttivitaPino(input: string): string {
  return normalizzaRichiesta(input ?? "")
    .replace(/\b(?:a\s+che\s+ora|quando)\s+(?:apre|aprono|chiude|chiudono|aprite|chiudete)\b/gi, " ")
    .replace(/\bdove\s+(?:si\s+trova|si\s+trovano|trovo|sta|sono)\b/gi, " ")
    .replace(/\b(?:what\s+time|when)\b/gi, " ")
    .replace(/\b(?:does|do)\b/gi, " ")
    .replace(/\bwhere\s+(?:is|are)\b/gi, " ")
    .replace(/\b(?:open|closes?|opening|closing|hours|address|phone|telephone)\b/gi, " ")
    .replace(/\b(?:qual(?:e|i)?\s+[eè]\s+)?(?:l['’]\s*)?(?:il|lo|la|i|gli|le)?\s*(?:indirizzo|orari[oi]?|telefono|numero\s+di\s+telefono)\b\s*(?:di|del|della|dei|delle|dell['’])?/gi, " ")
    .replace(/[?.!,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:il|lo|la|i|gli|le)\s+/i, "")
    .trim();
}

function giornoCorrenteRoma(now: Date = new Date()): string {
  const nome = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    timeZone: "Europe/Rome",
  })
    .format(now)
    .toLowerCase();
  return nome;
}

/**
 * Testo degli orari registrati. Restituisce null quando il giorno non è
 * pubblicato o l'apertura è dichiarata senza fasce utilizzabili: Pino non
 * inventa un orario.
 */
export function descriviOrariPino(
  orari: Orari | null | undefined,
  opzioni: { giorno?: string; completo?: boolean } = {}
): string | null {
  if (!orari || typeof orari !== "object") return null;

  const giorno = opzioni.giorno ?? giornoCorrenteRoma();
  const chiavi = opzioni.completo
    ? [...DAYS]
    : [giorno];
  const parti: string[] = [];

  for (const chiave of chiavi) {
    const scheda = (orari as Record<string, DaySchedule | undefined>)[chiave];
    if (!scheda) continue;
    const fasce = scheda.chiuso ? [] : fasceNormalizzate(scheda);
    const testo = scheda.chiuso
      ? "chiuso"
      : fasce.length > 0
        ? fasce.map((f) => `${formatTime(f.open)}–${formatTime(f.close)}`).join(", ")
        : null;
    if (!testo) continue;
    parti.push(opzioni.completo ? `${chiave}: ${testo}` : `oggi (${chiave}): ${testo}`);
  }

  return parti.length > 0 ? parti.join("; ") : null;
}

/** Risposta deterministica per una o più attività. */
export function rispostaInfoAttivitaPino(
  negozi: NegozioRicerca[],
  info: InfoAttivitaPino,
  orari: Map<string, Orari | null>,
  lingua: "it" | "en" = "it"
): string {
  const inglese = lingua === "en";
  const mostraOrari = info === "orari" || info === "orari-settimanali" || info === "completa";
  const mostraIndirizzo = info === "indirizzo" || info === "completa";
  const mostraTelefono = info === "telefono" || info === "completa";
  const orariCompleti = info === "orari-settimanali" || info === "completa";

  const righe = negozi.slice(0, 3).map((negozio) => {
    const dettagli: string[] = [];

    if (mostraOrari) {
      const testo = descriviOrariPino(orari.get(negozio.id) ?? null, {
        completo: orariCompleti,
      });
      dettagli.push(
        testo ??
          (inglese
            ? "opening hours not published on InCittà"
            : "orari non pubblicati su InCittà")
      );
    }
    if (mostraIndirizzo) {
      dettagli.push(
        negozio.indirizzo
          ? (inglese ? `address: ${negozio.indirizzo}` : `indirizzo: ${negozio.indirizzo}`)
          : (inglese ? "address not published on InCittà" : "indirizzo non pubblicato su InCittà")
      );
    }
    if (mostraTelefono) {
      dettagli.push(
        negozio.telefono
          ? (inglese ? `phone: ${negozio.telefono}` : `telefono: ${negozio.telefono}`)
          : (inglese ? "phone not published on InCittà" : "telefono non pubblicato su InCittà")
      );
    }

    return `- **${negozio.nome}**${negozio.categoria ? ` (${negozio.categoria})` : ""} — ${dettagli.join("; ")}`;
  });

  const introduzione = inglese
    ? "Here is the information published on InCittà:"
    : "Ecco le informazioni pubblicate su InCittà:";
  const nota = inglese
    ? "If a detail is missing, the business hasn't published it: I won't fill it in."
    : "Se un dato manca, l'attività non lo ha pubblicato: non lo invento.";

  return `${introduzione}\n\n${righe.join("\n")}\n\n_${nota}_`;
}
