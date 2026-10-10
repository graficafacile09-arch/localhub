export const dynamic = "force-dynamic";

const OFFICIAL_PAGES: Record<string, string> = {
  "Primafila": "https://castrovillaricittafestival.it/contenuti/3529951/rty",
  "Radure – Invito al teatro": "https://castrovillaricittafestival.it/eventi/3046323/radure-invito-teatro",
  "Càlabbria Teatro Festival": "https://castrovillaricittafestival.it/contenuti/3529973/calabbria-teatro-festival",
  "Festival Antonio Vivaldi": "https://castrovillaricittafestival.it/eventi/3046330/festival-antonio-vivaldi",
  "I-Fest International Film Festival": "https://castrovillaricittafestival.it/eventi/3046342/fest-international-film-festival",
  "Castrovillari Film Festival": "https://castrovillaricittafestival.it/contenuti/3529981/castrovillari-film-festival",
  "Peperoncino Jazz Festival": "https://castrovillaricittafestival.it/eventi/3046397/peperoncino-jazz-festival",
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
  "Festival della Cipolla Bianca": "https://castrovillaricittafestival.it/contenuti/3529995/festival-cipolla-bianca-castrovillari",
  "Festival dei Lettori": "https://castrovillaricittafestival.it/contenuti/3530030/festival-ricorrente-lettori",
  "Vibe Fest": "https://castrovillaricittafestival.it/contenuti/3530045/vibe-fest",
  "Pollicino Book Festival": "https://castrovillaricittafestival.it/contenuti/3530019/pollicino-book-festival",
};

function decode(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#x2F;/g, "/");
}

export async function GET(request: Request) {
  const event = new URL(request.url).searchParams.get("event") ?? "";
  const page = OFFICIAL_PAGES[event];
  if (!page) return Response.json({ src: null }, { status: 404 });

  try {
    const response = await fetch(page, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; InCitta/1.0)" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) return Response.json({ src: null }, { status: 502 });
    const html = await response.text();

    const candidates = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
    ];
    for (const pattern of candidates) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const src = decode(match[1].trim());
        return Response.json({ src: new URL(src, page).toString(), page });
      }
    }

    const images = [...html.matchAll(/<img\b[^>]*>/gi)];
    for (const match of images) {
      const tag = match[0];
      const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "";
      const src = tag.match(/\b(?:src|data-src|data-original)=["']([^"']+)["']/i)?.[1];
      if (src && alt && /festival|castrovillari|teatro|cinema|musica|folklore|civita|cipolla|vino|legalit/i.test(alt)) {
        return Response.json({ src: new URL(decode(src), page).toString(), page });
      }
    }
    if (event === "Primafila") {
      const fallbackPage = "https://comune.castrovillari.cs.it/luoghi/2435594/teatro-sybaris";
      const fallbackResponse = await fetch(fallbackPage, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; InCitta/1.0)" },
        next: { revalidate: 86400 },
      });
      if (fallbackResponse.ok) {
        const fallbackHtml = await fallbackResponse.text();
        for (const pattern of candidates) {
          const match = fallbackHtml.match(pattern);
          if (match?.[1]) {
            const src = decode(match[1].trim());
            return Response.json({ src: new URL(src, fallbackPage).toString(), page: fallbackPage });
          }
        }
        const fallbackImages = [...fallbackHtml.matchAll(/<img\\b[^>]*>/gi)];
        for (const match of fallbackImages) {
          const tag = match[0];
          const alt = tag.match(/\\balt=["']([^"']*)["']/i)?.[1] ?? "";
          const src = tag.match(/\\b(?:src|data-src|data-original)=["']([^"']+)["']/i)?.[1];
          if (src && /teatro|sybaris|immagine principale|castrovillari/i.test(alt)) {
            return Response.json({ src: new URL(decode(src), fallbackPage).toString(), page: fallbackPage });
          }
        }
      }
    }
    return Response.json({ src: null, page }, { status: 404 });
  } catch {
    return Response.json({ src: null, page }, { status: 502 });
  }
}
