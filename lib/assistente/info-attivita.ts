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
import { apertoOra } from "./conversazione";
import { richiestaApertaOra } from "./understanding";

export type InfoAttivitaPino =
  | "orari"
  | "orari-settimanali"
  | "indirizzo"
  | "telefono"
  | "stato"
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
  const giorno = giornoRichiestoPino(q);

  // «È aperto la domenica?» non è lo stato di adesso: è una domanda sugli
  // orari di un giorno specifico. Va gestita prima di `richiestaApertaOra`,
  // che riconosce solo «aperto ora/adesso».
  if (
    giorno &&
    /\b(?:aperto|aperta|aperti|aperte|chiuso|chiusa|chiusi|chiuse|orari[oi]?|orario)\b/.test(q)
  ) {
    return "orari";
  }

  // «Il panificio Zini è aperto ora?» chiede uno stato verificabile, non una
  // ricerca filtrata: se il filtro escludesse i chiusi non potremmo rispondere
  // «chiuso». Lo stato viene calcolato dagli orari pubblicati.
  if (richiestaApertaOra(q)) return "stato";
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
    .replace(/\b(?:aperto|aperta|aperti|aperte)\s+(?:ora|adesso|oggi|domani)?\b/gi, " ")
    .replace(/\b(?:aperto|aperta|aperti|aperte|chiuso|chiusa|chiusi|chiuse)\b/gi, " ")
    .replace(/\b(?:il|lo|la|i|gli|le)?\s*(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ")
    .replace(/\b(?:open|opened)\s+(?:right\s+)?now\b|\bcurrently\s+open\b/gi, " ")
    .replace(/\b(?:open|closes?|opening|closing|hours|address|phone|telephone)\b/gi, " ")
    .replace(/\b(?:qual(?:e|i)?\s+[eè]\s+)?(?:l['’]\s*)?(?:il|lo|la|i|gli|le)?\s*(?:indirizzo|orari[oi]?|telefono|numero\s+di\s+telefono)\b\s*(?:di|del|della|dei|delle|dell['’])?/gi, " ")
    .replace(/[?.!,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:il|lo|la|i|gli|le)\s+/i, "")
    .replace(/\s+\b(?:e|is|are)\s*$/i, "")
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

const GIORNI_PINO: Readonly<Record<string, string>> = {
  lunedi: "lunedì",
  martedi: "martedì",
  mercoledi: "mercoledì",
  giovedi: "giovedì",
  venerdi: "venerdì",
  sabato: "sabato",
  domenica: "domenica",
  monday: "lunedì",
  tuesday: "martedì",
  wednesday: "mercoledì",
  thursday: "giovedì",
  friday: "venerdì",
  saturday: "sabato",
  sunday: "domenica",
};

/**
 * Giorno richiesto esplicitamente («domenica», «domani», «Sunday»). Restituisce
 * la chiave usata da `Orari` e da `DAYS`, oppure null se la domanda non contiene
 * un giorno. La conversione di «domani» usa il fuso Europe/Rome, come lo stato
 * «aperto ora».
 */
export function giornoRichiestoPino(
  input: string,
  now: Date = new Date()
): string | null {
  const q = normalizzaRichiesta(input ?? "");
  if (!q) return null;
  if (/\bdomani\b|\btomorrow\b/.test(q)) {
    return new Intl.DateTimeFormat("it-IT", {
      weekday: "long",
      timeZone: "Europe/Rome",
    })
      .format(new Date(now.getTime() + 86_400_000))
      .toLowerCase();
  }
  if (/\boggi\b|\btoday\b/.test(q)) return giornoCorrenteRoma(now);
  for (const [token, giorno] of Object.entries(GIORNI_PINO)) {
    if (new RegExp(`\\b${token}\\b`).test(q)) return giorno;
  }
  return null;
}

/**
 * Testo degli orari registrati. Restituisce null quando il giorno non è
 * pubblicato o l'apertura è dichiarata senza fasce utilizzabili: Pino non
 * inventa un orario.
 */
export function descriviOrariPino(
  orari: Orari | null | undefined,
  opzioni: { giorno?: string; completo?: boolean; etichetta?: "oggi" | "giorno" } = {}
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
    const etichetta =
      opzioni.etichetta === "giorno" ? chiave : `oggi (${chiave})`;
    parti.push(opzioni.completo ? `${chiave}: ${testo}` : `${etichetta}: ${testo}`);
  }

  return parti.length > 0 ? parti.join("; ") : null;
}

/** Risposta deterministica per una o più attività. */
export function rispostaInfoAttivitaPino(
  negozi: NegozioRicerca[],
  info: InfoAttivitaPino,
  orari: Map<string, Orari | null>,
  lingua: "it" | "en" = "it",
  opzioni: { giorno?: string | null } = {}
): string {
  const inglese = lingua === "en";
  const mostraStato = info === "stato";
  const mostraOrari = info === "orari" || info === "orari-settimanali" || info === "completa";
  const mostraIndirizzo = info === "indirizzo" || info === "completa";
  const mostraTelefono = info === "telefono" || info === "completa";
  const orariCompleti = info === "orari-settimanali" || info === "completa";

  const righe = negozi.slice(0, 3).map((negozio) => {
    const dettagli: string[] = [];

    if (mostraStato) {
      const stato = apertoOra(orari.get(negozio.id) ?? null);
      dettagli.push(
        stato === true
          ? (inglese ? "open now" : "aperto ora")
          : stato === false
            ? (inglese ? "closed now" : "chiuso ora")
            : (inglese
                ? "status not verifiable: opening hours are missing or insufficient"
                : "stato non verificabile: orari mancanti o non sufficienti")
      );
    }
    if (mostraOrari) {
      const testo = descriviOrariPino(orari.get(negozio.id) ?? null, {
        completo: orariCompleti,
        ...(opzioni.giorno
          ? { giorno: opzioni.giorno, etichetta: "giorno" as const }
          : {}),
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
