import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_ID = "prj_7sEnjoww9Zjf5FcTChoqZRNwIHo3";
const TEAM_ID = "team_d1aynCbQDA9zuB2Ohs0UVQIn";
const REPOSITORY_ORG = "graficafacile09-arch";
const REPOSITORY_NAME = "localhub";

/**
 * Pubblica solo su richiesta esplicita di un amministratore.
 * Richiede VERCEL_TOKEN configurato come variabile server-side, mai esposta al browser.
 */
export async function POST(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as { confirmation?: unknown } | null;
  if (body?.confirmation !== "PUBBLICA INCITTÀ") {
    return apiError("CONFIRMATION_REQUIRED", "Per pubblicare devi confermare esattamente: PUBBLICA INCITTÀ.", 422);
  }

  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return apiError(
      "PUBLISH_NOT_CONFIGURED",
      "Pubblicazione non ancora configurata: manca la variabile server-side VERCEL_TOKEN in Vercel. Nessuna modifica è stata pubblicata.",
      503
    );
  }

  // Non promuovere automaticamente il branch di preview: il ramo di rilascio
  // deve essere scelto esplicitamente dall'amministratore tramite env server-side.
  const ref = process.env.VERCEL_PUBLISH_BRANCH;
  if (!ref || !/^[A-Za-z0-9._/-]{1,250}$/.test(ref) || ref.startsWith("-")) {
    return apiError(
      "PUBLISH_BRANCH_NOT_CONFIGURED",
      "Pubblicazione non configurata: imposta VERCEL_PUBLISH_BRANCH con il ramo Git approvato per il rilascio. Nessuna modifica è stata pubblicata.",
      503
    );
  }
  const response = await fetch(
    `https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(TEAM_ID)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "localhub",
        project: PROJECT_ID,
        target: "production",
        gitSource: {
          type: "github",
          org: REPOSITORY_ORG,
          repo: REPOSITORY_NAME,
          ref,
        },
        meta: {
          source: "incitta-admin-publish",
          requestedBy: sessione.user.id,
          requestedByEmail: sessione.user.email ?? "",
        },
      }),
      cache: "no-store",
    }
  );

  const result = (await response.json().catch(() => null)) as
    | { id?: string; url?: string; readyState?: string; error?: { message?: string }; message?: string }
    | null;

  if (!response.ok || !result?.id || !result?.url) {
    return apiError(
      "PUBLISH_FAILED",
      result?.error?.message || result?.message || "Vercel non ha accettato la richiesta. La pubblicazione non è confermata.",
      502
    );
  }

  return apiOk({
    deploymentId: result.id,
    url: result.url.startsWith("http") ? result.url : `https://${result.url}`,
    state: result.readyState ?? "BUILDING",
    branch: ref,
    requestedBy: sessione.user.email ?? sessione.user.id,
    message: "Richiesta inviata a Vercel. Verifica che il deployment sia READY e controlla il sito pubblicato.",
  });
}
