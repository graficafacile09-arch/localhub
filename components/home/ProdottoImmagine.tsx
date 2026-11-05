"use client";

// Le foto dei prodotti arrivano da host arbitrari (non solo quelli elencati in
// next.config images.remotePatterns), quindi si usa <img> con fallback proprio.
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";

type ProdottoImmagineProps = {
  /** URL già risolto con getProdottoImmagine. */
  src: string;
  /** Nome del prodotto: è l'alt dell'immagine e il testo della scheda di riserva. */
  alt: string;
  categoria?: string | null;
  /** true = immagine intera (prodotti tipici), false = riempimento della card. */
  contenuta?: boolean;
  className?: string;
};

/**
 * Immagine della card prodotto con due reti di sicurezza:
 * 1. se l'URL specifico non risponde si passa all'immagine generica della
 *    categoria (stessa mappa di getProdottoImmagine);
 * 2. se anche quella fallisce, al posto del buco bianco compare una scheda
 *    neutra con il nome del prodotto.
 * Finché l'immagine non è pronta resta visibile un placeholder sfumato, così
 * la vetrina non mostra mai uno spazio vuoto.
 */
export default function ProdottoImmagine({
  src,
  alt,
  categoria = null,
  contenuta = false,
  className,
}: ProdottoImmagineProps) {
  const immagineRiserva = getProdottoImmagine({
    immagine_principale: null,
    categoria,
  });
  // La card è montata per prodotto (key = id): la sorgente non cambia durante
  // la vita del componente, quindi lo stato di caricamento è per-card.
  const [corrente, setCorrente] = useState(src);
  const [caricata, setCaricata] = useState(false);
  const [nonDisponibile, setNonDisponibile] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Immagine già in cache: l'evento onLoad può essere già passato, quindi si
  // controlla lo stato reale dell'elemento invece di aspettarlo.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) setCaricata(true);
  }, [corrente]);

  const gestisciErrore = () => {
    if (corrente !== immagineRiserva) {
      setCorrente(immagineRiserva);
      return;
    }
    setNonDisponibile(true);
  };

  return (
    <div className="absolute inset-0">
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 transition-opacity duration-300 ${
          caricata ? "opacity-0" : "opacity-100 animate-pulse"
        }`}
      />
      {nonDisponibile ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
          <ImageOff className="h-5 w-5 text-slate-400" aria-hidden />
          <span className="line-clamp-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {alt}
          </span>
        </div>
      ) : (
        <img
          ref={imgRef}
          src={corrente}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setCaricata(true)}
          onError={gestisciErrore}
          className={`absolute inset-0 h-full w-full ${
            contenuta ? "object-contain" : "object-cover"
          } transition-opacity duration-300 ${
            caricata ? "opacity-100" : "opacity-0"
          } ${className ?? ""}`}
        />
      )}
    </div>
  );
}
