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
    return apiError("SETUP_REQUIRED", storesResult.errorMessage ?? "Merchant Foundation non configurata.", 503);
  }

  return apiOk({
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    stores: storesResult.data,
  });
}
