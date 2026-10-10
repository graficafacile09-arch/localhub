export const dynamic = "force-dynamic";

const OFFICIAL_PAGES: Record<string, string> = {
  "Primafila": "https://castrovillaricittafestival.it/contenuti/3529951/rty",
  "Radure – Invito al teatro": "https://castrovillaricittafestival.it/eventi/3046323/radure-invito-teatro",
  "Càlabbria Teatro Festival": "https://castrovillaricittafestival.it/contenuti/3529973/calabbria-teatro-festival",
  "Festival Antonio Vivaldi": "https://castrovillaricittafestival.it/eventi/3046330/festival-antonio-vivaldi",
  "I-Fest International Film Festival": "https://castrovillaricittafestival.it/eventi/3046342/fest-international-film-festival",
  "Castrovillari Film Festival": "https://castrovillaricittafestival.it/contenuti/3529981/castrovillari-film-festival",
  "Peperoncino Jazz Festival": "https://castrovillaricittafestival.it/eventi/3046397/peperoncino-jazz-festival",
  "Festival della Cipolla Bianca": "https://castrovillaricittafestival.it/eventi/3483904/festival-cipolla-bianca-castrovillari",
  "Clap! Etno Music Fest": "https://castrovillaricittafestival.it/eventi/3483896/clap-etno-music-festival",
  "Civita Nova – Radicarsi": "https://castrovillaricittafestival.it/eventi/3046349/civita-nova-radicarsi",
  "Suoni Festival": "https://castrovillaricittafestival.it/eventi/3046400/suoni-festival",
  "Joy Festival": "https://castrovillaricittafestival.it/eventi/3046332/joy-festival",
  "Festival dei Quartieri": "https://castrovillaricittafestival.it/eventi/3046399/festival-quartieri",
  "Premio Castrovillari d'autore": "https://castrovillaricittafestival.it/eventi/3046403/premio-castrovillari-d-autore",
  "Festival della Legalità": "https://castrovillaricittafestival.it/eventi/3046408/festival-legalita",
  "Calabria Wine & Design Festival": "https://castrovillaricittafestival.it/contenuti/3530006/calabria-wine-design-festival",
  "Rural Food Festival": "https://castrovillaricittafestival.it/contenuti/3530056/rural-food-festival",
  "Rigenerazioni Fest": "https://castrovillaricittafestival.it/eventi/3046305/rigenerazioni-fest",
  "Primavera dei Teatri": "https://castrovillaricittafestival.it/contenuti/3530004/primavera-teatri",
  "Estate Internazionale del Folklore": "https://castrovillaricittafestival.it/eventi/2173811/estate-internazionale-folklore",
  "Festival dei Lettori": "https://castrovillaricittafestival.it/contenuti/3530030/festival-ricorrente-lettori",
  "Vibe Fest": "https://castrovillaricittafestival.it/contenuti/3530045/vibe-fest",
  "Pollicino Book Festival": "https://castrovillaricittafestival.it/contenuti/3530019/pollicino-book-festival",
};

function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/gi, "/")
    .replace(/&#x3D;/gi, "=");
}

function attribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function isPrimafilaBlocked(raw: string, baseUrl: string): boolean {
  try {
    return /\/2018_senza-glutine\.jpg$/i.test(new URL(decode(raw), baseUrl).pathname);
  } catch {
    return /2018_senza-glutine\.jpg/i.test(raw);
  }
}

function resolveImageUrl(raw: string, baseUrl: string): string | null {
  try {
    const url = new URL(decode(raw.trim()), baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const path = url.pathname.toLowerCase();
    if (/(^|[\\/_-])(logo|favicon|placeholder|no[-_]?image|default[-_]?image)([\\/._-]|$)/i.test(path)) {
      return null;
    }
    if (/2018_senza-glutine\.jpg$/i.test(path)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalize(value: string): string {
  return decode(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function imageAltMatchesEvent(alt: string, event: string): boolean {
  const stopwords = new Set(["della", "delle", "dello", "del", "dei", "degli", "di", "the", "and", "invito"]);
  const tokens = normalize(event).split(/\s+/).filter((token) => token.length >= 4 && !stopwords.has(token));
  if (!tokens.length) return false;
  const normalizedAlt = normalize(alt);
  const matches = tokens.filter((token) => normalizedAlt.includes(token)).length;
  return matches >= Math.min(2, tokens.length);
}

export async function GET(request: Request) {
  const event = new URL(request.url).searchParams.get("event") ?? "";
  const page = OFFICIAL_PAGES[event];
  if (!page) return Response.json({ src: null }, { status: 404 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(page, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; InCitta/1.0)" },
      signal: controller.signal,
      next: { revalidate: 86400 },
    });
    if (!response.ok) return Response.json({ src: null, page }, { status: 502 });

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return Response.json({ src: null, page }, { status: 502 });
    }

    const html = await response.text();
    const finalPage = response.url || page;

    // If the official Primafila page exposes the known unrelated image, reject it.
    // Do not fall back to a generic image for this event.
    const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
    for (const tag of metaTags) {
      const property = (attribute(tag, "property") ?? attribute(tag, "name") ?? "").toLowerCase();
      if (property !== "og:image" && property !== "twitter:image") continue;

      const raw = attribute(tag, "content");
      if (!raw) continue;
      if (event === "Primafila" && isPrimafilaBlocked(raw, finalPage)) {
        return Response.json({ src: null, page: finalPage }, { status: 404 });
      }

      const src = resolveImageUrl(raw, finalPage);
      if (src) return Response.json({ src, page: finalPage });
    }

    // If social metadata is a logo or placeholder, accept only an image whose alt
    // text identifies this event rather than an unrelated image from the page.
    const imageTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    for (const tag of imageTags) {
      const alt = attribute(tag, "alt") ?? "";
      const raw = attribute(tag, "src") ?? attribute(tag, "data-src") ?? attribute(tag, "data-original");
      if (!raw || !alt || !imageAltMatchesEvent(alt, event)) continue;
      const src = resolveImageUrl(raw, finalPage);
      if (src) return Response.json({ src, page: finalPage });
    }

    return Response.json({ src: null, page: finalPage }, { status: 404 });
  } catch {
    return Response.json({ src: null, page }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
