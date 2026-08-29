import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  creaPrenotazione,
  esitoRpcHttp,
  getConfigPrenotazioni,
} from "@/lib/prenotazioni";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATI_VALIDI = ["confermata", "cancellata", "effettuata", "no_show"];

/**
 * GET/POST /api/merchant/stores/[negozioId]/prenotazioni
 *
 * Collection merchant: elenco prenotazioni del negozio (giorno/stato/
 * paginazione) e creazione manuale. Protezione `requireApiArea("merchant")`
 * + `canManageStore`. La creazione passa SEMPRE dalla RPC `crea_prenotazione`
 * (mai INSERT diretto); il DB resta la fonte di verità.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const permesso = await canManageStore(user.id, negozioId);
  if (!permesso) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const url = new URL(request.url);
  const giorno = url.searchParams.get("giorno");
  const stato = url.searchParams.get("stato");
  const paginaRaw = Number(url.searchParams.get("pagina") ?? "1");
  const perPaginaRaw = Number(url.searchParams.get("perPagina") ?? "50");
  const pagina = Number.isInteger(paginaRaw) && paginaRaw > 0 ? paginaRaw : 1;
  const perPagina =
    Number.isInteger(perPaginaRaw) && perPaginaRaw > 0
      ? Math.min(perPaginaRaw, 200)
      : 50;
  const from = (pagina - 1) * perPagina;

  if (giorno && !DATA_RE.test(giorno)) {
    return apiError("INVALID_DATE", "Data non valida.", 422);
  }
  if (stato && !STATI_VALIDI.includes(stato)) {
    return apiError("VALIDATION_ERROR", "Stato non valido.", 422);
  }

  const supabase = createAdminSupabaseClient();

  const base = () =>
    supabase
      .from("prenotazioni")
      .select("id, numero, negozio_id, servizio_id, servizio_nome, durata_min, giorno, ora_inizio, ora_fine, cliente_user_id, cliente_nome, cliente_cognome, cliente_telefono, cliente_email, note, stato, motivo_annullo, created_at, updated_at", {
        count: "exact",
      })
      .eq("negozio_id", negozioId);

  let query = base();
  if (giorno) query = query.eq("giorno", giorno);
  if (stato) query = query.eq("stato", stato);

  const { data, count, error } = await query
    .order("giorno", { ascending: true })
    .order("ora_inizio", { ascending: true })
    .range(from, from + perPagina - 1);

  if (error) {
    return apiError("FETCH_FAILED", error.message ?? "Impossibile leggere le prenotazioni.", 500);
  }

  return apiOk({ prenotazioni: data ?? [], total: count ?? 0, pagina, perPagina });
}

/**
 * POST — Creazione manuale merchant di una prenotazione per un cliente.
 * Stessa validazione server-side di base del POST pubblico; la durata è
 * risolta dal DB (RPC), mai dal client.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const permesso = await canManageStore(user.id, negozioId);
  if (!permesso) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

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
  if (!oraInizio || !ORA_RE.test(oraInizio)) {
    return apiError("INVALID_TIME", "Orario non valido.", 422);
  }
  if (!nome) return apiError("VALIDATION_ERROR", "Inserisci il nome.", 422);
  if (!cognome) return apiError("VALIDATION_ERROR", "Inserisci il cognome.", 422);
  if (telefono && telefono.length > 30) {
    return apiError("VALIDATION_ERROR", "Telefono non valido.", 422);
  }
  if (email && !EMAIL_RE.test(email)) {
    return apiError("VALIDATION_ERROR", "Email non valida.", 422);
  }
  if (note && note.length > 2000) {
    return apiError("VALIDATION_ERROR", "Nota troppo lunga.", 422);
  }
  if (!telefono && !email) {
    return apiError("VALIDATION_ERROR", "Inserisci almeno un recapito (email o telefono).", 422);
  }

  const { error, esito } = await creaPrenotazione({
    idempotencyKey,
    negozioId,
    servizioId,
    giorno,
    oraInizio,
    nome,
    cognome,
    telefono: telefono || null,
    email: email || null,
    note: note || null,
    clienteUserId: null,
  });

  if (error) {
    return apiError("SAVE_FAILED", "Impossibile creare la prenotazione.", 500);
  }
  if (!esito || esito.ok !== true) {
    const { status, codice, messaggio } = esitoRpcHttp(esito, "SAVE_FAILED", "Impossibile creare la prenotazione.", 500);
    return apiError(codice, messaggio, status);
  }

  return apiOk({ prenotazione: esito.prenotazione ?? null }, 201);
}