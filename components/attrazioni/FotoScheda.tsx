"use client";

import { useEffect, useRef, useState } from "react";

type PhotoResult = { photoUrl?: string; attribution?: { name: string; url?: string }[] };

export default function FotoScheda({ query, alt }: { query: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState<PhotoResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const node = host.current;
    if (!node || loaded) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setLoaded(true);
      fetch(`/api/attrazioni/foto?query=${encodeURIComponent(query)}`)
        .then((response) => response.ok ? response.json() : null)
        .then((data) => { if (data?.photoUrl) setPhoto(data); })
        .catch(() => {});
    }, { rootMargin: "180px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [query, loaded]);

  return (
    <div ref={host} className="relative h-24 w-full overflow-hidden bg-slate-200">
      {photo?.photoUrl ? (
        <>
          <img src={photo.photoUrl} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          <div className="absolute bottom-0 right-0 max-w-full truncate bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer" className="underline">Google Maps</a>{photo.attribution?.length ? " · " : ""}
            {(photo.attribution ?? []).map((author, index) => (
              <span key={author.url ?? author.name}>
                {index > 0 ? ", " : ""}
                {author.url ? <a href={author.url} target="_blank" rel="noopener noreferrer" className="underline">{author.name}</a> : author.name}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center">
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer" className="px-3 text-center text-xs font-semibold text-slate-600 underline underline-offset-2">
            {loaded ? "Foto non disponibile · apri Google Maps" : "Foto da Google Maps"}
          </a>
        </div>
      )}
    </div>
  );
}
