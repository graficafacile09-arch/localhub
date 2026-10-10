export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("key") !== "events-photo-audit-2026") {
    return new Response("Not found", { status: 404 });
  }

  const response = await fetch("https://castrovillaricittafestival.it/eventi", {
    headers: { "user-agent": "Mozilla/5.0 (compatible; InCittaPreviewAudit/1.0)" },
    cache: "no-store",
  });

  const html = await response.text();
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)].slice(0, 120).map((match) => {
    const tag = match[0];
    const start = match.index ?? 0;
    const around = html.slice(Math.max(0, start - 1200), Math.min(html.length, start + 1800));
    const get = (name: string) => tag.match(new RegExp(name + '=["\\']([^"\\']+)["\\']', "i"))?.[1] ?? null;
    const anchors = [...around.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)];
    const lastAnchor = anchors[anchors.length - 1]?.[1] ?? null;
    const headings = [...around.matchAll(/<(?:h[1-6]|strong|title)[^>]*>([\\s\\S]*?)<\\/(?:h[1-6]|strong|title)>/gi)];
    const lastHeading = headings[headings.length - 1]?.[1]?.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim() ?? null;
    return {
      src: get("src"),
      lazySrc: get("data-src") ?? get("data-lazy-src") ?? get("data-original"),
      srcset: get("srcset"),
      alt: get("alt"),
      href: lastAnchor,
      heading: lastHeading,
      tag,
    };
  });

  return Response.json({
    source: "https://castrovillaricittafestival.it/eventi",
    status: response.status,
    pageTitle: html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? null,
    htmlLength: html.length,
    images: tags,
  });
}
