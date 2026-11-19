import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const match = /^https:\/\/([^.]+)\.supabase\.co/.exec(url);
  const projectRef = match?.[1] ?? null;

  return Response.json({
    configured: Boolean(projectRef),
    projectRefHash: projectRef
      ? createHash("sha256").update(projectRef).digest("hex").slice(0, 16)
      : null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    gitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasSecretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
  });
}
