import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import {
  aggiornaEventoNegozio,
  eliminaEventoNegozio,
  type EventoInput,
} from "@/lib/eventi";

function validaPatch(
  body: Record<string, unknown>
): { input: Partial<Omit<EventoInput, "negozio_id">>; errore: null } | { input: null; errore: string } {
  const input: Partial<Omit<EventoInput, "negozio_id">> = {};

  if ("titolo" in body) {
    const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
    if (!titolo) {
      return { input: null, errore: "Il titolo dell'evento è obbligatorio." };
    }
    input.titolo = titolo;
  }

  if ("descrizione" in body && body.descrizione !== undefined) {
    if (body.descrizione === null) {
      input.descrizione = null;
    } else if (typeof body.descrizione === "string") {
      input.descrizione = body.descrizione.trim() || null;
    } else {
      return { input: null, errore: "La descrizione deve essere testo." };
    }
  }

  if ("immagine_url" in body && body.immagine_url !== undefined) {
    if (body.immagine_url === null) {
      input.immagine_url = null;
    } else if (typeof body.immagine_url === "string") {
      input.immagine_url = body.immagine_url.trim() || null;
    } else {
      return { input: null, errore: "immagine_url deve essere testo." };
    }
  }

  if ("luogo" in body && body.luogo !== undefined) {
    if (body.luogo === null) {
      input.luogo = null;
    } else if (typeof body.luogo === "string") {
      input.luogo = body.luogo.trim() || null;
    } else {
      return { input: null, errore: "Il luogo deve essere testo." };
    }
  }

  for (const campo of ["data_inizio", "data_fine"] as const) {
    if (campo in body && body[campo] !== undefined) {
      if (body[campo] === null) {
        input[campo] = null;
        continue;
      }
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

  if ("attivo" in body && body.attivo !== undefined) {
    if (typeof body.attivo !== "boolean") {
      return { input: null, errore: "attivo deve essere booleano." };
    }
    input.attivo = body.attivo;
  }

  if (Object.keys(input).length === 0) {
    return { input: null, errore: "Nessun campo da aggiornare." };
  }

  return { input, errore: null };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ negozioId: string; eventoId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;

  const { negozioId, eventoId } = await context.params;
  const permesso = await canManageStore(sessione.user.id, negozioId);
  if (!permesso) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const esito = validaPatch(body);
  if (esito.errore) {
    return apiError("VALIDATION_ERROR", esito.errore, 422);
  }

  const risultato = await aggiornaEventoNegozio(
    sessione.user.id,
    sessione.user.email ?? "",
    negozioId,
    eventoId,
    esito.input!
  );

  if (!risultato.ok) {
    return apiError("UPDATE_FAILED", risultato.errore, 500);
  }

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/eventi");

  return apiOk({ evento: risultato.data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ negozioId: string; eventoId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;

  const { negozioId, eventoId } = await context.params;
  const permesso = await canManageStore(sessione.user.id, negozioId);
  if (!permesso) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const risultato = await eliminaEventoNegozio(
    sessione.user.id,
    sessione.user.email ?? "",
    negozioId,
    eventoId
  );

  if (!risultato.ok) {
    return apiError("DELETE_FAILED", risultato.errore, 500);
  }

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/eventi");

  return apiOk({ successo: true });
}