import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore, getSlugNegozioGestibile } from "@/lib/merchant/data";
import {
  aggiornaOffertaNegozio,
  eliminaOffertaNegozio,
  type OffertaInput,
} from "@/lib/offerte";

function validaPatch(
  body: Record<string, unknown>
): { input: Partial<Omit<OffertaInput, "negozio_id">>; errore: null } | { input: null; errore: string } {
  const input: Partial<Omit<OffertaInput, "negozio_id">> = {};

  if ("titolo" in body) {
    const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
    if (!titolo) {
      return { input: null, errore: "Il titolo dell'offerta è obbligatorio." };
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

  for (const campo of ["prezzo_originale", "prezzo_offerta"] as const) {
    if (campo in body && body[campo] !== undefined) {
      if (body[campo] === null || (typeof body[campo] === "string" && body[campo].trim() === "")) {
        input[campo] = null;
        continue;
      }
      const valore = Number(body[campo]);
      if (!Number.isFinite(valore) || valore < 0) {
        return { input: null, errore: `"${campo}" deve essere un numero non negativo.` };
      }
      input[campo] = valore;
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

  if ("attiva" in body && body.attiva !== undefined) {
    if (typeof body.attiva !== "boolean") {
      return { input: null, errore: "attiva deve essere booleano." };
    }
    input.attiva = body.attiva;
  }

  if (Object.keys(input).length === 0) {
    return { input: null, errore: "Nessun campo da aggiornare." };
  }

  return { input, errore: null };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ negozioId: string; offertaId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;

  const { negozioId, offertaId } = await context.params;
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

  const risultato = await aggiornaOffertaNegozio(
    sessione.user.id,
    sessione.user.email ?? "",
    negozioId,
    offertaId,
    esito.input!
  );

  if (!risultato.ok) {
    return apiError("UPDATE_FAILED", risultato.errore, 500);
  }

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/offerte");
  const slugPubblico = await getSlugNegozioGestibile(sessione.user.id, negozioId);
  if (slugPubblico) revalidatePath(`/negozio/${slugPubblico}`);

  return apiOk({ offerta: risultato.data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ negozioId: string; offertaId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;

  const { negozioId, offertaId } = await context.params;
  const permesso = await canManageStore(sessione.user.id, negozioId);
  if (!permesso) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const risultato = await eliminaOffertaNegozio(
    sessione.user.id,
    sessione.user.email ?? "",
    negozioId,
    offertaId
  );

  if (!risultato.ok) {
    return apiError("DELETE_FAILED", risultato.errore, 500);
  }

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/offerte");
  const slugPubblico = await getSlugNegozioGestibile(sessione.user.id, negozioId);
  if (slugPubblico) revalidatePath(`/negozio/${slugPubblico}`);

  return apiOk({ successo: true });
}