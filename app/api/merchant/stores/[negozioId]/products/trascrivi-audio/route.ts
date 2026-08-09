import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";

/**
 * POST /api/merchant/stores/[negozioId]/products/trascrivi-audio
 *
 * Trascrive un clip audio registrato dal venditore (MediaRecorder) tramite
 * Groq Whisper, usando la stessa GROQ_API_KEY già presente nel progetto.
 *
 * La trascrizione è SOLO voce → testo: il testo viene poi passato al normale
 * flusso di correzione AI (/correggi-ai), che lavora sul DRAFT in memoria.
 * ⚠️ QUESTO ENDPOINT NON SCRIVE MAI NEL DATABASE.
 */

const TRASCRIZIONE_MODEL = process.env.TRASCRIZIONE_AUDIO_MODEL ?? "whisper-large-v3";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

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

    // ── Body (multipart: campo "audio") ─────────────────────────────────────
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return apiError("BAD_REQUEST", "Body multipart non valido.", 400);
    }

    const file = formData.get("audio");
    if (!(file instanceof Blob)) {
      return apiError("BAD_REQUEST", "File audio mancante (campo 'audio').", 400);
    }
    if (file.size === 0) {
      return apiError("BAD_REQUEST", "Il file audio è vuoto.", 400);
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return apiError("BAD_REQUEST", "Il file audio supera i 10 MB.", 413);
    }
    if (file.type && !file.type.startsWith("audio/")) {
      return apiError("BAD_REQUEST", "Il file inviato non è audio.", 400);
    }

    // ── Chiamata Groq Whisper (stessa chiave del resto del progetto) ────────
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      throw new Error("Chiave API Groq mancante. Aggiungi GROQ_API_KEY al file .env.local.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let testo = "";
    try {
      const nomeFile = file instanceof File ? file.name : "";
      const groqForm = new FormData();
      groqForm.append("file", file, nomeFile || "registrazione.webm");
      groqForm.append("model", TRASCRIZIONE_MODEL);
      groqForm.append("language", "it");
      groqForm.append("response_format", "json");

      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqApiKey}` },
        body: groqForm,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "unknown");
        throw new Error(`Errore Groq (HTTP ${response.status}): ${errorBody.slice(0, 300)}`);
      }

      const data = (await response.json()) as { text?: string };
      testo = (data.text ?? "").trim();
    } catch (caught: unknown) {
      clearTimeout(timeoutId);
      if (caught instanceof DOMException && caught.name === "AbortError") {
        throw new Error("Timeout trascrizione audio (60s).");
      }
      if (caught instanceof Error) throw caught;
      throw new Error("Errore sconosciuto trascrizione audio.");
    }

    if (!testo) {
      return apiError("TRASCRIZIONE_VUOTA", "Non ho sentito nulla. Riprova o scrivi il testo.", 422);
    }

    return apiOk({ testo });
  } catch (caught: unknown) {
    console.error("[/api/merchant/stores/[negozioId]/products/trascrivi-audio] Errore:", caught);
    const message = caught instanceof Error ? caught.message : "Errore interno.";
    return apiError("TRASCRIVI_AUDIO_ERROR", message, 500);
  }
}
