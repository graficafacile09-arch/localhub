import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { creaSegnalazione, type CreaSegnalazioneInput, type SegnalazioneTipo, type SegnalazioneTargetType } from "@/lib/segnalazioni";

const TIPI_VALIDI: SegnalazioneTipo[] = ["negozio", "prodotto", "offerta", "evento", "contenuto", "comportamento", "tecnico", "altro"];
const TARGET_TYPES_VALIDI: SegnalazioneTargetType[] = ["negozio", "prodotto", "offerta", "evento", "utente", "altro"];

export async function POST(request: Request) {
  const { sessione, error } = await requireApiArea("cliente");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const tipo = body.tipo as SegnalazioneTipo | undefined;
  if (!tipo || !TIPI_VALIDI.includes(tipo)) {
    return apiError("VALIDATION_ERROR", "Tipo segnalazione non valido.", 422);
  }

  const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
  if (!titolo) {
    return apiError("VALIDATION_ERROR", "Il titolo è obbligatorio.", 422);
  }
  if (titolo.length > 200) {
    return apiError("VALIDATION_ERROR", "Il titolo è troppo lungo (max 200 caratteri).", 422);
  }

  const descrizione = typeof body.descrizione === "string" ? body.descrizione.trim() : "";
  if (!descrizione) {
    return apiError("VALIDATION_ERROR", "La descrizione è obbligatoria.", 422);
  }
  if (descrizione.length > 5000) {
    return apiError("VALIDATION_ERROR", "La descrizione è troppo lunga (max 5000 caratteri).", 422);
  }

  let target_type: SegnalazioneTargetType | null = null;
  if ("target_type" in body && body.target_type) {
    if (!TARGET_TYPES_VALIDI.includes(body.target_type as SegnalazioneTargetType)) {
      return apiError("VALIDATION_ERROR", "Tipo oggetto segnalato non valido.", 422);
    }
    target_type = body.target_type as SegnalazioneTargetType;
  }

  let target_id: string | null = null;
  if ("target_id" in body && body.target_id) {
    if (typeof body.target_id !== "string") {
      return apiError("VALIDATION_ERROR", "target_id deve essere UUID.", 422);
    }
    target_id = body.target_id;
  }

  let target_name: string | null = null;
  if ("target_name" in body && body.target_name) {
    if (typeof body.target_name !== "string") {
      return apiError("VALIDATION_ERROR", "target_name deve essere testo.", 422);
    }
    target_name = body.target_name.trim().slice(0, 200);
  }

  let negozio_id: string | null = null;
  if ("negozio_id" in body && body.negozio_id) {
    if (typeof body.negozio_id !== "string") {
      return apiError("VALIDATION_ERROR", "negozio_id deve essere UUID.", 422);
    }
    negozio_id = body.negozio_id;
  }

  const input: CreaSegnalazioneInput = {
    tipo,
    titolo,
    descrizione,
    target_type,
    target_id,
    target_name,
    negozio_id,
  };

  const risultato = await creaSegnalazione(sessione.user.id, sessione.user.email ?? "", input);
  if (!risultato.ok) {
    return apiError("CREATE_FAILED", risultato.errore, 500);
  }

  return apiOk({ segnalazioneId: risultato.id }, 201);
}