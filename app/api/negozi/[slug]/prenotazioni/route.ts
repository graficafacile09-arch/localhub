import { apiError, apiOk } from "@/lib/api/response";
import { risolviNegozioPubblico } from "@/lib/negozi";
import { getCurrentUser } from "@/lib/auth/session";
import { notificaMerchantPrenotazione } from "@/lib/negozio/prenotazione-email";
import {
  creaPrenotazione,
  esitoRpcHttp,
  getConfigPrenotazioni,
} from "@/lib/prenotazioni";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_RICHIESTE_PER_ORA_IP = 20;

/** Rate limit in-memory per IP (stesso pattern di /api/assistente e richiesta-info). */
const richiestePerIp = new Map<string, number[]>();

function rateLimitOk(ip: string): boolean {
  const ora = Date.now();
  const finestra = 3_600_000; // 1h

  if (richiestePerIp.size > 10_000) {
    for (const [chiave, arr] of richiestePerIp) {
      const vivi = arr.filter((t) => ora - t < finestra);
      if (vivi.length === 0) richiestePerIp.delete(chiave);
    }
  }

  const vivi = (richiestePerIp.get(ip) ?? []).filter((t) => ora - t < finestra);
  if (vivi.length >= MAX_RICHIESTE_PER_ORA_IP) return false;
  vivi.push(ora);
  richiestePerIp.set(ip, vivi);
  return true;
}

function ipRichiedente(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * POST /api/negozi/[slug]/prenotazioni
 *
 * Crea una prenotazione pubblica (guest o autenticato) tramite la RPC
 * atomica `crea_prenotazione` (service role). Nessun INSERT diretto:
 * il DB/RPC resta la fonte di verità per disponibilità e double-booking.
 * La durata è risolta dal DB, mai dal client.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  // Rate limit per IP (best-effort).
  if (!rateLimitOk(ipRichiedente(request))) {
    return apiError(
      "RATE_LIMITED",
      "Troppe richieste in poco tempo. Riprova tra qualche minuto.",
      429
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  // Honeypot anti-bot (campi nascosti che solo i bot compilano).
  const honeypot = ["website", "company", "fax"].some(
    (k) => typeof body[k] === "string" && body[k].trim() !== ""
  );
  if (honeypot) {
    return apiError("VALIDATION_ERROR", "Richiesta non valida.", 400);
  }

  // Negozio deve esistere ed essere attivo.
  const { negozio } = await risolviNegozioPubblico(slug);
  if (!negozio || negozio.attivo !== true) {
    return apiError("STORE_NOT_FOUND", "Negozio non trovato.", 404);
  }

  // Modulo prenotazioni attivo.
  const moduliAttivi: string[] = Array.isArray(negozio.moduli_attivi)
    ? (negozio.moduli_attivi as string[])
    : [];
  if (!moduliAttivi.includes("prenotazioni")) {
    return apiError(
      "BOOKING_MODULE_DISABLED",
      "Questo negozio non accetta prenotazioni.",
      403
    );
  }

  // Configurazione prenotazioni attiva.
  const config = getConfigPrenotazioni(
    (negozio.data ?? {}) as Record<string, unknown>
  );
  if (!config.attiva) {
    return apiError(
      "BOOKING_MODULE_DISABLED",
      "Le prenotazioni non sono attive per questo negozio.",
      403
    );
  }

  // Validazione SERVER-SIDE (mai fidarsi del client).
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  const servizioId =
    typeof body.servizioId === "string" ? body.servizioId.trim() : "";
  const giorno = typeof body.giorno === "string" ? body.giorno.trim() : "";
  const oraInizio = typeof body.oraInizio === "string" ? body.oraInizio.trim() : "";
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const cognome = typeof body.cognome === "string" ? body.cognome.trim() : "";
  const telefono = typeof body.telefono === "string" ? body.telefono.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!idempotencyKey || idempotencyKey.length > 64) {
    return apiError("INVALID_IDEMPOTENCY_KEY", "Chiave di idempotenza non valida.", 422);
  }
  if (!servizioId || servizioId.length > 64) {
    return apiError("VALIDATION_ERROR", "Servizio non valido.", 422);
  }
  if (!giorno || !DATA_RE.test(giorno)) {
    return apiError("INVALID_DATE", "Data non valida.", 422);
  }
  const dataValida = new Date(`${giorno}T00:00:00Z`);
  if (Number.isNaN(dataValida.getTime())) {
    return apiError("INVALID_DATE", "Data non valida.", 422);
  }
  if (!oraInizio || !ORA_RE.test(oraInizio)) {
    return apiError("INVALID_TIME", "Orario non valido.", 422);
  }
  if (!nome) {
    return apiError("VALIDATION_ERROR", "Inserisci il nome.", 422);
  }
  if (nome.length > 80) {
    return apiError("VALIDATION_ERROR", "Nome troppo lungo.", 422);
  }
  if (!cognome) {
    return apiError("VALIDATION_ERROR", "Inserisci il cognome.", 422);
  }
  if (cognome.length > 80) {
    return apiError("VALIDATION_ERROR", "Cognome troppo lungo.", 422);
  }
  if (telefono && telefono.length > 30) {
    return apiError("VALIDATION_ERROR", "Telefono non valido.", 422);
  }
  if (email && !EMAIL_RE.test(email)) {
    return apiError("VALIDATION_ERROR", "Email non valida.", 422);
  }
  if (note && note.length > 2000) {
    return apiError("VALIDATION_ERROR", "Nota troppo lunga.", 422);
  }
  // Almeno un recapito disponibile (email o telefono).
  if (!telefono && !email) {
    return apiError(
      "VALIDATION_ERROR",
      "Inserisci almeno un recapito (email o telefono).",
      422
    );
  }

  // Servizio: deve esistere e essere attivo nei servizi_strutturati.
  // (La RPC riconferma comunque; qui per errori/43x tempestivi.)
  const servizi: Array<{ id?: string; attivo?: boolean }> = Array.isArray(
    (negozio.data as Record<string, unknown> | null)?.servizi_strutturati
  )
    ? ((negozio.data as Record<string, unknown>).servizi_strutturati as Array<{
        id?: string;
        attivo?: boolean;
      }>)
    : [];
  const servizio = servizi.find((s) => s?.id === servizioId);
  if (!servizio) {
    return apiError("SERVICE_NOT_FOUND", "Servizio non trovato.", 404);
  }
  if (servizio.attivo === false) {
    return apiError("SERVICE_INACTIVE", "Il servizio non è più attivo.", 403);
  }

  // Cliente: autenticato → user id; guest → null (best-effort, mai obbligatorio).
  let clienteUserId: string | null = null;
  try {
    const utente = await getCurrentUser();
    if (utente && UUID_RE.test(utente.id)) clienteUserId = utente.id;
  } catch {
    // Il fallback guest resta valido se la lettura della sessione fallisce.
  }

  const { error, esito } = await creaPrenotazione({
    idempotencyKey,
    negozioId: String(negozio.id),
    servizioId,
    giorno,
    oraInizio,
    nome,
    cognome,
    telefono: telefono || null,
    email: email || null,
    note: note || null,
    clienteUserId,
  });

  if (error) {
    return apiError("SAVE_FAILED", "Impossibile creare la prenotazione.", 500);
  }
  if (!esito || esito.ok !== true) {
    const { status, codice, messaggio } = esitoRpcHttp(esito, "SAVE_FAILED", "Impossibile creare la prenotazione.", 500);
    return apiError(codice, messaggio, status);
  }

  // Contratto Fase 6d invariato: viene solo aggiunto il campo `notifica`.
  // La notifica email parte SOLO dopo la prima INSERT (non su retry idempotente);
  // è best-effort e non può mai fallire/rollbackare la prenotazione.
  const destinatario = ((negozio.email_negozio as string) ?? "").trim();
  const notifica = await notificaMerchantPrenotazione({
    destinatario,
    negozioNome: negozio.nome ?? "",
    esito,
  });

  return apiOk(
    {
      prenotazione: esito.prenotazione ?? null,
      giaEsistente: esito.giaEsistente === true,
      notifica,
    },
    201
  );
}