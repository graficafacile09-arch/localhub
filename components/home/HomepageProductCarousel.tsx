"use client";

import { useEffect, useState } from "react";
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

  const primoIndice = paginaSicura * PRODOTTI_PER_PAGINA + 1;
  const ultimoIndice = Math.min(
    paginaSicura * PRODOTTI_PER_PAGINA + prodottiVisibili.length,
    prodotti.length
  );

  return (
    <div className="min-w-0">
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
              compatto={compatto || true}
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
          <span className="text-xs font-medium text-slate-500" aria-live="polite">
            {primoIndice}–{ultimoIndice} di {prodotti.length} prodotti
          </span>
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
