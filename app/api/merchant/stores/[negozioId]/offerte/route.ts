import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore, getSlugNegozioGestibile } from "@/lib/merchant/data";
import { creaOffertaNegozio, getOfferteNegozio, type OffertaInput } from "@/lib/offerte";

function validaInput(
  body: Record<string, unknown>
): { input: Omit<OffertaInput, "negozio_id">; errore: null } | { input: null; errore: string } {
  const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
  if (!titolo) {
    return { input: null, errore: "Il titolo dell'offerta è obbligatorio." };
  }

  const input: Omit<OffertaInput, "negozio_id"> = { titolo };

  if ("descrizione" in body && body.descrizione !== undefined && body.descrizione !== null) {
    if (typeof body.descrizione !== "string") {
      return { input: null, errore: "La descrizione deve essere testo." };
    }
    input.descrizione = body.descrizione.trim() || null;
  }

  for (const campo of ["prezzo_originale", "prezzo_offerta"] as const) {
    if (campo in body && body[campo] !== undefined && body[campo] !== null) {
      const valore = Number(body[campo]);
      if (typeof body[campo] === "string" && body[campo].trim() === "") {
        input[campo] = null;
        continue;
      }
      if (!Number.isFinite(valore) || valore < 0) {
        return { input: null, errore: `"${campo}" deve essere un numero non negativo.` };
      }
      input[campo] = valore;
    }
  }

  if ("immagine_url" in body && body.immagine_url !== undefined && body.immagine_url !== null) {
    if (typeof body.immagine_url !== "string") {
      return { input: null, errore: "immagine_url deve essere testo." };
    }
    input.immagine_url = body.immagine_url.trim() || null;
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

  if ("attiva" in body && body.attiva !== undefined && body.attiva !== null) {
    if (typeof body.attiva !== "boolean") {
      return { input: null, errore: "attiva deve essere booleano." };
    }
    input.attiva = body.attiva;
  }

  return { input, errore: null };
}

/** Elenco delle offerte di un negozio (solo il proprietario o un admin autorizzato). */
export async function GET(_request: Request, context: { params: Promise<{ negozioId: string }> }) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;

  const { negozioId } = await context.params;
  const permesso = await canManageStore(sessione.user.id, negozioId);
  if (!permesso) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const offerte = await getOfferteNegozio(sessione.user.id, sessione.user.email ?? "", negozioId);
  return apiOk({ offerte });
}

/** Creazione di una offerta per il negozio. */
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

  const risultato = await creaOffertaNegozio(
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
  revalidatePath("/amministratore/offerte");
  const slugPubblico = await getSlugNegozioGestibile(sessione.user.id, negozioId);
  if (slugPubblico) revalidatePath(`/negozio/${slugPubblico}`);

  return apiOk({ offerta: risultato.data }, 201);
}