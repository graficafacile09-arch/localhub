import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * CONTENUTI PUBBLICI — letture server-side per il sito pubblico.
 *
 * Espone ESCLUSIVAMENTE i contenuti con stato = 'pubblicato': bozze e
 * contenuti archiviati non sono MAI raggiungibili da queste funzioni,
 * nemmeno passando uno slug/URL manipolato (il filtro è nella query, non
 * nella logica della pagina). Stesso pattern di accesso delle altre letture
 * pubbliche (admin client service-role, come lib/negozi.ts e app/sitemap.ts):
 * nessuna modifica a RLS/schema.
 *
 * Campi esposti: la sola informazione editoriale utile al pubblico
 * (titolo, slug, riassunto, corpo, immagine, autore, date) — nessun campo
 * amministrativo. MAI throw: errori di DB → liste vuote / null (le page
 * restituiscono lo stato vuoto o il 404 standard).
 */

export type ContenutoPubblico = {
  id: string;
  titolo: string;
  slug: string;
  riassunto: string | null;
  corpo: string;
  immagine_url: string | null;
  autore: string | null;
  pubblicato_il: string | null;
  created_at: string;
};

/** Formatta la data di pubblicazione in formato italiano leggibile
 *  (es. "12 marzo 2026"); stringa vuota se assente/non valida. */
export function formattaDataPubblicazione(
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

function getDb() {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

function assumiContenutoPubblico(riga: Record<string, unknown>): ContenutoPubblico {
  return {
    id: String(riga.id),
    titolo: String(riga.titolo ?? ""),
    slug: String(riga.slug ?? ""),
    riassunto: (riga.riassunto as string | null) ?? null,
    corpo: String(riga.corpo ?? ""),
    immagine_url: (riga.immagine_url as string | null) ?? null,
    autore: (riga.autore as string | null) ?? null,
    pubblicato_il: (riga.pubblicato_il as string | null) ?? null,
    created_at: String(riga.created_at ?? ""),
  };
}

/**
 * Elenco dei contenuti PUBBLICATI, dal più recente al più vecchio.
 * Restituisce sempre un array (vuoto se DB non disponibile, errore o
 * nessun contenuto pubblicato).
 */
export async function getContenutiPubblici(
  limit = 100
): Promise<ContenutoPubblico[]> {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("contenuti")
    .select("id, titolo, slug, riassunto, immagine_url, autore, pubblicato_il, created_at")
    .eq("stato", "pubblicato")
    .order("pubblicato_il", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error || !data) {
    console.error("[contenuti-pubblici] elenco fallito:", error?.message ?? "data null");
    return [];
  }

  return (data as Record<string, unknown>[]).map(assumiContenutoPubblico);
}

/**
 * Singolo contenuto PUBBLICATO per slug. null se: slug assente, contenuto
 * inesistente, NON pubblicato, o errore DB → la pagina gestisce il 404.
 */
export async function getContenutoPubblicoBySlug(
  slug: string
): Promise<ContenutoPubblico | null> {
  const db = getDb();
  if (!db || !slug) return null;

  const { data, error } = await db
    .from("contenuti")
    .select("id, titolo, slug, riassunto, corpo, immagine_url, autore, pubblicato_il, created_at")
    .eq("slug", slug)
    .eq("stato", "pubblicato")
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("[contenuti-pubblici] dettaglio fallito:", error.message);
    }
    return null;
  }

  return assumiContenutoPubblico(data as Record<string, unknown>);
}