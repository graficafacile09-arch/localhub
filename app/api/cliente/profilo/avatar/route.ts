import { apiError, apiOk } from "@/lib/api/response";
import { getApiUtente } from "@/lib/auth/session";
import { aggiornaAvatar } from "@/lib/cliente/profile";

const MAX_AVATAR_DATA_URL = 3_500_000;

export async function POST(request: Request) {
  const { user, ok } = await getApiUtente(["customer"]);
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  if (!ok) return apiError("FORBIDDEN", "Accesso riservato ai clienti.", 403);

  const body = (await request.json()) as { dataUrl?: string };

  if (typeof body.dataUrl !== "string" || !body.dataUrl.trim()) {
    return apiError("VALIDATION_ERROR", "Nessuna immagine ricevuta.", 422);
  }

  if (!/^data:image\/\w+;base64,/.test(body.dataUrl)) {
    return apiError("VALIDATION_ERROR", "Formato immagine non valido.", 422);
  }

  if (body.dataUrl.length > MAX_AVATAR_DATA_URL) {
    return apiError(
      "FILE_TOO_LARGE",
      "L'immagine è troppo grande: comprimila prima di caricarla.",
      413
    );
  }

  const profilo = await aggiornaAvatar(user.id, body.dataUrl);

  if (!profilo) {
    return apiError("UPLOAD_FAILED", "Impossibile caricare l'avatar.", 500);
  }

  return apiOk({ profilo });
}
