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

export type RispostaPino = SearchResult;

const TIPO_STREAMING = "application/x-ndjson";

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
    return (await response.json()) as RispostaPino;
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
        risultato = evento as RispostaPino;
      }
    }
  }

  if (!risultato) {
    throw new Error("Risposta dell'assistente incompleta.");
  }
  return risultato;
}
