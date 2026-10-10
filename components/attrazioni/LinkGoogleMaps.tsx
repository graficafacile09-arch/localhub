"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MapPinned } from "lucide-react";

const COORDINATE: Record<string, [number, number]> = {
  "Castello Aragonese Castrovillari": [39.8093125, 16.2081875],
  "Protoconvento Francescano Castrovillari": [39.8086875, 16.2103125],
  "Museo Archeologico Castrovillari": [39.8083149, 16.2098598],
  "Teatro Sybaris Castrovillari": [39.8086875, 16.2103125],
  "Morano Calabro, Calabria, Italia": [39.8420625, 16.1361875],
  "Civita, Calabria, Italia": [39.8274375, 16.3129375],
  "Altomonte, Calabria, Italia": [39.6993125, 16.1301875],
};

function urlCoordinate(query: string) {
  const coordinates = COORDINATE[query];
  return coordinates
    ? `https://www.google.com/maps?q=${coordinates[0]},${coordinates[1]}`
    : `https://www.google.com/maps/place/${encodeURIComponent(query)}`;
}

export default function LinkGoogleMaps({ query, label }: { query: string; label: string }) {
  const [mapsUrl, setMapsUrl] = useState(urlCoordinate(query));

  useEffect(() => {
    setMapsUrl(urlCoordinate(query));
    const controller = new AbortController();
    fetch(`/api/attrazioni/foto?query=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (typeof data?.mapsUrl === "string") {
          try {
            const url = new URL(data.mapsUrl);
            if (url.protocol === "https:" && (url.hostname === "maps.google.com" || url.hostname === "www.google.com" || url.hostname === "google.com")) {
              setMapsUrl(data.mapsUrl);
              return;
            }
          } catch {}
        }
        if (typeof data?.latitude === "number" && typeof data?.longitude === "number") {
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
