import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommonsPage = {
  title?: string;
  imageinfo?: {
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: {
      Artist?: { value?: string };
      LicenseShortName?: { value?: string };
    };
  }[];
};
type CommonsSearch = { query?: { pages?: Record<string, CommonsPage> } };

function plainText(value?: string) {
  return value?.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim();
  if (!query || query.length > 180) {
    return NextResponse.json({ error: "Query non valida" }, { status: 400 });
  }

  try {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", `filetype:bitmap ${query}`);
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrlimit", "8");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|extmetadata");
    url.searchParams.set("iiurlwidth", "720");

    const response = await fetch(url, {
      headers: { "User-Agent": "InCitta/1.0 (local tourism guide; image attribution displayed)" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) {
      console.error("Wikimedia Commons image search failed", response.status);
      return NextResponse.json({ photoUrl: null, attribution: null });
    }

    const data = (await response.json()) as CommonsSearch;
    const pages = Object.values(data.query?.pages ?? {});
    const page = pages.find((candidate) => candidate.imageinfo?.[0]?.thumburl);
    const info = page?.imageinfo?.[0];
    if (!page || !info?.thumburl) {
      return NextResponse.json({ photoUrl: null, attribution: null });
    }

    return NextResponse.json({
      photoUrl: info.thumburl,
      sourceUrl: info.descriptionurl,
      title: page.title?.replace(/^File:/, ""),
      attribution: plainText(info.extmetadata?.Artist?.value),
      license: plainText(info.extmetadata?.LicenseShortName?.value),
    }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (error) {
    console.error("Wikimedia Commons image lookup failed", error);
    return NextResponse.json({ photoUrl: null, attribution: null });
  }
}
