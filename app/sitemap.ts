import type { MetadataRoute } from "next";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";

const SITE_URL = getSiteUrl();

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = createAdminSupabaseClient();
  const now = new Date();

  const urls: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/negozi`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/ricerca`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/categorie`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  // Negozi attivi (URL pubbliche SOLO con slug).
  const { data: negozi } = await db
    .from("negozi")
    .select("slug, updated_at")
    .eq("attivo", true)
    .is("deleted_at", null)
    .not("slug", "is", null);

  for (const negozio of negozi ?? []) {
    urls.push({
      url: `${SITE_URL}/negozio/${negozio.slug}`,
      lastModified: new Date(negozio.updated_at ?? now),
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  // Prodotti attivi con slug.
  const { data: prodotti } = await db
    .from("prodotti")
    .select("slug, updated_at")
    .eq("attivo", true)
    .not("slug", "is", null);

  for (const prodotto of prodotti ?? []) {
    urls.push({
      url: `${SITE_URL}/prodotto/${prodotto.slug}`,
      lastModified: new Date(prodotto.updated_at ?? now),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  return urls;
}
