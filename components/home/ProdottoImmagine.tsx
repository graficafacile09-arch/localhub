"use client";

// Le foto dei prodotti possono arrivare da host arbitrari (non solo quelli
// elencati in next.config images.remotePatterns): per gli host configurati si
// usa next/image (resize + cache immutabile), per gli altri <img> con fallback.

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { puoUsareNextImage } from "@/lib/immagini-remote";

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

// Larghezze delle card prodotto: 2 colonne su mobile, 3/4 nelle vetrine larghe.
const SIZES = "(max-width: 639px) 46vw, (max-width: 1023px) 30vw, 24vw";

/**
 * Immagine della card prodotto con due reti di sicurezza:
 * 1. se l'URL specifico non risponde si passa all'immagine generica della
 *    categoria (stessa mappa di getProdottoImmagine);
 * 2. se anche quella fallisce, al posto del buco bianco compare una scheda
 *    neutra con il nome del prodotto.
 * Il gradiente di sfondo resta dietro all'immagine: funge da placeholder
 * durante il caricamento senza nasconderla se l'evento onLoad non arriva
 * (immagine già in cache del browser).
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
  // la vita del componente.
  const [corrente, setCorrente] = useState(src);
  const [nonDisponibile, setNonDisponibile] = useState(false);

  const gestisciErrore = () => {
    if (corrente !== immagineRiserva) {
      setCorrente(immagineRiserva);
      return;
    }
    setNonDisponibile(true);
  };

  const forma = contenuta ? "object-contain" : "object-cover";

  return (
    <div className="absolute inset-0">
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200"
      />
      {nonDisponibile ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
          <ImageOff className="h-5 w-5 text-slate-400" aria-hidden />
          <span className="line-clamp-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {alt}
          </span>
        </div>
      ) : puoUsareNextImage(corrente) ? (
        <Image
          src={corrente}
          alt={alt}
          fill
          sizes={SIZES}
          loading="lazy"
          onError={gestisciErrore}
          className={`${forma} ${className ?? ""}`}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={corrente}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={gestisciErrore}
          className={`absolute inset-0 h-full w-full ${forma} ${className ?? ""}`}
        />
      )}
    </div>
  );
}
