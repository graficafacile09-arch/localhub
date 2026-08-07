import Image from "next/image";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import type { Categoria } from "@/types/negozio";

// Icona di fallback per le categorie senza mappatura specifica.
export const ICONE_CATEGORIE: Record<string, string> = {
  panificio: "/icons/food.png",
  ristorante: "/icons/food.png",
  bar: "/icons/food.png",
  pizzeria: "/icons/food.png",
  beauty: "/icons/services.png",
  salute: "/icons/services.png",
  farmacia: "/icons/services.png",
  elettricista: "/icons/services.png",
  idraulico: "/icons/services.png",
  falegname: "/icons/services.png",
  abbigliamento: "/icons/fashion.png",
  calzature: "/icons/fashion.png",
  gioielleria: "/icons/fashion.png",
};

// Palette cicliche per mantenere lo stesso aspetto delle tile originali.
export const STILI_TILE = [
  { box: "group-hover:from-blue-50 group-hover:to-blue-100", text: "text-slate-700 group-hover:text-blue-600" },
  { box: "group-hover:from-orange-50 group-hover:to-orange-100", text: "text-slate-700 group-hover:text-orange-500" },
  { box: "group-hover:from-fuchsia-50 group-hover:to-fuchsia-100", text: "text-slate-700 group-hover:text-fuchsia-500" },
  { box: "group-hover:from-slate-100 group-hover:to-slate-200", text: "text-slate-700 group-hover:text-slate-600" },
];

const TILE_CLASS =
  "group flex flex-col items-center gap-2 rounded-xl bg-white p-3 md:p-4 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 ring-1 ring-slate-100";

export default function CategoryTile({
  categoria,
  index,
  count,
}: {
  categoria: Categoria;
  index: number;
  count?: number;
}) {
  const stile = STILI_TILE[index % STILI_TILE.length];
  const icona = ICONE_CATEGORIE[categoria.slug] ?? "/icons/store.png";

  return (
    <Link
      href={`/categorie/${categoria.slug}`}
      className={TILE_CLASS}
    >
      <div
        className={`flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 transition-all duration-200 ${stile.box} group-hover:scale-110`}
      >
        <Image src={icona} alt="" width={24} height={24} className="md:w-7 md:h-7" />
      </div>
      <span className={`text-[11px] md:text-xs font-semibold transition-colors ${stile.text}`}>
        {categoria.nome}
      </span>
      {typeof count === "number" && (
        <span className="-mt-1 text-[10px] font-medium text-slate-400">
          {count === 1 ? "1 negozio" : `${count} negozi`}
        </span>
      )}
    </Link>
  );
}

export function TutteCategorieTile({ index = 0 }: { index?: number }) {
  const stile = STILI_TILE[index % STILI_TILE.length];

  return (
    <Link href="/categorie" className={TILE_CLASS}>
      <div
        className={`flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 transition-all duration-200 ${stile.box} group-hover:scale-110`}
      >
        <LayoutGrid className="h-5 w-5 text-slate-500 transition-colors group-hover:text-blue-600 md:h-6 md:w-6" />
      </div>
      <span className={`text-[11px] md:text-xs font-semibold transition-colors ${stile.text}`}>
        Tutte le categorie
      </span>
    </Link>
  );
}
