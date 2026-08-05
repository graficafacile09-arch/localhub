import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  deleteMerchantStore,
  getMerchantProductsForStore,
  getMerchantStoreForUser,
} from "@/lib/merchant/data";

export async function GET(
  _request: Request,
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

  const productsResult = await getMerchantProductsForStore(user.id, negozioId);

  return apiOk({
    store: storeResult.data,
    stats: {
      products: productsResult.data.length,
      activeProducts: productsResult.data.filter((item) => item.attivo).length,
    },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;

  const deleteResult = await deleteMerchantStore(user.id, negozioId);

  if (deleteResult.setupRequired) {
    return apiError("SETUP_REQUIRED", deleteResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  if (deleteResult.errorMessage) {
    return apiError("STORE_DELETE_FAILED", deleteResult.errorMessage, 500);
  }

  revalidatePath("/merchant");
  revalidatePath("/negozi");
  revalidatePath("/");

  return apiOk({ deleted: true });
}
