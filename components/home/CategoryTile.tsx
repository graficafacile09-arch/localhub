import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import type { Categoria } from "@/types/negozio";
import { stileCategoria } from "@/lib/categorie-icone";

// Card pulita senza immagini: simbolo colorato + nome ben leggibile.
// L'icona e i colori arrivano dalla FONTE UNICA lib/categorie-icone.ts
// (stileCategoria(slug)): nessun elenco icone duplicato in questo componente.
const CARD_CLASS =
  "group flex flex-col items-center gap-2 rounded-2xl bg-white p-3.5 ring-1 ring-slate-100 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md md:p-4";

const NOME_CLASS =
  "block text-[11px] font-semibold text-slate-700 transition-colors group-hover:text-blue-600 md:text-xs";

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
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110 md:h-11 md:w-11 ${stile.bg}`}
      >
        {SecondaIcona ? (
          <span className={`flex items-center gap-[2px] ${stile.text}`} aria-hidden>
            <Icona className="h-[18px] w-[18px] md:h-5 md:w-5" />
            <SecondaIcona className="h-[18px] w-[18px] md:h-5 md:w-5" />
          </span>
        ) : (
          <Icona className={`h-5 w-5 md:h-[22px] md:w-[22px] ${stile.text}`} aria-hidden />
        )}
      </span>
      <span className="text-center">
        <span className={NOME_CLASS}>
          {categoria.nome}
        </span>
        {typeof count === "number" && (
          <span className="block text-[9px] font-medium text-slate-400 md:text-[10px]">
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
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 transition-transform duration-200 group-hover:scale-110 md:h-11 md:w-11">
        <LayoutGrid className="h-5 w-5 text-blue-600 md:h-[22px] md:w-[22px]" aria-hidden />
      </span>
      <span className="text-center">
        <span className={NOME_CLASS}>
          Tutte le categorie
        </span>
      </span>
    </Link>
  );
}
