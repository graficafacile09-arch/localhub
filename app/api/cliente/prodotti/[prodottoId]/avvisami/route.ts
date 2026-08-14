import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import {
  isEmailValida,
  iscrizioneAvviso,
  statoAvviso,
} from "@/lib/prodotti-avvisami";

/**
 * API "Avvisami quando torna disponibile" (Area Clienti, pubblica).
 *
 * GET  /api/cliente/prodotti/[prodottoId]/avvisami
 *   → { iscritto, autenticato }: stato di iscrizione per l'utente corrente
 *     (o per l'email passata in query).
 *
 * POST /api/cliente/prodotti/[prodottoId]/avvisami
 *   → iscrizione all'avviso. Se l'utente è autenticato si usa l'email
 *     dell'account (e user_id); altrimenti l'email è obbligatoria nel body
 *     e viene validata server-side.
 *
 * Validazione server obbligatoria: prodottoId numerico, email valida,
 * prodotto esistente. Anti-duplicati via indice unico parziale.
 */

function validaProdottoId(prodottoId: string): boolean {
  return /^\d+$/.test(prodottoId);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ prodottoId: string }> }
) {
  const { prodottoId } = await context.params;
  if (!validaProdottoId(prodottoId)) {
    return apiError("INVALID_PRODUCT", "Prodotto non valido.", 422);
  }

  const user = await getCurrentUser();
  const url = new URL(request.url);
  const emailParam = url.searchParams.get("email");

  let email: string | null = null;
  if (user?.email) {
    email = user.email;
  } else if (typeof emailParam === "string" && isEmailValida(emailParam.trim())) {
    email = emailParam.trim();
  }

  const iscritto = await statoAvviso(prodottoId, email, user?.id ?? null);

  return apiOk({ iscritto, autenticato: Boolean(user) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ prodottoId: string }> }
) {
  const { prodottoId } = await context.params;
  if (!validaProdottoId(prodottoId)) {
    return apiError("INVALID_PRODUCT", "Prodotto non valido.", 422);
  }

  const user = await getCurrentUser();

  let email = user?.email ?? null;

  if (!email) {
    let body: { email?: unknown } | null = null;
    try {
      body = (await request.json()) as { email?: unknown };
    } catch {
      body = null;
    }

    const bodyEmail = typeof body?.email === "string" ? body.email.trim() : "";

    if (!bodyEmail) {
      return apiError("EMAIL_REQUIRED", "Inserisci la tua email per ricevere l'avviso.", 422);
    }
    if (!isEmailValida(bodyEmail)) {
      return apiError("INVALID_EMAIL", "Inserisci un indirizzo email valido.", 422);
    }
    email = bodyEmail;
  }

  const esito = await iscrizioneAvviso({
    prodottoId,
    userId: user?.id ?? null,
    email,
  });

  if (!esito.ok) {
    return apiError("SUBSCRIBE_FAILED", esito.errore, esito.status);
  }

  return apiOk({ iscritto: true, giaIscritto: esito.giaIscritto });
}
