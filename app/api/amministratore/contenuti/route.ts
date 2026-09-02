import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  creaContenutoAdmin,
  getContenutiAdmin,
  isStatoContenuto,
  validaCampiContenuto,
  type StatoContenuto,
} from "@/lib/amministratore/contenuti";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

/**
 * API CONTENUTI AMMINISTRATORE (/amministratore/contenuti).
 *
 * GET  → elenco paginato (ricerca per titolo/riassunto/autore, filtro
 *        stato), più recenti prima, senza contenuti fuori scope.
 * POST → creazione contenuto (admin). SOLO campi whitelist; slug
 *        auto-generato unico dal titolo se non fornito. Nessun dato
 *        arbitrario dal client.
 *
 * Ogni handler inizia con requireApiArea("admin"); la creazione viene
 * registrata in admin_activity_log (solo dopo il successo).
 */

export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const url = new URL(request.url);

  const filtri: {
    ricerca?: string;
    stato?: StatoContenuto;
    page?: number;
    pageSize?: number;
  } = {};

  const ricerca = url.searchParams.get("q");
  if (ricerca?.trim()) filtri.ricerca = ricerca.trim();

  const stato = url.searchParams.get("stato");
  if (stato && isStatoContenuto(stato)) filtri.stato = stato;

  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  if (Number.isFinite(page) && page > 0) filtri.page = page;

  const pageSize = parseInt(url.searchParams.get("pageSize") ?? "20", 10);
  if (Number.isFinite(pageSize) && pageSize > 0) filtri.pageSize = pageSize;

  const risultato = await getContenutiAdmin(filtri);
  return apiOk(risultato);
}

export async function POST(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const validazione = validaCampiContenuto(body);
  if (!validazione.ok) {
    return apiError("VALIDATION_ERROR", validazione.errore, 422);
  }

  const risultato = await creaContenutoAdmin(
    validazione.input as { titolo: string; corpo: string }
  );
  if (!risultato.ok) {
    return apiError("CREATE_FAILED", risultato.errore, 500);
  }

  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.CONTENUTO_CREATO,
    targetType: TARGET_TYPES.CONTENUTO,
    targetId: risultato.data.id,
    targetName: risultato.data.titolo,
    result: "success",
    detail: { stato: risultato.data.stato },
  });

  revalidatePath("/amministratore/contenuti");
  return apiOk({ contenuto: risultato.data }, 201);
}