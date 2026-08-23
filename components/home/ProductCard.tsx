import Link from "next/link";
import { Store } from "lucide-react";
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
  /** True se il prodotto ha varianti attive (prezzo "Da €"). */
  haVarianti?: boolean;
};

/**
 * Card prodotto della homepage (prodotti in evidenza).
 * Stessa fonte immagine di StoreProductCard (lib/prodotti-immagini.ts),
 * stesso motore preferiti (FavoritoButton): nessuna logica duplicata.
 */
export default function ProductCard({
  id,
  slug,
  nome,
  prezzo,
  negozio_nome,
  immagine_principale,
  categoria,
  preferitoAttivo,
  autenticato,
  haVarianti,
}: ProductCardProps) {
  const imageUrl = getProdottoImmagine({ immagine_principale, categoria });
  const mostraPreferiti = preferitoAttivo !== undefined && autenticato !== undefined;
  const prezzoFormattato = Number.isFinite(prezzo) ? prezzo.toFixed(2) : String(prezzo);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <Link
        href={`/prodotto/${slug}`}
        className="block"
      >
        <div className="relative aspect-square overflow-hidden bg-slate-100">
          <div
            role="img"
            aria-label={nome}
            className="h-full w-full bg-cover bg-center transition duration-300 group-hover:scale-105"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
          {haVarianti && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-blue-900/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
              Da
            </span>
          )}
        </div>
        <div className="p-3 md:p-4">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 transition group-hover:text-blue-700">
            {nome}
          </h3>
          <p className="mt-1.5 text-base font-black text-blue-700">
            {haVarianti ? "Da " : ""}€{prezzoFormattato}
          </p>
          <p className="mt-1 flex items-center gap-1 line-clamp-1 text-[11px] text-slate-400">
            <Store className="h-3 w-3 shrink-0" aria-hidden />
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
          className="absolute right-2.5 top-2.5 z-10"
          label={nome}
        />
      )}
    </div>
  );
}
