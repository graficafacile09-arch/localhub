import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  getConfigPaccoSpedizione,
  updateConfigPaccoSpedizione,
} from "@/lib/merchant/data";

/**
 * GET /api/merchant/stores/[negozioId]/spedizione
 *
 * Configurazione del PACCO di spedizione del negozio (V1: un pacco per
 * ordine/negozio). Solo il venditore proprietario (o admin) può leggerla.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;

  const config = await getConfigPaccoSpedizione(user.id, negozioId);
  if (config === null) {
    return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);
  }

  return apiOk({ config });
}

/** Intero > 0 oppure null; ritorna null se valido, altrimenti un messaggio. */
function validaInteroPositivo(
  valore: unknown,
  etichetta: string
): { valore: number | null; errore?: string } {
  if (valore === null || valore === undefined || valore === "") {
    return { valore: null };
  }
  const n = Number(valore);
  if (!Number.isInteger(n) || n <= 0) {
    return { valore: null, errore: `${etichetta} deve essere un intero maggiore di zero.` };
  }
  return { valore: n };
}

/**
 * PATCH /api/merchant/stores/[negozioId]/spedizione
 *
 * Body: { paccoPesoGrammi, paccoLunghezzaCm, paccoLarghezzaCm,
 *         paccoAltezzaCm, paccoPesoMaxGrammi }
 * Tutti i campi possono essere null (pacco non configurato). Nessun valore
 * viene inventato lato server: si salvano esattamente i dati del venditore.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  const peso = validaInteroPositivo(body.paccoPesoGrammi, "Il peso del pacco");
  const lunghezza = validaInteroPositivo(body.paccoLunghezzaCm, "La lunghezza");
  const larghezza = validaInteroPositivo(body.paccoLarghezzaCm, "La larghezza");
  const altezza = validaInteroPositivo(body.paccoAltezzaCm, "L'altezza");
  const pesoMax = validaInteroPositivo(body.paccoPesoMaxGrammi, "Il peso massimo");

  const primoErrore =
    peso.errore ?? lunghezza.errore ?? larghezza.errore ?? altezza.errore ?? pesoMax.errore;
  if (primoErrore) {
    return apiError("VALIDATION_ERROR", primoErrore, 422);
  }

  const esito = await updateConfigPaccoSpedizione(user.id, negozioId, {
    paccoPesoGrammi: peso.valore,
    paccoLunghezzaCm: lunghezza.valore,
    paccoLarghezzaCm: larghezza.valore,
    paccoAltezzaCm: altezza.valore,
    paccoPesoMaxGrammi: pesoMax.valore,
  });

  if (!esito.ok) {
    return apiError("UPDATE_FAILED", esito.errore ?? "Impossibile salvare la configurazione.", 500);
  }

  revalidatePath(`/merchant/${negozioId}`);
  revalidatePath(`/merchant/${negozioId}/impostazioni`);

  return apiOk({ config: esito.data });
}
