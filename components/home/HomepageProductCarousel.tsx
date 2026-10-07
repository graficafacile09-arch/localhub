"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import ProductCard from "@/components/home/ProductCard";

const chiavePreferito = (tipo: string, riferimentoId: string) =>
  `${tipo}:${riferimentoId}`;

type ProdottoRecord = Record<string, unknown>;

type StatoPreferiti = {
  autenticato: boolean;
  chiavi: Set<string>;
};

export default function HomepageProductCarousel({
  prodotti,
  statoPreferiti,
  prodottoTipico = false,
  compatto = false,
  mostraTutti = false,
}: {
  prodotti: ProdottoRecord[];
  statoPreferiti: StatoPreferiti;
  prodottoTipico?: boolean;
  compatto?: boolean;
  mostraTutti?: boolean;
}) {
  const [espanso, setEspanso] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(prodotti.length > 4);
  const viewportRef = useRef<HTMLDivElement>(null);

  const visibili = mostraTutti && !espanso ? prodotti.slice(0, 4) : prodotti;

  const aggiornaFrecce = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;

    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const haScorrimento = el.scrollWidth > el.clientWidth + 2;

    setCanScrollLeft(desktop && haScorrimento && el.scrollLeft > 2);
    setCanScrollRight(
      haScorrimento &&
        (desktop ? prodotti.length > 4 : prodotti.length > 2) &&
        el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    );
  }, [prodotti.length]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    aggiornaFrecce();
    el.addEventListener("scroll", aggiornaFrecce, { passive: true });
    window.addEventListener("resize", aggiornaFrecce);

    return () => {
      el.removeEventListener("scroll", aggiornaFrecce);
      window.removeEventListener("resize", aggiornaFrecce);
    };
  }, [aggiornaFrecce, visibili.length]);

  const scorri = (direzione: "sinistra" | "destra") => {
    const el = viewportRef.current;
    if (!el) return;

    el.scrollBy({
      left: direzione === "destra" ? el.clientWidth : -el.clientWidth,
      behavior: "smooth",
    });
  };

  return (
    <div>
      <div className="relative md:px-10">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scorri("sinistra")}
            aria-label="Mostra i prodotti precedenti"
            className="absolute left-0 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-yellow-300 bg-yellow-400 text-blue-900 shadow-md transition hover:bg-yellow-300 md:flex"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {prodotti.length > 2 && (
          <button
            type="button"
            onClick={() => scorri("destra")}
            aria-label="Mostra altri prodotti"
            disabled={!canScrollRight}
            className="absolute right-0.5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-yellow-300 bg-yellow-400 text-blue-900 shadow-md transition hover:bg-yellow-300 disabled:pointer-events-none disabled:opacity-30 md:right-0 md:hidden"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {prodotti.length > 4 && (
          <button
            type="button"
            onClick={() => scorri("destra")}
            aria-label="Mostra altri prodotti"
            disabled={!canScrollRight}
            className="absolute right-0 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-yellow-300 bg-yellow-400 text-blue-900 shadow-md transition hover:bg-yellow-300 disabled:pointer-events-none disabled:opacity-30 md:flex"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        <div
          ref={viewportRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:gap-5"
          aria-label="Galleria prodotti"
        >
          {visibili.map((prodotto) => {
            const prodottoId = String(prodotto.id);

            return (
              <div
                key={prodottoId}
                className="w-[calc((100%_-_0.75rem)_/_2)] min-w-[calc((100%_-_0.75rem)_/_2)] shrink-0 snap-start md:w-[calc((100%_-_3.75rem)_/_4)] md:min-w-[calc((100%_-_3.75rem)_/_4)]"
              >
                <ProductCard
                  id={prodottoId}
                  slug={(prodotto.slug as string) ?? prodottoId}
                  nome={prodotto.nome as string}
                  prezzo={prodotto.prezzo as number}
                  categoria={(prodotto.categoria as string) ?? null}
                  negozio_nome={(prodotto.negozio_nome as string) ?? ""}
                  negozio_id={String(prodotto.negozio_id ?? "")}
                  immagine_principale={
                    (prodotto.immagine_principale as string) ?? null
                  }
                  haVarianti={Boolean(prodotto.ha_varianti)}
                  {...(prodottoTipico ? { prodottoTipico: true } : {})}
                  {...(compatto ? { compatto: true } : {})}
                  preferitoAttivo={statoPreferiti.chiavi.has(
                    chiavePreferito("prodotto", prodottoId)
                  )}
                  autenticato={statoPreferiti.autenticato}
                />
              </div>
            );
          })}
        </div>
      </div>

      {mostraTutti && prodotti.length > 4 && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setEspanso((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-6 py-2.5 text-sm font-black text-blue-900 shadow-sm transition hover:bg-yellow-300 active:scale-95"
          >
            {espanso ? (
              <>
                Mostra meno
                <ChevronUp className="h-4 w-4" aria-hidden />
              </>
            ) : (
              <>
                Mostra tutto
                <ChevronDown className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
