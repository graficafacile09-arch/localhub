"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  const [pagina, setPagina] = useState(0);
  const [prodottiPerPagina, setProdottiPerPagina] = useState(4);
  const [animazionePagina, setAnimazionePagina] = useState<"fermo" | "uscita">("fermo");
  const timerTransizione = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (timerTransizione.current) clearTimeout(timerTransizione.current);
    };
  }, []);

  function cambiaPagina(destinazione: number) {
    const destinazioneSicura = Math.max(0, Math.min(numeroPagine - 1, destinazione));
    if (destinazioneSicura === paginaSicura) return;
    if (timerTransizione.current) clearTimeout(timerTransizione.current);
    setAnimazionePagina("uscita");
    timerTransizione.current = setTimeout(() => {
      setPagina(destinazioneSicura);
      setAnimazionePagina("fermo");
      timerTransizione.current = null;
    }, 160);
  }

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const aggiornaDimensione = () => {
      setProdottiPerPagina(media.matches ? 2 : 4);
      setPagina(0);
    };
    aggiornaDimensione();
    media.addEventListener("change", aggiornaDimensione);
    return () => media.removeEventListener("change", aggiornaDimensione);
  }, []);

  function onCarouselTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onCarouselTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch || numeroPagine < 2) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
    if (deltaX < 0) cambiaPagina(paginaSicura + 1);
    else cambiaPagina(paginaSicura - 1);
  }
  const numeroPagine = Math.max(1, Math.ceil(prodotti.length / prodottiPerPagina));
  const paginaSicura = Math.min(pagina, numeroPagine - 1);
  const prodottiVisibili = prodotti.slice(
    paginaSicura * prodottiPerPagina,
    paginaSicura * prodottiPerPagina + prodottiPerPagina
  );

  useEffect(() => {
    if (pagina > numeroPagine - 1) setPagina(Math.max(0, numeroPagine - 1));
  }, [pagina, numeroPagine]);

  if (prodotti.length === 0) return null;

  return (
    <div className="min-w-0 touch-pan-y" onTouchStart={onCarouselTouchStart} onTouchEnd={onCarouselTouchEnd}>
      <div className="group/carousel relative">
        <div className={`grid min-w-0 grid-cols-2 gap-2.5 transition-[opacity,transform] duration-300 ease-in-out sm:gap-3 lg:grid-cols-4 ${animazionePagina === "uscita" ? "translate-x-2 opacity-0" : "translate-x-0 opacity-100"}`}>
          {prodottiVisibili.map((prodotto) => {
            const prodottoId = String(prodotto.id);
            return (
              <ProductCard
                key={prodottoId}
                id={prodottoId}
                slug={(prodotto.slug as string) ?? prodottoId}
                nome={prodotto.nome as string}
                prezzo={prodotto.prezzo as number}
                categoria={(prodotto.categoria as string) ?? null}
                negozio_nome={(prodotto.negozio_nome as string) ?? ""}
                negozio_id={String(prodotto.negozio_id ?? "")}
                immagine_principale={(prodotto.immagine_principale as string) ?? null}
                haVarianti={Boolean(prodotto.ha_varianti)}
                {...(prodottoTipico ? { prodottoTipico: true } : {})}
                compatto={compatto}
                preferitoAttivo={statoPreferiti.chiavi.has(
                  chiavePreferito("prodotto", prodottoId)
                )}
                autenticato={statoPreferiti.autenticato}
              />
            );
          })}
        </div>

        {numeroPagine > 1 && (
          <>
            <button
              type="button"
              onClick={() => cambiaPagina(paginaSicura - 1)}
              disabled={paginaSicura === 0}
              aria-label="Mostra i quattro prodotti precedenti"
              className="absolute left-1 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-slate-700 shadow-md transition-opacity hover:bg-white disabled:opacity-40 md:opacity-0 md:group-hover/carousel:opacity-100 md:group-focus-within/carousel:opacity-100"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => cambiaPagina(paginaSicura + 1)}
              disabled={paginaSicura >= numeroPagine - 1}
              aria-label="Mostra i quattro prodotti successivi"
              className="absolute right-1 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-slate-700 shadow-md transition-opacity hover:bg-white disabled:opacity-40 md:opacity-0 md:group-hover/carousel:opacity-100 md:group-focus-within/carousel:opacity-100"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </>
        )}
      </div>

      {numeroPagine > 1 && (
        <div className="mt-2 flex items-center justify-end gap-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => cambiaPagina(paginaSicura - 1)}
              disabled={paginaSicura === 0}
              aria-label="Mostra i quattro prodotti precedenti"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => cambiaPagina(paginaSicura + 1)}
              disabled={paginaSicura >= numeroPagine - 1}
              aria-label="Mostra i quattro prodotti successivi"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
