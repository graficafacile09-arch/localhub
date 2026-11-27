/**
 * LocalHub — client HTTP della chat di Pino.
 *
 * Un solo punto per parlare con /api/assistente:
 * - chiede lo streaming NDJSON (primo evento immediato, niente attesa muta);
 * - se la risposta è JSON (server senza streaming, proxy, test) la legge come
 *   prima: il contratto dei dati non cambia;
 * - restituisce sempre un `SearchResult` completo o lancia un errore leggibile.
 *
 * @module components/assistant/pino-fetch
 */

import type { SearchResult } from "@/lib/search-service";

/** Cronologia accettata dalla rotta (stesso contratto di sempre). */
export type MessaggioStoricoPino = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Intento riconosciuto dal server: "generic" = saluto/domanda senza ricerca.
 *
 * `risultatiTrovati` è il conteggio che arriva dal server quando i risultati
 * non stanno in un elenco del payload ma solo nel testo della risposta
 * (offerte, eventi, farmacie, conteggi): senza di lui la chat non saprebbe
 * distinguere «ho trovato qualcosa» da «non ho trovato niente».
 */
export type RispostaPino = SearchResult & {
  intent?: string;
  risultatiTrovati?: number | null;
  /** `false` = il turno non ha cercato (saluto, cortesia, risposta diretta). */
  ricercaEseguita?: boolean;
};

/**
 * Campi che possono portare risultati. Non è un elenco chiuso: il conteggio
 * legge gli array *presenti* nella risposta, così un campo nuovo (offerte,
 * eventi, schede, luoghi...) entra nel conto senza toccare la chat.
 */
const CAMPI_RISULTATI_PINO = [
  "negozi",
  "prodotti",
  "offerte",
  "eventi",
  "notizie",
  "contenuti",
  "categorie",
  "farmacie",
  "territori",
  "filiere",
  "schede",
  "luoghi",
  "conoscenza",
] as const;

/** Qualunque risposta: i campi sono letti in modo difensivo. */
export type RispostaPinoGrezza = object;

/**
 * Numero di risultati della risposta: somma di tutti gli elenchi (negozi,
 * prodotti, offerte, eventi, notizie, contenuti, ...). Se il server dichiara
 * `risultatiTrovati` vale il più alto dei due conteggi: così una risposta che
 * cita risultati presenti solo nel testo non passa per «nessun risultato».
 */
export function contaRisultatiPino(risposta: RispostaPinoGrezza | null | undefined): number {
  if (!risposta || typeof risposta !== "object") return 0;

  const record = risposta as Record<string, unknown>;
  let totale = 0;
  for (const campo of CAMPI_RISULTATI_PINO) {
    const valore = record[campo];
    if (Array.isArray(valore)) totale += valore.length;
  }

  const dichiarati = record.risultatiTrovati;
  if (typeof dichiarati === "number" && Number.isFinite(dichiarati)) {
    return Math.max(totale, Math.trunc(dichiarati));
  }

  return totale;
}

export type MoodPinoChat = "neutral" | "happy" | "sad";

/**
 * Frasi che dichiarano un esito negativo nel testo della risposta. Sono l'unico
 * segnale per TRISTE senza risultati strutturati: il testo è ciò che l'utente legge.
 */
const FRASI_ESITO_NEGATIVO: readonly RegExp[] = [
  /non ho trovato/i,
  /non risulta/i,
  /nessun risultato/i,
  /nessuna attivit[àa]/i,
  /nessun negozio/i,
  /nessun prodotto/i,
  /nessuna offerta/i,
  /nessun evento/i,
  /non ci sono/i,
  /spiacente,? non/i,
];

/** Saluti e convenevoli brevi: l'unico caso in cui Pino resta neutro dopo l'apertura. */
const SALUTO_BREVE =
  /^(ciao|salve|buongiorno|buonasera|buon pomeriggio|hey|hei|grazie|ti ringrazio|chi sei|come stai|arrivederci|a presto)\b/i;
const LUNGHEZZA_MASSIMA_SALUTO = 30;

/** `true` se la domanda è un saluto o una cortesia breve (nessuna richiesta di catalogo). */
export function eSalutoBreve(domanda: string): boolean {
  const pulita = domanda.trim();
  return pulita.length <= LUNGHEZZA_MASSIMA_SALUTO && SALUTO_BREVE.test(pulita);
}

/**
 * Stato d'animo della chat, deciso dalla risposta (non dalla frase del modello):
 * - ALLEGRO se c'è almeno un risultato strutturato, oppure la risposta è un testo
 *   utile (ricerca o domanda sul catalogo) senza frasi di esito negativo;
 * - TRISTE se il testo dichiara un mancato ritrovamento ("non ho trovato",
 *   "nessun negozio", ...) senza risultati strutturati, oppure se la risposta è vuota;
 * - NEUTRO per un saluto o una cortesia breve (`domanda` passata dalla chat).
 *
 * Il conteggio non dipende da `intent` né da `ricercaEseguita`: una domanda di
 * testo sul catalogo che non produce schede resta allegra se risponde.
 */
export function moodDaRispostaPino(
  risposta: RispostaPino | null | undefined,
  domanda?: string
): MoodPinoChat {
  if (contaRisultatiPino(risposta) >= 1) return "happy";

  const testo = (risposta?.risposta ?? "").trim();
  if (FRASI_ESITO_NEGATIVO.some((frase) => frase.test(testo))) return "sad";
  if (domanda !== undefined && eSalutoBreve(domanda)) return "neutral";
  if (!testo) return "sad";
  return "happy";
}

/**
 * La chat legge `.length` su negozi e prodotti: se il payload arriva senza
 * elenchi (risposta parziale, proxy, percorso degradato) li rendiamo array
 * vuoti invece di far fallire il turno. Nessun campo viene inventato o tolto.
 */
function normalizzaRispostaPino(risposta: RispostaPino | null): RispostaPino | null {
  if (!risposta || typeof risposta !== "object") return null;
  const record = risposta as unknown as Record<string, unknown>;
  if (!Array.isArray(record.negozi)) record.negozi = [];
  if (!Array.isArray(record.prodotti)) record.prodotti = [];
  return risposta;
}

const TIPO_STREAMING = "application/x-ndjson";

const CHIAVE_SESSIONE_PINO = "pino-session-id";

/**
 * SessionId della conversazione: resta nel ref per tutta la vita del componente
 * e, se il browser lo consente, in sessionStorage (sopravvive al ricaricamento
 * della pagina). Se sessionStorage non è disponibile (privacy mode, SSR, quota),
 * usa solo il ref.
 */
export function sessionIdPino(ref: { current: string }): string {
  if (ref.current) return ref.current;

  let id: string | null = null;
  try {
    id = window.sessionStorage.getItem(CHIAVE_SESSIONE_PINO);
  } catch {
    id = null;
  }

  if (!id) {
    id = `ass-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      window.sessionStorage.setItem(CHIAVE_SESSIONE_PINO, id);
    } catch {
      // Storage non disponibile: il ref basta per questa sessione di pagina.
    }
  }

  ref.current = id;
  return id;
}

/**
 * Invia il messaggio e restituisce il risultato finale.
 * Gli eventi `stato` servono solo a tenere viva la connessione: l'interfaccia
 * mostra già il typing indicator, quindi non producono messaggi.
 */
export async function chiediAPino(input: {
  messaggi: MessaggioStoricoPino[];
  sessionId: string;
}): Promise<RispostaPino> {
  const response = await fetch("/api/assistente", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: `${TIPO_STREAMING}, application/json`,
      "x-pino-origine": "ui",
    },
    body: JSON.stringify({
      messages: input.messaggi,
      sessionId: input.sessionId,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      (errData as { error?: string }).error ?? `Errore HTTP ${response.status}`
    );
  }

  const tipo = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!tipo.includes(TIPO_STREAMING) || !response.body) {
    const normale = normalizzaRispostaPino((await response.json()) as RispostaPino);
    if (!normale) throw new Error("Risposta dell'assistente vuota.");
    return normale;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let risultato: RispostaPino | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const righe = buffer.split("\n");
    // L'ultima riga può essere incompleta: resta nel buffer.
    buffer = righe.pop() ?? "";

    for (const riga of righe) {
      const pulita = riga.trim();
      if (!pulita) continue;

      let evento: unknown;
      try {
        evento = JSON.parse(pulita);
      } catch {
        continue;
      }
      if (!evento || typeof evento !== "object") continue;

      const record = evento as { type?: unknown };
      if (record.type === "risultato") {
        risultato = normalizzaRispostaPino(evento as RispostaPino);
      }
    }
  }

  if (!risultato) {
    throw new Error("Risposta dell'assistente incompleta.");
  }
  return risultato;
}
