"use client";

import { ExternalLink, MapPinned } from "lucide-react";

function googleMapsSearchUrl(query: string) {
  // Usa una ricerca esplicita per nome e località: niente coordinate approssimative
  // e niente risultati automatici di Places, che possono puntare al luogo sbagliato.
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function LinkGoogleMaps({ query, label }: { query: string; label: string }) {
  const mapsUrl = googleMapsSearchUrl(query);

  return (
    <a aria-label={`Cerca ${label} su Google Maps`} href={mapsUrl} target="_blank" rel="noopener noreferrer"
      className="mt-3 mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-yellow-400 bg-yellow-400 px-4 py-3 text-sm font-extrabold text-blue-950 shadow-sm transition hover:bg-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-950">
      <MapPinned className="h-4 w-4" aria-hidden /> Indicazioni Google Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}
