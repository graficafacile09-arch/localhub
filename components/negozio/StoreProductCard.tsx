import Link from "next/link";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";

type Props = {
  slug: string;
  nome: string;
  descrizione: string | null;
  prezzo: number;
  categoria: string | null;
  immagine_principale: string | null;
  /** id reale del prodotto (bigint come stringa) per il pulsante preferiti. */
  id?: string;
  /** Stato iniziale del cuore calcolato dal server (opzionale). */
  preferitoAttivo?: boolean;
  autenticato?: boolean;
  /** Badge "Esaurito" (disponibilità reale <= 0). */
  esaurito?: boolean;
  /** True se il prodotto ha varianti attive (prezzo "Da €"). */
  haVarianti?: boolean;
};

export default function StoreProductCard({
  slug,
  nome,
  descrizione,
  prezzo,
  categoria,
  immagine_principale,
  id,
  preferitoAttivo,
  autenticato,
  esaurito,
  haVarianti,
}: Props) {
  const imageUrl = getProdottoImmagine({ immagine_principale, categoria });
  const mostraPreferiti = id != null && preferitoAttivo !== undefined && autenticato !== undefined;

  return (
    <div className="incitta-product-card relative">
      <Link
        href={`/prodotto/${slug}`}
        className="group block"
      >
        <div className="relative aspect-square overflow-hidden bg-slate-100">
          <div
            role="img"
            aria-label={nome}
            className="h-full w-full bg-cover bg-center transition group-hover:scale-105"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
          {esaurito && (
            <span className="absolute inset-x-0 bottom-0 bg-blue-600/90 py-1 text-center text-[9px] font-black uppercase tracking-wider text-white">
              Esaurito
            </span>
          )}
        </div>
        <div className="incitta-product-card-body border-l-4 border-blue-700 p-3">
          <h3 className="truncate text-xs font-bold text-slate-900">{nome}</h3>
          {descrizione && <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-slate-400">{descrizione}</p>}
          <p className="mt-2 inline-flex rounded-lg border border-yellow-200 bg-yellow-50 px-2.5 py-1.5 text-xs font-black text-blue-800">
            {haVarianti ? "Da " : ""}&euro; {prezzo.toFixed(2)}
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
