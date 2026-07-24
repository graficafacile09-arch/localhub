import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { getMerchantStoresForUser } from "@/lib/merchant/data";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  }

  const storesResult = await getMerchantStoresForUser(user.id);

  if (storesResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storesResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  return apiOk({ stores: storesResult.data });
}
