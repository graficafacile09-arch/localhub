import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore, getSlugNegozioGestibile } from "@/lib/merchant/data";
import { creaEventoNegozio, getEventiNegozio, type EventoInput } from "@/lib/eventi";

function validaInput(
  body: Record<string, unknown>
): { input: Omit<EventoInput, "negozio_id">; errore: null } | { input: null; errore: string } {
  const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
  if (!titolo) {
    return { input: null, errore: "Il titolo dell'evento è obbligatorio." };
  }

  const input: Omit<EventoInput, "negozio_id"> = { titolo };

  if ("descrizione" in body && body.descrizione !== undefined && body.descrizione !== null) {
    if (typeof body.descrizione !== "string") {
      return { input: null, errore: "La descrizione deve essere testo." };
    }
    input.descrizione = body.descrizione.trim() || null;
  }

  if ("immagine_url" in body && body.immagine_url !== undefined && body.immagine_url !== null) {
    if (typeof body.immagine_url !== "string") {
      return { input: null, errore: "immagine_url deve essere testo." };
    }
    input.immagine_url = body.immagine_url.trim() || null;
  }

  if ("luogo" in body && body.luogo !== undefined && body.luogo !== null) {
    if (typeof body.luogo !== "string") {
      return { input: null, errore: "Il luogo deve essere testo." };
    }
    input.luogo = body.luogo.trim() || null;
  }

  for (const campo of ["data_inizio", "data_fine"] as const) {
    if (campo in body && body[campo] !== undefined && body[campo] !== null) {
      if (typeof body[campo] !== "string") {
        return { input: null, errore: `"${campo}" deve essere una data ISO valida.` };
      }
      const data = new Date(body[campo]);
      if (Number.isNaN(data.getTime())) {
        return { input: null, errore: `"${campo}" non è una data valida.` };
      }
      input[campo] = data.toISOString();
    }
  }

  if ("attivo" in body && body.attivo !== undefined && body.attivo !== null) {
    if (typeof body.attivo !== "boolean") {
      return { input: null, errore: "attivo deve essere booleano." };
    }
    input.attivo = body.attivo;
  }

  return { input, errore: null };
}

/** Elenco degli eventi di un negozio (solo il proprietario o un admin autorizzato). */
export async function GET(_request: Request, context: { params: Promise<{ negozioId: string }> }) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;

  const { negozioId } = await context.params;
  const permesso = await canManageStore(sessione.user.id, negozioId);
  if (!permesso) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const eventi = await getEventiNegozio(sessione.user.id, sessione.user.email ?? "", negozioId);
  return apiOk({ eventi });
}

/** Creazione di un evento per il negozio. */
export async function POST(request: Request, context: { params: Promise<{ negozioId: string }> }) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;

  const { negozioId } = await context.params;
  const permesso = await canManageStore(sessione.user.id, negozioId);
  if (!permesso) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const esito = validaInput(body);
  if (esito.errore) {
    return apiError("VALIDATION_ERROR", esito.errore, 422);
  }

  const risultato = await creaEventoNegozio(
    sessione.user.id,
    sessione.user.email ?? "",
    negozioId,
    esito.input!
  );

  if (!risultato.ok) {
    return apiError("CREATE_FAILED", risultato.errore, 500);
  }

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/eventi");
  const slugPubblico = await getSlugNegozioGestibile(sessione.user.id, negozioId);
  if (slugPubblico) revalidatePath(`/negozio/${slugPubblico}`);

  return apiOk({ evento: risultato.data }, 201);
}