import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { createStoreFromTemplate } from "@/lib/merchant/template-store";
import { generaSlugUnivoco } from "@/lib/slug-server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  const { templateId } = await context.params;
  const body = await request.json();

  const nome = (body.nome as string)?.trim();
  const slug = (body.slug as string)?.trim();
  const categoria = (body.categoria as string)?.trim();
  const citta = (body.citta as string)?.trim();

  if (!nome) return apiError("VALIDATION_ERROR", "Il nome del negozio è obbligatorio.", 422);
  if (!slug) return apiError("VALIDATION_ERROR", "Lo slug è obbligatorio.", 422);
  if (!categoria) return apiError("VALIDATION_ERROR", "La categoria è obbligatoria.", 422);
  if (!citta) return apiError("VALIDATION_ERROR", "La città è obbligatoria.", 422);

  try {
    const slugUnivoco = await generaSlugUnivoco("negozi", slug);
    const result = await createStoreFromTemplate(user.id, templateId, {
      nome,
      slug: slugUnivoco,
      categoria,
      sottocategoria: (body.sottocategoria as string)?.trim() || undefined,
      citta,
    });
    return apiOk({ storeId: result.id }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("USE_TEMPLATE_FAILED", message, 500);
  }
}
