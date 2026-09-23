import type { MetadataRoute } from "next";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";

const SITE_URL = getSiteUrl();

// La sitemap è rigenerata al massimo ogni ora (ISR): le query Supabase
// non vengono rieseguite a ogni richiesta quando la configurazione è completa.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/negozi`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/ricerca`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/categorie`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/offerte`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/prodotti-tipici`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/contenuti`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/notizie`, changeFrequency: "hourly", priority: 0.7 },
  ];

  // Durante una build su ambienti che non hanno ancora la chiave server,
  // restituiamo le URL statiche senza interrompere il deploy.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return urls;
  }

  const db = createAdminSupabaseClient();

  // Categorie attive con slug.
  const { data: categorie } = await db
    .from("categorie")
    .select("slug")
    .eq("attivo", true)
    .not("slug", "is", null);

  for (const categoria of categorie ?? []) {
    urls.push({
      url: `${SITE_URL}/categorie/${categoria.slug}`,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

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
      ...(negozio.updated_at
        ? { lastModified: new Date(negozio.updated_at) }
        : {}),
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
      ...(prodotto.updated_at
        ? { lastModified: new Date(prodotto.updated_at) }
        : {}),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  // Contenuti editoriali SOLO pubblicati.
  const { data: contenuti } = await db
    .from("contenuti")
    .select("slug, updated_at")
    .eq("stato", "pubblicato")
    .not("slug", "is", null);

  for (const contenuto of contenuti ?? []) {
    urls.push({
      url: `${SITE_URL}/contenuti/${contenuto.slug}`,
      ...(contenuto.updated_at
        ? { lastModified: new Date(contenuto.updated_at) }
        : {}),
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  return urls;
}
