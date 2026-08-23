import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import type { Categoria } from "@/types/negozio";
import { stileCategoria } from "@/lib/categorie-icone";

// UNICO design system per le categorie: usato identico in homepage e in
// /categorie. L'icona e i colori arrivano dalla FONTE UNICA
// lib/categorie-icone.ts (stileCategoria(slug)): nessun elenco icone
// duplicato in questo componente.
const CARD_CLASS =
  "group flex min-h-[108px] flex-col items-center justify-center gap-3 rounded-2xl border-0 bg-white px-3 py-5 text-center shadow-[0_2px_10px_rgba(0,0,0,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.10)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 sm:min-h-[112px] md:min-h-[122px] md:px-4 md:py-6";

const NOME_CLASS =
  "block break-words text-sm font-medium leading-tight text-slate-700 transition-colors group-hover:text-slate-900";

export default function CategoryTile({
  categoria,
  index,
  count,
}: {
  categoria: Categoria;
  index: number;
  count?: number;
}) {
  const stile = stileCategoria(categoria.slug);
  const Icona = stile.icona;
  const SecondaIcona = stile.icona2;

  return (
    <Link
      href={`/categorie/${categoria.slug}`}
      className={CARD_CLASS}
    >
      <span className="flex h-14 w-14 items-center justify-center transition duration-200 group-hover:scale-105 md:h-16 md:w-16">
        {SecondaIcona ? (
          <span
            className="flex items-center gap-[3px] text-yellow-500 group-hover:text-yellow-600"
            aria-hidden
          >
            <Icona className="h-6 w-6 md:h-7 md:w-7" strokeWidth={1.75} />
            <SecondaIcona className="h-6 w-6 md:h-7 md:w-7" strokeWidth={1.75} />
          </span>
        ) : (
          <Icona
            className="h-7 w-7 text-yellow-500 group-hover:text-yellow-600 md:h-8 md:w-8"
            strokeWidth={1.75}
            aria-hidden
          />
        )}
      </span>
      <span className="min-w-0 text-center">
        <span className={NOME_CLASS}>{categoria.nome}</span>
        {typeof count === "number" && (
          <span className="mt-1 block text-[9px] font-medium text-slate-400 md:text-[10px]">
            {count === 1 ? "1 negozio" : `${count} negozi`}
          </span>
        )}
      </span>
    </Link>
  );
}

export function TutteCategorieTile({ index = 0 }: { index?: number }) {
  return (
    <Link href="/categorie" className={CARD_CLASS}>
      <span className="flex h-14 w-14 items-center justify-center transition duration-200 group-hover:scale-105 md:h-16 md:w-16">
        <LayoutGrid
          className="h-7 w-7 text-yellow-500 group-hover:text-yellow-600 md:h-8 md:w-8"
          strokeWidth={1.75}
          aria-hidden
        />
      </span>
      <span className="min-w-0 text-center">
        <span className={NOME_CLASS}>Tutte le categorie</span>
      </span>
    </Link>
  );
}
