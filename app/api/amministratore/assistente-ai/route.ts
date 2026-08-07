import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getAssistantContext, buildContextSummary } from "@/lib/amministratore/assistant-context";

const ADMIN_ASSISTANT_MODEL = process.env.ADMIN_ASSISTANT_MODEL ?? "openrouter/auto";

async function callLLM(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY non configurata.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://www.incitta.online",
        "X-Title": "InCittà Admin Assistant",
      },
      body: JSON.stringify({
        model: ADMIN_ASSISTANT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "unknown");
      if (response.status === 429 || response.status === 402) {
        throw new Error(`Quota superata (HTTP ${response.status}).`);
      }
      if (response.status >= 500 && response.status < 600) {
        throw new Error(`Errore server AI (HTTP ${response.status}).`);
      }
      throw new Error(`Errore AI (HTTP ${response.status}): ${errorBody.slice(0, 200)}`);
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new Error("Risposta AI vuota.");
    }

    return content.trim();
  } catch (caught: unknown) {
    clearTimeout(timeoutId);
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw new Error("Timeout chiamata AI (60s).");
    }
    if (caught instanceof Error) throw caught;
    throw new Error("Errore sconosciuto chiamata AI.");
  }
}

const SYSTEM_PROMPT = `Sei l'Assistente AI dell'Area Amministrazione di InCittà.

REGOLE ASSOLUTE:
1. USA ESCLUSIVAMENTE i dati forniti nel contesto. NON inventare MAI numeri, negozi, utenti, vendite, ricavi, ordini, statistiche.
2. Se un dato non è nel contesto, rispondi: "Questo dato non è disponibile nella piattaforma."
3. Puoi fare semplici calcoli matematici sui dati ricevuti (somme, percentuali, medie).
4. Distingui chiaramente tra: dati trovati nel database, dati non disponibili, tue deduzioni matematiche.
5. NON trasformare deduzioni in dati reali.
6. Sii conciso, professionale e diretto. Usa elenchi puntati per leggibilità.
7. Quando citi numeri, specifica sempre la fonte (es. "Dai dati: 42 negozi attivi").
8. Se l'amministratore chiede azioni distruttive (eliminare, modificare, cestinare), spiega che l'assistente è in modalità SOLO CONSULTAZIONE e indica dove trovare la funzione nel pannello.

Il contesto che ricevi contiene dati REALI e aggiornati del database InCittà.`;

export async function POST(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  let domanda: string;
  try {
    const body = await request.json();
    domanda = body?.domanda?.trim() ?? "";
  } catch {
    return apiError("BAD_REQUEST", "Body JSON non valido.", 400);
  }

  if (!domanda) {
    return apiError("BAD_REQUEST", "La domanda è vuota.", 400);
  }

  try {
    const ctx = await getAssistantContext();
    const contextText = buildContextSummary(ctx);

    const prompt = `CONTESTO DATI PIATTAFORMA:\n${contextText}\n\n---\nDOMANDA AMMINISTRATORE:\n${domanda}\n\nRispondi usando ESCLUSIVAMENTE i dati sopra.`;

    const risposta = await callLLM(prompt, SYSTEM_PROMPT);

    return apiOk({ risposta });
  } catch (err) {
    console.error("[/api/amministratore/assistente-ai] Errore:", err);
    const message = err instanceof Error ? err.message : "Errore interno.";
    return apiError("INTERNAL_ERROR", message, 500);
  }
}