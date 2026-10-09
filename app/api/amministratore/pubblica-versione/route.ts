import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_ID = "prj_7sEnjoww9Zjf5FcTChoqZRNwIHo3";
const TEAM_ID = "team_d1aynCbQDA9zuB2Ohs0UVQIn";
const REPOSITORY_ORG = "graficafacile09-arch";
const REPOSITORY_NAME = "localhub";
const DEFAULT_BRANCH = "fix/hero-search-top-2026-10-08";

type VercelDeployment = {
  uid?: string;
  id?: string;
  url?: string;
  readyState?: string;
  state?: string;
  createdAt?: number;
  created?: number;
  meta?: Record<string, string>;
  gitSource?: { sha?: string; ref?: string };
};

function deploymentId(item: VercelDeployment) {
  return item.uid ?? item.id ?? "";
}

function deploymentState(item: VercelDeployment) {
  return item.readyState ?? item.state ?? "UNKNOWN";
}

async function vercelFetch(path: string, token: string, init?: RequestInit) {
  return fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

/** Restituisce le preview READY da scegliere esplicitamente e lo stato di un deploy avviato. */
export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return apiError("PUBLISH_NOT_CONFIGURED", "Pubblicazione non configurata: manca VERCEL_TOKEN nell'ambiente server-side di questa versione. Nessuna modifica è stata pubblicata.", 503);
  }

  const { searchParams } = new URL(request.url);
  const requestedDeploymentId = searchParams.get("deploymentId");
  if (requestedDeploymentId) {
    if (!/^dpl_[A-Za-z0-9]+$/.test(requestedDeploymentId)) {
      return apiError("DEPLOYMENT_ID_INVALID", "Identificativo deployment non valido.", 422);
    }
    const response = await vercelFetch(
      `/v13/deployments/${encodeURIComponent(requestedDeploymentId)}?teamId=${encodeURIComponent(TEAM_ID)}`,
      token
    );
    const data = await response.json().catch(() => null) as { id?: string; url?: string; readyState?: string; state?: string; error?: { message?: string } } | null;
    if (!response.ok || !data?.id) {
      return apiError("DEPLOYMENT_STATUS_FAILED", data?.error?.message ?? "Non riesco a leggere lo stato del deployment su Vercel.", 502);
    }
    return apiOk({ deploymentId: data.id, url: data.url ?? "", state: data.readyState ?? data.state ?? "UNKNOWN" });
  }

  const branch = process.env.VERCEL_PUBLISH_BRANCH ?? DEFAULT_BRANCH;
  const response = await vercelFetch(
    `/v6/deployments?projectId=${encodeURIComponent(PROJECT_ID)}&teamId=${encodeURIComponent(TEAM_ID)}&target=preview&limit=20`,
    token
  );
  const data = await response.json().catch(() => null) as { deployments?: VercelDeployment[] } | null;
  if (!response.ok) {
    return apiError("PREVIEW_LOOKUP_FAILED", "Non riesco a leggere le anteprime da Vercel.", 502);
  }

  const previews = (data?.deployments ?? [])
    .filter((item) =>
      item.meta?.githubCommitRef === branch &&
      deploymentState(item) === "READY" &&
      Boolean(deploymentId(item)) &&
      Boolean(item.url) &&
      Boolean(item.meta?.githubCommitSha ?? item.gitSource?.sha)
    )
    .sort((a, b) => (b.createdAt ?? b.created ?? 0) - (a.createdAt ?? a.created ?? 0))
    .map((item) => ({
      id: deploymentId(item),
      url: item.url!.startsWith("http") ? item.url! : `https://${item.url}`,
      branch,
      sha: item.meta?.githubCommitSha ?? item.gitSource?.sha ?? "",
      createdAt: item.createdAt ?? item.created ?? 0,
      message: item.meta?.githubCommitMessage ?? "",
    }));

  return apiOk({ branch, previews });
}

/** Pubblica esclusivamente il deployment preview scelto esplicitamente dall'amministratore. */
export async function POST(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as { confirmation?: unknown; previewId?: unknown } | null;
  if (body?.confirmation !== "PUBBLICA INCITTÀ") {
    return apiError("CONFIRMATION_REQUIRED", "Per pubblicare devi confermare esattamente: PUBBLICA INCITTÀ.", 422);
  }
  if (typeof body.previewId !== "string" || !/^dpl_[A-Za-z0-9]+$/.test(body.previewId)) {
    return apiError("PREVIEW_SELECTION_REQUIRED", "Seleziona e apri l'anteprima READY che hai verificato prima di pubblicare.", 422);
  }

  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return apiError("PUBLISH_NOT_CONFIGURED", "Pubblicazione non configurata: manca VERCEL_TOKEN nell'ambiente server-side di questa versione. Nessuna modifica è stata pubblicata.", 503);
  }

  const ref = process.env.VERCEL_PUBLISH_BRANCH ?? DEFAULT_BRANCH;
  if (!/^[A-Za-z0-9._/-]{1,250}$/.test(ref) || ref.startsWith("-")) {
    return apiError("PUBLISH_BRANCH_INVALID", "Il ramo configurato per la pubblicazione non è valido. Nessuna modifica è stata pubblicata.", 503);
  }

  const previewsResponse = await vercelFetch(
    `/v6/deployments?projectId=${encodeURIComponent(PROJECT_ID)}&teamId=${encodeURIComponent(TEAM_ID)}&target=preview&limit=20`,
    token
  );
  const previews = await previewsResponse.json().catch(() => null) as { deployments?: VercelDeployment[] } | null;
  if (!previewsResponse.ok) {
    return apiError("PREVIEW_LOOKUP_FAILED", "Non riesco a verificare l'anteprima su Vercel. Nessuna modifica è stata pubblicata.", 502);
  }

  const selected = (previews?.deployments ?? []).find((item) =>
    deploymentId(item) === body.previewId &&
    item.meta?.githubCommitRef === ref &&
    deploymentState(item) === "READY"
  );
  const testedSha = selected?.meta?.githubCommitSha ?? selected?.gitSource?.sha;
  if (!selected || !testedSha || !selected.url) {
    return apiError("SELECTED_PREVIEW_NOT_READY", "L'anteprima selezionata non risulta più READY o non appartiene al ramo autorizzato. Ricarica l'elenco e verifica di nuovo.", 409);
  }

  const response = await vercelFetch(
    `/v13/deployments?teamId=${encodeURIComponent(TEAM_ID)}`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "localhub",
        project: PROJECT_ID,
        target: "production",
        gitSource: {
          type: "github",
          org: REPOSITORY_ORG,
          repo: REPOSITORY_NAME,
          ref,
          sha: testedSha,
        },
        meta: {
          source: "incitta-admin-publish",
          testedPreviewId: deploymentId(selected),
          testedPreviewUrl: selected.url,
          testedCommitSha: testedSha,
          requestedBy: sessione.user.id,
          requestedByEmail: sessione.user.email ?? "",
        },
      }),
    }
  );

  const result = await response.json().catch(() => null) as { id?: string; url?: string; readyState?: string; error?: { message?: string }; message?: string } | null;
  if (!response.ok || !result?.id || !result?.url) {
    return apiError("PUBLISH_FAILED", result?.error?.message || result?.message || "Vercel non ha accettato la richiesta. La pubblicazione non è confermata.", 502);
  }

  return apiOk({
    deploymentId: result.id,
    url: result.url.startsWith("http") ? result.url : `https://${result.url}`,
    state: result.readyState ?? "BUILDING",
    branch: ref,
    testedPreviewId: deploymentId(selected),
    testedPreviewUrl: selected.url.startsWith("http") ? selected.url : `https://${selected.url}`,
    testedCommitSha: testedSha,
    requestedBy: sessione.user.email ?? sessione.user.id,
    message: "Richiesta inviata a Vercel. Lo stato verrà aggiornato automaticamente; il sito resta in manutenzione.",
  });
}
