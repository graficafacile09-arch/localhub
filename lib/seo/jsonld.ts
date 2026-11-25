import { getSiteUrl } from "@/lib/site";

/**
 * Helper per i dati strutturati Schema.org (JSON-LD).
 * Ogni pagina rende un solo `<script type="application/ld+json">` con questo
 * payload serializzato. Il payload è sempre costruito da dati nostri, mai da
 * input dell'utente, quindi la serializzazione diretta è sicura.
 */

export const NOME_SITO = "Radici Calabria";

export function jsonLdSerializzato(dati: Record<string, unknown>): string {
  return JSON.stringify({ "@context": "https://schema.org", ...dati }).replace(
    /</g,
    "\\u003c"
  );
}

export function breadcrumbList(
  voci: { nome: string; path: string }[]
): Record<string, unknown> {
  const base = getSiteUrl();
  return {
    "@type": "BreadcrumbList",
    itemListElement: voci.map((voce, indice) => ({
      "@type": "ListItem",
      position: indice + 1,
      name: voce.nome,
      item: `${base}${voce.path}`,
    })),
  };
}
