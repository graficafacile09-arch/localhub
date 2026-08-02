/**
 * Helper unificato di generazione slug per LocalHub.
 * Gli slug sono l'UNICO identificatore pubblico delle URL
 * (/negozio/<slug>, /prodotto/<slug>); gli ID restano interni.
 *
 * Logica identica alla funzione SQL public.slugify() definita in
 * supabase/migrations/20260802_url_slug_backfill.sql — tenere allineate.
 */
export function toSlug(text: string): string {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // rimuove gli accenti
  return normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

/**
 * True se il parametro è un UUID v4 (un ID di negozio legacy).
 * Usato dal ponte legacy delle route [slug]: se arriva un UUID,
 * si recupera lo slug e si risponde con redirect 301.
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * True se il parametro è un ID numerico (un ID di prodotto legacy,
 * prodotti.id è bigint).
 */
export function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}
