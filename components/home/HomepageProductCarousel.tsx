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

const PRODOTTI_PER_PAGINA = 4;

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
  const touchStart = useRef<{ x: number; y: number } | null>(null);

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
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    if (deltaX < 0) setPagina((current) => Math.min(numeroPagine - 1, current + 1));
    else setPagina((current) => Math.max(0, current - 1));
  }
  const numeroPagine = Math.max(1, Math.ceil(prodotti.length / PRODOTTI_PER_PAGINA));
  const paginaSicura = Math.min(pagina, numeroPagine - 1);
  const prodottiVisibili = prodotti.slice(
    paginaSicura * PRODOTTI_PER_PAGINA,
    paginaSicura * PRODOTTI_PER_PAGINA + PRODOTTI_PER_PAGINA
  );

  useEffect(() => {
    if (pagina > numeroPagine - 1) setPagina(Math.max(0, numeroPagine - 1));
  }, [pagina, numeroPagine]);

  if (prodotti.length === 0) return null;

  return (
    <div className="min-w-0" onTouchStart={onCarouselTouchStart} onTouchEnd={onCarouselTouchEnd}>
      <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
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

      {mostraTutti && numeroPagine > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagina((corrente) => Math.max(0, corrente - 1))}
              disabled={paginaSicura === 0}
              aria-label="Mostra i quattro prodotti precedenti"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-blue-900 shadow-sm transition hover:border-yellow-400 hover:bg-yellow-50 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setPagina((corrente) => Math.min(numeroPagine - 1, corrente + 1))}
              disabled={paginaSicura >= numeroPagine - 1}
              aria-label="Mostra i quattro prodotti successivi"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-yellow-400 text-blue-950 shadow-sm transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
