/**
 * LocalHub — API Route: /api/assistente
 *
 * Endpoint dell'Assistente AI pubblico di InCittà (Pino).
 * Riceve la cronologia recente della conversazione e restituisce la risposta
 * intelligente (comprensione intento + retrieval + ragionamento).
 *
 * Request body:
 *   { messages: [{ role: "user" | "assistant", content: string }], sessionId?: string }
 *
 * Response (200):
 *   JSON:    { risposta, negozi, prodotti, processingMs, source, lingua }
 *   NDJSON:  {"type":"stato","fase":"ricerca"} + {"type":"risultato", ...}
 *            (solo se il client invia `Accept: application/x-ndjson`)
 *
 * Garanzie di questa rotta:
 * - nessun 500 e nessun 504 per colpa dell'AI: oltre la scadenza o in caso di
 *   errore si usa la ricerca classica (`lib/search-service.ts`) e si risponde
 *   comunque 200 con risultati reali (`lib/assistente/degradazione.ts`);
 * - `maxDuration` esplicito: la funzione ha il tempo di completare il
 *   fallback senza essere troncata dalla piattaforma;
 * - lo streaming è opt-in: il contratto JSON storico resta invariato per
 *   eventuali altri consumer.
 *
 * NOTA: /api/search resta invariato (altri consumer); questo endpoint viene
 * usato dai componenti della chat (AssistantChat, AssistantPanel).
 *
 * @module app/api/assistente/route
 */

import { NextResponse, after } from "next/server";
import {
  chatConAssistente,
  type MessaggioAssistente,
  type RispostaAssistente,
} from "@/lib/assistente";
import { costruisciContestoDinamicoPino } from "@/lib/assistente/contesto-dinamico";
import { prendiOsservazioneTier0 } from "@/lib/assistente/shadow/integrazione";
import { rilevaLinguaConversazionePino } from "@/lib/assistente/understanding";
import { checkRateLimit } from "@/lib/rate-limiter";
import { registraTurnoPino } from "@/lib/assistente/telemetria";
import {
  conScadenzaPino,
  rispostaDegradataPino,
  rispostaIndisponibilePino,
} from "@/lib/assistente/degradazione";

// Durata massima della funzione: senza questa dichiarazione vale il default
// della piattaforma e una chiamata Gemini lenta diventa un 504.
export const maxDuration = 60;

// ─── Rate limit CONDIVISO DB-backed per IP (guardia anti-abuso) ────────────
// L'endpoint è pubblico e ogni messaggio consuma token Gemini (chiave con
// quota giornaliera): limitiamo le richieste per IP con il meccanismo
// condiviso (contatore su scan_log via lib/rate-limiter.ts, `checkRateLimit`).
// Il contatore vive sul DB, non in memoria: è condiviso tra le istanze
// serverless e sopravvive ai cold start.
const MAX_PER_MINUTO = 20;
const MAX_PER_ORA = 120;

/** Oltre questa soglia il percorso AI viene abbandonato: meglio risultati
 *  reali dalla ricerca classica che un'attesa infinita. */
const SCADENZA_PERCORSO_AI_MS = 25_000;

/** Content-Type dello stream opt-in (una riga JSON per evento). */
const TIPO_STREAMING = "application/x-ndjson";

function ipRichiedente(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}

function vuoleStreaming(request: Request): boolean {
  return (request.headers.get("accept") ?? "")
    .toLowerCase()
    .includes(TIPO_STREAMING);
}

/**
 * Percorso AI con degradazione controllata. Non lancia mai.
 *
 * 0. contesto dinamico: prima della chiamata AI il server interroga il motore
 *    di ricerca TRADIZIONALE con il messaggio dell'utente e allega i risultati
 *    reali (nomi, prezzi, negozi, disponibilità). La ricerca ha un proprio
 *    timeout e try/catch: se il database è lento o giù, il messaggio originale
 *    parte comunque, senza blocco di contesto.
 * 1. entro la scadenza: risposta dell'orchestratore Pino (invariata);
 * 2. timeout o errore: ricerca classica + messaggio preconfezionato;
 * 3. anche la ricerca classica fallisce: messaggio minimo di indisponibilità.
 *
 * `dalPercorsoAI` dice se il risultato arriva davvero dall'orchestratore:
 * solo in quel caso la route schedula l'osservazione Shadow Tier 0.
 */
async function rispostaPino(
  messaggi: MessaggioAssistente[]
): Promise<{ risultato: RispostaAssistente; dalPercorsoAI: boolean }> {
  try {
    // La ricerca tradizionale conta nella scadenza complessiva della rotta: un
    // database lento non deve sommare il proprio ritardo a quello dell'AI.
    const esito = await conScadenzaPino(
      (async () => {
        const contesto = await costruisciContestoDinamicoPino(messaggi);
        return chatConAssistente(messaggi, {
          contestoDatabase: contesto?.blocco ?? null,
        });
      })(),
      SCADENZA_PERCORSO_AI_MS
    );
    if (esito.ok) {
      return { risultato: esito.valore, dalPercorsoAI: true };
    }
    console.warn(
      "[/api/assistente] percorso AI oltre la scadenza, uso la ricerca classica"
    );
  } catch (error) {
    console.error("[/api/assistente] Errore:", error);
  }

  try {
    return { risultato: await rispostaDegradataPino(messaggi), dalPercorsoAI: false };
  } catch (erroreRicerca) {
    console.error(
      "[/api/assistente] Anche la ricerca classica è fallita:",
      erroreRicerca
    );
    return { risultato: rispostaIndisponibilePino(messaggi), dalPercorsoAI: false };
  }
}

/**
 * Risposta in streaming NDJSON: il primo chunk parte subito (il client mostra
 * il progresso) e l'evento `risultato` porta lo stesso oggetto del JSON.
 */
function rispostaInStreaming(messaggi: MessaggioAssistente[]): Response {
  const encoder = new TextEncoder();
  const codiceLingua = rilevaLinguaConversazionePino(messaggi);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const invia = (evento: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(evento)}\n`));
      };

      try {
        invia({ type: "stato", fase: "ricerca" });
        const esito = await rispostaPino(messaggi);
        invia({ type: "risultato", ...esito.risultato, lingua: codiceLingua });
      } catch {
        // Rete di sicurezza: lo stream non si chiude mai senza un esito.
        invia({
          type: "risultato",
          ...rispostaIndisponibilePino(messaggi),
          lingua: codiceLingua,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": `${TIPO_STREAMING}; charset=utf-8`,
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  const rateCheck = await checkRateLimit(`assistente:${ipRichiedente(request)}`, {
    perMinute: MAX_PER_MINUTO,
    perHour: MAX_PER_ORA,
    reasonLabel: "messaggi",
    useSharedCounter: true,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error:
          "Troppe richieste in poco tempo. Riprova tra qualche minuto.",
      },
      { status: 429 }
    );
  }

  let body: { messages?: unknown; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "Nessun messaggio." }, { status: 400 });
  }

  const messaggi: MessaggioAssistente[] = (body.messages as MessaggioAssistente[])
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 800) }))
    .slice(-12);

  if (messaggi.length === 0) {
    return NextResponse.json({ error: "Nessun messaggio valido." }, { status: 400 });
  }

  // Streaming opt-in: i client della chat lo richiedono, gli altri ricevono
  // il JSON storico. In entrambi i casi lo status è 200.
  if (vuoleStreaming(request)) {
    return rispostaInStreaming(messaggi);
  }

  const esito = await rispostaPino(messaggi);
  const risultato = esito.risultato;

  // Telemetria del turno: una riga per risposta, scritta DOPO la risposta
  // (`after`) così non aggiunge latenza e non può farla fallire. È il dataset
  // che mancava per capire quali richieste finiscono a zero e perché.
  after(() => {
    const ultimoUtente = messaggi[messaggi.length - 1];
    void registraTurnoPino({
      domanda: ultimoUtente?.role === "user" ? ultimoUtente.content : "",
      intent: (risultato as { intent?: string | null }).intent ?? null,
      esito: !esito.dalPercorsoAI
        ? "degradato"
        : risultato.negozi.length + risultato.prodotti.length === 0
          ? "vuoto"
          : "ok",
      negozi: risultato.negozi.length,
      prodotti: risultato.prodotti.length,
      ms: risultato.processingMs,
      percorso: risultato.source,
    });
  });

  if (esito.dalPercorsoAI) {
    // Shadow Tier 0 (Fase 2): l'osservazione è registrata da `chatConAssistente`
    // solo se il kill switch doppio è attivo; qui viene schedulata DOPO la
    // risposta, senza attese e senza toccare il JSON restituito.
    const osservazione = prendiOsservazioneTier0(risultato);
    if (osservazione) {
      try {
        after(() => {
          try {
            osservazione();
          } catch {
            // B2 — nessun errore dell'osservatore deve emergere dalla route.
          }
        });
      } catch {
        // Fuori da un contesto di richiesta Next `after()` può lanciare:
        // la risposta HTTP resta quella originale.
      }
    }
  }

  // La lingua dell'ultimo messaggio viaggia con la risposta: le etichette dei
  // risultati (conteggi delle card) devono usare la stessa lingua del testo.
  return NextResponse.json({
      ...risultato,
      lingua: rilevaLinguaConversazionePino(messaggi),
  });
}
