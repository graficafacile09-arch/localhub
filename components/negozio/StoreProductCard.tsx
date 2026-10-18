import Link from "next/link";
import { Store } from "lucide-react";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";

type Props = {
  slug: string;
  nome: string;
  descrizione: string | null;
  negozio_nome?: string;
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
  negozio_nome = "",
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
    <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:border-yellow-300 hover:shadow-lg">
      <Link
        href={`/prodotto/${slug}`}
        className="group flex min-h-0 flex-1 flex-col"
      >
        <div className="relative aspect-square w-full shrink-0 overflow-hidden border-b border-slate-200 bg-slate-50">
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
        <div className="flex flex-1 flex-col border-l-4 border-blue-700 bg-slate-50">
          <div className="flex flex-1 flex-col p-3">
            <h3 className="h-10 shrink-0 overflow-hidden line-clamp-2 text-sm font-bold leading-5 text-slate-900">
              {nome}
            </h3>
            <p className="mt-1 h-8 shrink-0 overflow-hidden line-clamp-2 text-[11px] leading-4 text-slate-500">
              {descrizione?.trim() ? descrizione : <span aria-hidden="true">&nbsp;</span>}
            </p>
            <p className="mt-2 flex h-8 shrink-0 items-center">
              <span className="inline-flex h-7 items-center rounded-md border border-yellow-200 bg-yellow-50 px-2 text-xs font-black text-blue-700">
                {haVarianti ? "Da " : ""}&euro; {prezzo.toFixed(2)}
              </span>
            </p>
          </div>
          <div className="-ml-1 flex min-h-10 w-[calc(100%_+_4px)] shrink-0 items-center justify-center gap-1 bg-transparent px-2 py-1 text-center text-xs font-bold leading-4 text-blue-950">
            <Store className="h-3 w-3 shrink-0 text-yellow-700" aria-hidden />
            <span className="break-words">{negozio_nome.trim() || "\u00a0"}</span>
          </div>
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
