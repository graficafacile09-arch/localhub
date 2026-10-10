"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MapPinned } from "lucide-react";

export default function LinkGoogleMaps({ query, label }: { query: string; label: string }) {
  const [mapsUrl, setMapsUrl] = useState(`https://www.google.com/maps/place/${encodeURIComponent(query)}`);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/attrazioni/foto?query=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (typeof data?.mapsUrl === "string" && data.mapsUrl.startsWith("https://www.google.com/maps/")) {
          setMapsUrl(data.mapsUrl);
        } else if (typeof data?.latitude === "number" && typeof data?.longitude === "number") {
          setMapsUrl(`https://www.google.com/maps?q=${data.latitude},${data.longitude}`);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [query]);

  return (
    <a aria-label={`Apri ${label} sulla posizione esatta di Google Maps`} href={mapsUrl} target="_blank" rel="noopener noreferrer"
      className="mt-3 mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-yellow-400 bg-yellow-400 px-4 py-3 text-sm font-extrabold text-blue-950 shadow-sm transition hover:bg-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-950">
      <MapPinned className="h-4 w-4" aria-hidden /> Indicazioni Google Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}
