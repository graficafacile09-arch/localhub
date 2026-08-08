const PRODUCTION_FALLBACK = "https://www.incitta.online";

function normalizeUrl(value: string): string {
  let u = value.trim().replace(/\/+$/, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

export function getSiteUrl(): string {
  const explicit = normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (explicit) return explicit;
  const vercel = normalizeUrl(process.env.VERCEL_URL ?? "");
  const isCustomDomain =
    vercel &&
    !vercel.endsWith(".vercel.app") &&
    !/^https:\/\/[^.]+\.[^.]+\.vercel\.app$/.test(vercel) &&
    !/localhub/i.test(vercel);
  if (isCustomDomain) return vercel;
  return PRODUCTION_FALLBACK;
}
