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
}: Props) {
  const imageUrl = getProdottoImmagine({ immagine_principale, categoria });
  const mostraPreferiti = id != null && preferitoAttivo !== undefined && autenticato !== undefined;

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-100 bg-white transition hover:border-blue-200 hover:shadow-sm">
      <Link
        href={`/prodotto/${slug}`}
        className="group block"
      >
        <div className="aspect-square overflow-hidden bg-slate-50">
          <div
            role="img"
            aria-label={nome}
            className="h-full w-full bg-cover bg-center transition group-hover:scale-105"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
        </div>
        <div className="p-2">
          <h3 className="truncate text-xs font-bold text-slate-900">{nome}</h3>
          {descrizione && <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-slate-400">{descrizione}</p>}
          <p className="mt-1 text-xs font-bold text-blue-600">&euro; {prezzo.toFixed(2)}</p>
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
