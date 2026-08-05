import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getMerchantStoresForUser } from "@/lib/merchant/data";

export async function GET() {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const storesResult = await getMerchantStoresForUser(user.id);

  if (storesResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storesResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  return apiOk({
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    stores: storesResult.data,
  });
}
