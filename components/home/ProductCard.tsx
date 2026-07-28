// Roadmap — Componente previsto per la home con prodotti in evidenza
import Link from "next/link";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";

type ProductCardProps = {
  id: string;
  nome: string;
  prezzo: number;
  categoria?: string | null;
  negozio_nome: string;
  negozio_id: string;
  immagine_principale?: string | null;
};

export default function ProductCard({
  id,
  nome,
  prezzo,
  negozio_nome,
  negozio_id,
  immagine_principale,
  categoria,
}: ProductCardProps) {
  const imageUrl = getProdottoImmagine({ immagine_principale, categoria });

  return (
    <Link
      href={`/prodotto/${id}`}
      className="group overflow-hidden rounded-xl border border-slate-100 bg-white transition hover:border-blue-200 hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        <div
          role="img"
          aria-label={nome}
          className="h-full w-full bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
      </div>
      <div className="p-2">
        <h3 className="line-clamp-2 text-xs font-bold leading-tight text-slate-900">
          {nome}
        </h3>
        <p className="mt-0.5 text-sm font-black text-blue-700">
          €{prezzo}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">
          {negozio_nome}
        </p>
      </div>
    </Link>
  );
}
