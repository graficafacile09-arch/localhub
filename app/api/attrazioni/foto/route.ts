import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlacePhoto = {
  name?: string;
  authorAttributions?: { displayName?: string; uri?: string }[];
};
type PlaceSearch = { places?: { photos?: PlacePhoto[]; location?: { latitude?: number; longitude?: number }; googleMapsUri?: string }[] };

export async function GET(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Google Maps non configurato" }, { status: 503 });

  const query = request.nextUrl.searchParams.get("query")?.trim();
  if (!query || query.length > 180) return NextResponse.json({ error: "Query non valida" }, { status: 400 });

  try {
    const search = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.photos.name,places.photos.authorAttributions,places.location,places.googleMapsUri",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "it", regionCode: "IT", maxResultCount: 1 }),
      cache: "no-store",
    });
    if (!search.ok) {
      console.error("Google Places Text Search failed", search.status);
      return NextResponse.json({ error: "Ricerca foto non riuscita" }, { status: 502 });
    }
    const result = (await search.json()) as PlaceSearch;
    const place = result.places?.[0];
    const photo = place?.photos?.[0];
    const placeData = { mapsUrl: place?.googleMapsUri ?? null, latitude: place?.location?.latitude ?? null, longitude: place?.location?.longitude ?? null };
    if (!photo?.name) return NextResponse.json({ photoUrl: null, attribution: [], ...placeData });

    const mediaUrl = new URL(`https://places.googleapis.com/v1/${photo.name}/media`);
    mediaUrl.searchParams.set("maxWidthPx", "640");
    mediaUrl.searchParams.set("maxHeightPx", "360");
    mediaUrl.searchParams.set("skipHttpRedirect", "true");
    mediaUrl.searchParams.set("key", apiKey);
    const media = await fetch(mediaUrl, { cache: "no-store" });
    if (!media.ok) {
      console.error("Google Places Photo Media failed", media.status);
      return NextResponse.json({ error: "Foto non disponibile" }, { status: 502 });
    }
    const mediaResult = (await media.json()) as { photoUri?: string };
    if (!mediaResult.photoUri) return NextResponse.json({ photoUrl: null, attribution: [] });

    const attribution = (photo.authorAttributions ?? [])
      .filter((author) => author.displayName)
      .map((author) => ({
        name: author.displayName!,
        url: author.uri ? (author.uri.startsWith("//") ? `https:${author.uri}` : author.uri) : undefined,
      }));
    return NextResponse.json({ photoUrl: mediaResult.photoUri, attribution, ...placeData }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Google Maps photo lookup failed", error);
    return NextResponse.json({ error: "Errore nel recupero della foto" }, { status: 502 });
  }
}
