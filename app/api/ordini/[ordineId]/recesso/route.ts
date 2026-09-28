import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { getSessionArea } from "@/lib/auth/session-area";
import { orderAccessCookieName, verifyOrderAccessToken } from "@/lib/cliente/order-access";
import { creaRichiestaRecesso, getRecessoInfo } from "@/lib/cliente/recesso";
import { inviaEmailConfermaRecesso, inviaEmailNotificaVenditore } from "@/lib/cliente/recesso-email";

async function risolviAccesso(ordineId: string, tokenFornito?: string | null): Promise<
  | { ok: true; accesso: { clienteUserId: string; guestAutorizzato?: false } }
  | { ok: true; accesso: { clienteUserId: null; guestAutorizzato: true } }
  | { ok: false; response: Response }
> {
  const sessione = await getSessionArea();

  if (sessione) {
    if (sessione.area !== "cliente") {
      return {
        ok: false,
        response: apiError("FORBIDDEN", "Questa sessione non è autorizzata per il recesso del cliente.", 403),
      };
    }
    return { ok: true, accesso: { clienteUserId: sessione.user.id } };
  }

  const token =
    (typeof tokenFornito === "string" && tokenFornito.trim() ? tokenFornito.trim() : null) ??
    (await cookies()).get(orderAccessCookieName(ordineId))?.value ??
    null;
  if (!verifyOrderAccessToken(token, ordineId)) {
    return {
      ok: false,
      response: apiError("UNAUTHORIZED", "Accesso all'ordine non autorizzato.", 401),
    };
  }

  return { ok: true, accesso: { clienteUserId: null, guestAutorizzato: true } };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ ordineId: string }> }
) {
  const { ordineId } = await context.params;
  const token = new URL(request.url).searchParams.get("token");
  const accesso = await risolviAccesso(ordineId, token);
  if (!accesso.ok) return accesso.response;

  const info = await getRecessoInfo(ordineId, accesso.accesso);
  if (!info) return apiError("NOT_FOUND", "Ordine non trovato.", 404);

  return apiOk({
    visibile: info.visibile,
    puòRichiedere: info.puòRichiedere,
    motivoNonDisponibile: info.motivoNonDisponibile,
    ordineNumero: info.ordineNumero,
    ordineStato: info.ordineStato,
    consegnataAt: info.consegnataAt,
    termineRecessoAt: info.termineRecessoAt,
    righe: info.righe,
    richiestaAttiva: info.richiestaAttiva,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ ordineId: string }> }
) {
  const { ordineId } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const accesso = await risolviAccesso(
    ordineId,
    typeof body.token === "string" ? body.token : null
  );
  if (!accesso.ok) return accesso.response;

  const righeRaw = Array.isArray(body.righe) ? body.righe : [];
  const righe = righeRaw.map((r) => {
    const x = (r ?? {}) as Record<string, unknown>;
    return {
      ordineRigaId: typeof x.ordineRigaId === "string" ? x.ordineRigaId : "",
      quantita: Number(x.quantita),
    };
  });

  const esito = await creaRichiestaRecesso(
    ordineId,
    accesso.accesso,
    righe,
    typeof body.motivo === "string" ? body.motivo : null,
    typeof body.note === "string" ? body.note : null,
  );

  if (!esito.ok) return apiError(esito.codice, esito.messaggio, esito.status);

  let confermaEmail: "inviata" | "saltata" | "fallita" = "saltata";
  if (!esito.richiesta.giaEsistente) {
    if (esito.clienteEmail) {
      const invio = await inviaEmailConfermaRecesso(esito.richiesta.id);
      confermaEmail = invio.stato;
    }
    await inviaEmailNotificaVenditore(esito.richiesta.id);
  }

  revalidatePath(`/cliente/ordini/${ordineId}`);
  revalidatePath(`/ordini/conferma/${ordineId}`);

  return apiOk({
    richiesta: esito.richiesta,
    confermaEmail,
    giaEsistente: esito.richiesta.giaEsistente,
  }, esito.richiesta.giaEsistente ? 200 : 201);
}
