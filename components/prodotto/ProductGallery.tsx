"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type GalleryImage = {
  id: string;
  url: string | null;
  role: "primary" | "gallery" | "detail";
  alt?: string | null;
};

type Props = {
  immagini: GalleryImage[];
  fallbackUrl: string;
  altText?: string | null;
  /** Nome del prodotto, usato come alt di fallback. */
  nomeProdotto?: string;
};

export default function ProductGallery({ immagini, fallbackUrl, altText, nomeProdotto }: Props) {
  const lista = useMemo(() => immagini.filter((img) => img.url), [immagini]);
  const primaria =
    lista.find((img) => img.role === "primary") ?? lista[0] ?? null;

  const [selezionata, setSelezionata] = useState<GalleryImage | null>(primaria);
  const [lightbox, setLightbox] = useState(false);

  // Se il prodotto non ha media, mostriamo solo l'immagine principale (come prima).
  useEffect(() => {
    setSelezionata(primaria);
  }, [primaria?.id, primaria?.url]);

  const altCorrente = (img: GalleryImage | null) =>
    img?.alt?.trim() || altText?.trim() || nomeProdotto || "Immagine prodotto";

  const chiudi = useCallback(() => setLightbox(false), []);
  const navega = useCallback((delta: number) => {
    setSelezionata((corrente) => {
      if (!corrente) return corrente;
      const idx = lista.findIndex((img) => img.id === corrente.id);
      if (idx === -1) return corrente;
      return lista[(idx + delta + lista.length) % lista.length];
    });
  }, [lista]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") chiudi();
      if (e.key === "ArrowLeft") navega(-1);
      if (e.key === "ArrowRight") navega(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, chiudi, navega]);

  const immagineAttiva = selezionata ?? (primaria ? primaria : null);

  return (
    <div>
      <div className="overflow-hidden rounded-xl">
        <div className="relative aspect-square max-h-[400px] overflow-hidden bg-slate-100">
          {immagineAttiva?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={immagineAttiva.url}
              alt={altCorrente(immagineAttiva)}
              className="h-full w-full cursor-zoom-in object-cover"
              onClick={() => setLightbox(true)}
            />
          ) : (
            <div
              role="img"
              aria-label={altCorrente(null)}
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${fallbackUrl})` }}
            />
          )}
        </div>
      </div>

      {lista.length > 1 && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {lista.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setSelezionata(img)}
              aria-label={`Mostra immagine ${altCorrente(img)}`}
              className={`overflow-hidden rounded-lg border-2 transition ${
                immagineAttiva?.id === img.id
                  ? "border-blue-600 ring-1 ring-blue-300"
                  : "border-transparent opacity-80 hover:opacity-100"
              }`}
            >
              {img.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.url} alt="" className="aspect-square w-full object-cover" />
              ) : null}
            </button>
          ))}
        </div>
      )}

      {lightbox && immagineAttiva?.url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Anteprima immagine"
          onClick={chiudi}
        >
          <button
            type="button"
            onClick={chiudi}
            aria-label="Chiudi"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>

          {lista.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navega(-1);
              }}
              aria-label="Immagine precedente"
              className="absolute left-3 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={immagineAttiva.url}
            alt={altCorrente(immagineAttiva)}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {lista.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navega(1);
              }}
              aria-label="Immagine successiva"
              className="absolute right-3 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
            {lista.findIndex((img) => img.id === immagineAttiva.id) + 1} / {lista.length}
          </p>
        </div>
      )}
    </div>
  );
}
