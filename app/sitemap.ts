import type { MetadataRoute } from "next";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";
import { TERRITORI_ORDINATI } from "@/lib/territori";

const SITE_URL = getSiteUrl();

// La sitemap è rigenerata al massimo ogni ora (ISR): le query Supabase
// non vengono rieseguite a ogni richiesta quando la configurazione è completa.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/filiere`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/filiere/prodotti`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/territorio`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/stagionalita`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/attrazioni`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/prodotti-tipici`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/venditori`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/negozi`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/ricerca`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/contenuti`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/notizie`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contatti`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/termini`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/cookie`, changeFrequency: "yearly", priority: 0.3 },
  ];

  for (const territorio of TERRITORI_ORDINATI) {
    urls.push({
      url: `${SITE_URL}/territorio/${territorio.slug}`,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  // Durante una build su ambienti che non hanno ancora la chiave server,
  // restituiamo le URL statiche senza interrompere il deploy.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return urls;
  }

  const db = createAdminSupabaseClient();

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
