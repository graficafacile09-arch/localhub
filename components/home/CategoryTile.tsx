import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import type { Categoria } from "@/types/negozio";
import { stileCategoria } from "@/lib/categorie-icone";

// Card pulita senza immagini: simbolo colorato + nome ben leggibile.
// L'icona e i colori arrivano dalla FONTE UNICA lib/categorie-icone.ts
// (stileCategoria(slug)): nessun elenco icone duplicato in questo componente.
const CARD_CLASS =
  "group flex flex-col items-center gap-2 rounded-2xl bg-white p-3.5 ring-1 ring-slate-100 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md md:p-4";

const CARD_HOMEPAGE_CLASS =
  "group flex min-h-[108px] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-2 py-3.5 text-center shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_10px_24px_-14px_rgba(37,99,235,0.55)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 sm:min-h-[112px] md:min-h-[122px] md:px-3 md:py-4";

const NOME_CLASS =
  "block text-[11px] font-semibold text-slate-700 transition-colors group-hover:text-blue-600 md:text-xs";

const NOME_HOMEPAGE_CLASS =
  "block break-words text-xs font-bold leading-tight text-slate-800 transition-colors group-hover:text-blue-700 sm:text-sm";

export default function CategoryTile({
  categoria,
  index,
  count,
  variant,
}: {
  categoria: Categoria;
  index: number;
  count?: number;
  variant?: "homepage";
}) {
  const stile = stileCategoria(categoria.slug);
  const Icona = stile.icona;
  const SecondaIcona = stile.icona2;

  return (
    <Link
      href={`/categorie/${categoria.slug}`}
      className={variant === "homepage" ? CARD_HOMEPAGE_CLASS : CARD_CLASS}
    >
      <span
        className={
          variant === "homepage"
            ? "flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-400 ring-1 ring-yellow-300 transition duration-200 group-hover:bg-yellow-300 group-hover:ring-yellow-200 group-hover:scale-105 md:h-14 md:w-14"
            : `flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110 md:h-11 md:w-11 ${stile.bg}`
        }
      >
        {SecondaIcona ? (
          <span
            className={`flex items-center gap-[2px] ${
              variant === "homepage" ? "text-blue-900 group-hover:text-blue-950" : stile.text
            }`}
            aria-hidden
          >
            <Icona className="h-[18px] w-[18px] md:h-5 md:w-5" />
            <SecondaIcona className="h-[18px] w-[18px] md:h-5 md:w-5" />
          </span>
        ) : (
          <Icona
            className={`h-5 w-5 md:h-[22px] md:w-[22px] ${
              variant === "homepage" ? "text-blue-900 group-hover:text-blue-950" : stile.text
            }`}
            aria-hidden
          />
        )}
      </span>
      <span className="min-w-0 text-center">
        <span className={variant === "homepage" ? NOME_HOMEPAGE_CLASS : NOME_CLASS}>
          {categoria.nome}
        </span>
        {typeof count === "number" && (
          <span className="mt-1 block text-[9px] font-medium text-slate-400 md:text-[10px]">
            {count === 1 ? "1 negozio" : `${count} negozi`}
          </span>
        )}
      </span>
    </Link>
  );
}

export function TutteCategorieTile({ index = 0, variant }: { index?: number; variant?: "homepage" }) {
  return (
    <Link href="/categorie" className={variant === "homepage" ? CARD_HOMEPAGE_CLASS : CARD_CLASS}>
      <span
        className={
          variant === "homepage"
            ? "flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-400 ring-1 ring-yellow-300 transition duration-200 group-hover:bg-yellow-300 group-hover:ring-yellow-200 group-hover:scale-105 md:h-14 md:w-14"
            : "flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 transition-transform duration-200 group-hover:scale-110 md:h-11 md:w-11"
        }
      >
        <LayoutGrid
          className={`h-5 w-5 md:h-[22px] md:w-[22px] ${
            variant === "homepage" ? "text-blue-900 group-hover:text-blue-950" : "text-blue-600"
          }`}
          aria-hidden
        />
      </span>
      <span className="min-w-0 text-center">
        <span className={variant === "homepage" ? NOME_HOMEPAGE_CLASS : NOME_CLASS}>
          Tutte le categorie
        </span>
      </span>
    </Link>
  );
}
