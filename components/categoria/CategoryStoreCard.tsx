import Link from "next/link";
import { ArrowRight, PackageOpen, Store } from "lucide-react";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import type { NegozioCategoria } from "@/lib/negozi";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";

type Props = {
  negozio: NegozioCategoria;
  /** Stato iniziale del cuore calcolato dal server (opzionale). */
  preferitoAttivo?: boolean;
  autenticato?: boolean;
};

export default function CategoryStoreCard({ negozio, preferitoAttivo, autenticato }: Props) {
  const logoFallback = getNegozioCardImmagine({
    logo_url: negozio.logo_url,
    categoria: negozio.categoria,
  });

  // Copertina: se presente un'immagine valida usala, altrimenti fallback
  // sul placeholder di categoria (stesso helper usato nel resto del sito).
  const copertina =
    negozio.copertina_url && negozio.copertina_url.trim()
      ? negozio.copertina_url.trim()
      : logoFallback;

  const haProdotti = negozio.prodotti_attivi > 0;
  const hrefNegozio = `/negozio/${negozio.slug}`;
  const mostraPreferiti =
    preferitoAttivo !== undefined && autenticato !== undefined;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link
        href={hrefNegozio}
        className="flex flex-1 flex-col"
      >
        {/* Copertina */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
          <div
            role="img"
            aria-label={negozio.nome}
            className="h-full w-full bg-cover bg-center transition duration-300 group-hover:scale-105"
            style={{ backgroundImage: `url(${copertina})` }}
          />
          {/* Logo in sovrapposizione */}
          <div className="absolute bottom-3 left-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-white shadow-sm">
            <div
              role="img"
              aria-label={`Logo ${negozio.nome}`}
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${logoFallback})` }}
            />
          </div>
        </div>

        {/* Corpo */}
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div>
            <h3 className="line-clamp-1 text-sm font-black tracking-tight text-slate-900 transition group-hover:text-blue-700">
              {negozio.nome}
            </h3>
            {negozio.categoria && (
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">
                {negozio.categoria}
              </p>
            )}
          </div>

          {negozio.descrizione ? (
            <p className="line-clamp-2 text-xs leading-5 text-slate-500">{negozio.descrizione}</p>
          ) : (
            <p className="text-xs italic leading-5 text-slate-300">Nessuna descrizione disponibile.</p>
          )}

          {/* Conteggio prodotti */}
          <p className="mt-auto flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <PackageOpen className="h-3.5 w-3.5 text-slate-400" />
            {negozio.prodotti_attivi === 1
              ? "1 prodotto attivo"
              : `${negozio.prodotti_attivi} prodotti attivi`}
          </p>

          {/* Pulsante */}
          {haProdotti ? (
            <span className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition group-hover:bg-blue-700">
              Entra nel negozio
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span
              aria-disabled="true"
              className="mt-1 inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-400"
            >
              <Store className="h-3.5 w-3.5" />
              Prodotti in arrivo
            </span>
          )}
        </div>
      </Link>

      {mostraPreferiti && (
        <FavoritoButton
          tipo="negozio"
          riferimentoId={negozio.id}
          attivo={preferitoAttivo}
          autenticato={autenticato}
          className="absolute right-2 top-2 z-10"
          label={negozio.nome}
        />
      )}
    </div>
  );
}
