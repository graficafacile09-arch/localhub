/**
 * Build a Pino shop-card destination only when the returned shop slug is valid.
 * Search results can contain stores without a public detail-page slug.
 */
export function pinoShopHref(slug: unknown): string | null {
  if (typeof slug !== "string") return null;
  const value = slug.trim();
  if (!value || /^(?:null|undefined)$/i.test(value)) return null;
  return `/negozio/${value}`;
}
