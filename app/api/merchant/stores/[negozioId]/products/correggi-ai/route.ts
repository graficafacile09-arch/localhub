import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { extractJsonFromText } from "@/lib/product-assistant/providers/utils";
import { diffCorrezioni, mergeSuggestion } from "@/lib/product-assistant/correggi-ai";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/types";
import { callGeminiText, type GeminiMessage } from "@/lib/ai/gemini-text";

/**
 * POST /api/merchant/stores/[negozioId]/products/correggi-ai
 *
 * Funzione ADDITIVA "🎙️ Correggi con AI": interpreta una correzione in
 * linguaggio naturale (vocale o testuale) e la applica SOLO al DRAFT del
 * prodotto, che vive in memoria lato client.
 *
 * ⚠️ QUESTO ENDPOINT NON SCRIVE MAI NEL DATABASE.
 * La pubblicazione avviene esclusivamente tramite il normale endpoint
 * di pubblicazione prodotti già esistente.
 */

type MessaggioConversazione = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `Sei l'assistente AI di un venditore su una piattaforma di e-commerce locale. Il venditore ha scansionato un prodotto con la fotocamera e l'AI ha riconosciuto i dati. Ora il venditore ti scrive correzioni in linguaggio naturale e tu devi aggiornare SOLO i campi del prodotto interessati dalla richiesta.

REGOLE ASSOLUTE:
1. Ricevi il draft attuale del prodotto come JSON e la richiesta del venditore.
2. Modifica ESCLUSIVAMENTE i campi coinvolti dalla richiesta. Tutti gli altri campi devono restare IDENTICI ai valori ricevuti.
3. Se la richiesta dice di correggere solo un campo (es. "correggi solo la descrizione"), tocca solo quel campo.
4. Se la richiesta NON è una correzione (es. "va bene", "grazie", "perfetto", saluti), NON modificare nulla e rispondi che il prodotto è pronto.
5. "stato_condizione" può essere solo "nuovo", "usato" o "ricondizionato".
6. Gli array (parole_chiave, caratteristiche, ingredienti, allergeni) devono restare array di stringhe.
7. "filtri_catalogo" deve restare un oggetto chiave-valore stringa (oppure null).
8. Rispondi SEMPRE in italiano, in modo conversazionale, breve e con elenchi puntati quando riepiloghi i cambiamenti.

RISPOSTA: restituisci SOLO JSON valido con questa struttura esatta:
{
  "messaggio": "Riepilogo conversazionale in italiano delle modifiche applicate (es. 'Ho aggiornato: • Colore: bianco → grigio • Condizione: → nuove. Vuoi modificare altro?'). Se non c'era nulla da correggere: 'Non ho apportato modifiche.'",
  "suggestion": { ...draft COMPLETO aggiornato con TUTTI i campi... }
}`;

async function callLLM(
  storico: MessaggioConversazione[],
  draftJson: string,
  messaggio: string
): Promise<{ messaggio: string; suggestion: unknown }> {
  // Ruoli Gemini: "assistant" → "model" (Gemini non accetta "assistant").
  const storicoGemini: GeminiMessage[] = storico.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    content: m.content,
  }));

  const content = await callGeminiText({
    systemPrompt: SYSTEM_PROMPT,
    history: storicoGemini,
    userPrompt: `DRAFT ATTUALE DEL PRODOTTO (JSON):\n${draftJson}\n\n---\nRICHIESTA DEL VENDITORE:\n"${messaggio}"\n\nApplica la richiesta e restituisci SOLO il JSON richiesto.`,
    maxTokens: 2000,
    temperature: 0.2,
    json: true,
    timeoutMs: 60_000,
  });

  const jsonStr = extractJsonFromText(content);
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  const messaggioRisposta =
    typeof parsed.messaggio === "string" && parsed.messaggio.trim()
      ? parsed.messaggio.trim()
      : "Ho aggiornato il prodotto.";

  return { messaggio: messaggioRisposta, suggestion: parsed.suggestion };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  try {
    const { negozioId } = await context.params;

    // ── Autenticazione + proprietà del negozio (stesso pattern del /vision) ──
    const { sessione, error } = await requireApiArea("merchant");
    if (error) return error;

    if (!(await canManageStore(sessione.user.id, negozioId))) {
      return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);
    }

    // ── Body ──────────────────────────────────────────────────────────────────
    let body: {
      suggestion?: ProductVisionSuggestion;
      messaggio?: string;
      storico?: MessaggioConversazione[];
    };
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", "Body JSON non valido.", 400);
    }

    const draft = body.suggestion;
    const messaggio = body.messaggio?.trim() ?? "";
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
      return apiError("BAD_REQUEST", "Draft del prodotto mancante o non valido.", 400);
    }
    if (!messaggio) {
      return apiError("BAD_REQUEST", "Il messaggio di correzione è vuoto.", 400);
    }

    // Conversazione precedente (ultimi 10 messaggi, contenuto limitato).
    const storico: MessaggioConversazione[] = Array.isArray(body.storico)
      ? body.storico
          .filter(
            (m): m is MessaggioConversazione =>
              (m?.role === "user" || m?.role === "assistant") &&
              typeof m.content === "string" &&
              m.content.length <= 4000
          )
          .slice(-10)
      : [];

    // ── Chiamata LLM (Gemini, come l'assistente AI) ───────────────────────────
    const originale = draft as ProductVisionSuggestion;
    const draftJson = JSON.stringify(draft);

    const risposta = await callLLM(storico, draftJson, messaggio);

    // Merge conservativo: ogni campo non fornito/valido resta quello originale.
    const suggestionAggiornata = mergeSuggestion(
      originale,
      risposta.suggestion as Partial<ProductVisionSuggestion>
    );
    const cambi = diffCorrezioni(originale, suggestionAggiornata);

    return apiOk({ suggestion: suggestionAggiornata, cambi, messaggio: risposta.messaggio });
  } catch (caught: unknown) {
    console.error("[/api/merchant/stores/[negozioId]/products/correggi-ai] Errore:", caught);
    const message = caught instanceof Error ? caught.message : "Errore interno.";
    return apiError("CORREGGI_AI_ERROR", message, 500);
  }
}
