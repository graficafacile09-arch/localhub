import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  bulkDeleteMerchantProductsForStore,
  bulkUpdateMerchantProductsForStore,
  getMerchantStoreForUser,
} from "@/lib/merchant/data";

const AZIONI_VALIDE = ["attiva", "disattiva", "elimina"] as const;
type AzioneBulk = (typeof AZIONI_VALIDE)[number];

const MAX_IDS = 100;

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storeResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  if (!storeResult.data) {
    return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);
  }

  const body = (await request.json().catch(() => null)) as {
    ids?: unknown;
    azione?: unknown;
  } | null;

  if (!body || typeof body !== "object") {
    return apiError("INVALID_BODY", "Body JSON non valido.", 422);
  }

  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS) {
    return apiError("INVALID_BODY", `Seleziona da 1 a ${MAX_IDS} prodotti.`, 422);
  }
  if (!ids.every((id) => typeof id === "string" && id.trim().length > 0)) {
    return apiError("INVALID_BODY", "Identificativi prodotto non validi.", 422);
  }

  const azione = body.azione;
  if (typeof azione !== "string" || !AZIONI_VALIDE.includes(azione as AzioneBulk)) {
    return apiError("INVALID_BODY", "Azione non valida.", 422);
  }

  const productIds = ids.map((id) => String(id).trim());

  switch (azione as AzioneBulk) {
    case "attiva":
    case "disattiva": {
      const result = await bulkUpdateMerchantProductsForStore(user.id, negozioId, productIds, {
        attivo: azione === "attiva",
      });
      if (result.setupRequired) {
        return apiError("SETUP_REQUIRED", result.errorMessage ?? "Configurazione database non completata.", 503);
      }
      if (result.errorMessage) {
        return apiError("BULK_UPDATE_FAILED", result.errorMessage, 500);
      }
      return apiOk({
        azione,
        aggiornati: result.data.length,
        ids: result.data,
      });
    }

    case "elimina": {
      const result = await bulkDeleteMerchantProductsForStore(user.id, negozioId, productIds);
      if (result.setupRequired) {
        return apiError("SETUP_REQUIRED", result.errorMessage ?? "Configurazione database non completata.", 503);
      }
      if (result.errorMessage) {
        return apiError("BULK_DELETE_FAILED", result.errorMessage, 500);
      }
      return apiOk({
        azione,
        eliminati: result.data.eliminati,
      });
    }
  }
}
