import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * NOTIZIE PUBBLICHE — letture server-side per la pagina /notizie.
 *
 * Espone ESCLUSIVAMENTE le notizie con stato = 'published' (filtro nella
 * query, non nella logica della pagina): mai bozze/nascoste. Stesso pattern
 * di lib/contenuti-pubblici.ts (admin client service-role): nessuna
 * modifica a RLS. MAI throw: errori di DB → lista vuota (stato vuoto).
 *
 * Campi esposti: solo metadati/titolo/excerpt/fonte/data/categoria/link —
 * mai contenuti integrali (non ne conserviamo).
 */

export type NotiziaPubblica = {
  id: string;
  title: string;
  excerpt: string | null;
  originalUrl: string;
  sourceName: string;
  publishedAt: string | null;
  category: string;
  imageUrl: string | null;
};

function getDb() {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

function assumiNotiziaPubblica(riga: Record<string, unknown>): NotiziaPubblica {
  return {
    id: String(riga.id),
    title: String(riga.title ?? ""),
    excerpt: (riga.excerpt as string | null) ?? null,
    originalUrl: String(riga.original_url ?? ""),
    sourceName: String(riga.source_name ?? ""),
    publishedAt: (riga.published_at as string | null) ?? null,
    category: String(riga.category ?? ""),
    imageUrl: (riga.image_url as string | null) ?? null,
  };
}

/**
 * Ultime notizie pubblicate, dalla più recente alla più vecchia.
 * Restituisce sempre un array (vuoto se DB non disponibile, errore o
 * nessuna notizia pubblicata).
 */
export async function getNotiziePubbliche(limit = 60): Promise<NotiziaPubblica[]> {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("notizie")
    .select(
      "id, title, excerpt, original_url, source_name, published_at, category, image_url"
    )
    .eq("stato", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error || !data) {
    console.error("[notizie-pubbliche] elenco fallito:", error?.message ?? "data null");
    return [];
  }

  return (data as Record<string, unknown>[]).map(assumiNotiziaPubblica);
}

/** Formatta la data di pubblicazione in formato italiano leggibile. */
export function formattaDataNotizia(
  value: string | null | undefined
): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}