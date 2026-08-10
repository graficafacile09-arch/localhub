import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { creaReclamoOrdine, isTipoReclamo } from "@/lib/ordine-reclami";

/**
 * POST /api/cliente/ordini/[ordineId]/reclami
 *
 * Crea un reclamo ("Ordine non arrivato") per un ordine PROPRIO del cliente
 * autenticato. L'identità arriva dalla SESSIONE (requireApiArea "cliente"),
 * mai dal browser; la RPC `crea_reclamo_ordine` verifica l'ownership
 * dell'ordine ATOMICAMENTE e blocca i reclami attivi duplicati restituendo
 * quello esistente (giaEsistente: true).
 *
 * Body: { "tipo": "ordine_non_arrivato" (default), "messaggio": "..." (opz.) }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("cliente");
  if (error) return error;
  const user = sessione.user;

  const { ordineId } = await context.params;

  let body: { tipo?: unknown; messaggio?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  if (body.tipo !== undefined && !isTipoReclamo(body.tipo)) {
    return apiError("VALIDATION_ERROR", "Tipo di reclamo non valido.", 422);
  }
  const messaggio =
    typeof body.messaggio === "string" && body.messaggio.trim()
      ? body.messaggio.trim().slice(0, 1000)
      : null;

  const esito = await creaReclamoOrdine(user.id, ordineId, {
    tipo: body.tipo === "ordine_non_arrivato" ? "ordine_non_arrivato" : undefined,
    messaggio,
  });

  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }

  // Il venditore deve vedere subito il reclamo nell'area ordini.
  revalidatePath(`/merchant/${esito.reclamo.negozioId}/ordini`);
  revalidatePath(`/merchant/${esito.reclamo.negozioId}/ordini/${ordineId}`);
  revalidatePath(`/cliente/ordini/${ordineId}`);

  return apiOk({ reclamo: esito.reclamo, giaEsistente: esito.giaEsistente }, esito.giaEsistente ? 200 : 201);
}
