"use client";

export default function FotoScheda({ query, alt }: { query: string; alt: string }) {
  const fotoUrl = (value: string) =>
    `https://loremflickr.com/960/540/${encodeURIComponent(value)}`;
  const fallback = "https://mycity.s3.sbg.io.cloud.ovh.net/4222084/PROTOCONVENTO-FRANCESCANO.jpg";

  return (
    <div className="relative h-44 w-full overflow-hidden bg-slate-200">
      <img
        src={fotoUrl(query)}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        onError={(event) => {
          if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
        }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/25 via-transparent to-transparent" />
    </div>
  );
}
