// Roadmap — Componente previsto per la home con prodotti in evidenza
import Link from "next/link";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";

type ProductCardProps = {
  id: string;
  slug: string;
  nome: string;
  prezzo: number;
  categoria?: string | null;
  negozio_nome: string;
  negozio_id: string;
  immagine_principale?: string | null;
  /** Stato iniziale del cuore calcolato dal server (opzionale). */
  preferitoAttivo?: boolean;
  autenticato?: boolean;
};

export default function ProductCard({
  id,
  slug,
  nome,
  prezzo,
  negozio_nome,
  negozio_id,
  immagine_principale,
  categoria,
  preferitoAttivo,
  autenticato,
}: ProductCardProps) {
  const imageUrl = getProdottoImmagine({ immagine_principale, categoria });
  const mostraPreferiti = preferitoAttivo !== undefined && autenticato !== undefined;

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-100 bg-white transition hover:border-blue-200 hover:shadow-sm">
      <Link
        href={`/prodotto/${slug}`}
        className="group block"
      >
        <div className="relative aspect-square overflow-hidden bg-slate-100">
          <div
            role="img"
            aria-label={nome}
            className="h-full w-full bg-cover bg-center"
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

      {mostraPreferiti && (
        <FavoritoButton
          tipo="prodotto"
          riferimentoId={id}
          attivo={preferitoAttivo}
          autenticato={autenticato}
          className="absolute right-2 top-2 z-10"
          label={nome}
        />
      )}
    </div>
  );
}
