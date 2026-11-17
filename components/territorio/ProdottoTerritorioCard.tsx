import Link from "next/link";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import ProdottoImmagine from "@/components/home/ProdottoImmagine";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";

type ProdottoTerritorioCardProps = {
  id: string;
  slug: string;
  nome: string;
  prezzo: number;
  descrizione?: string | null;
  categoria?: string | null;
  immagine_principale?: string | null;
  haVarianti?: boolean;
  preferitoAttivo?: boolean;
  autenticato?: boolean;
};

/**
 * Card prodotto delle pagine territorio.
 *
 * Stessa fonte immagine e stesso motore preferiti delle altre vetrine
 * (lib/prodotti-immagini.ts, FavoritoButton), ma impaginazione verticale
 * pulita: foto, nome, descrizione, prezzo e CTA verde verso la scheda
 * prodotto, dove si sceglie la variante e si aggiunge al carrello.
 */
export default function ProdottoTerritorioCard({
  id,
  slug,
  nome,
  prezzo,
  descrizione,
  categoria,
  immagine_principale,
  haVarianti,
  preferitoAttivo,
  autenticato,
}: ProdottoTerritorioCardProps) {
  const imageUrl = getProdottoImmagine({ immagine_principale, categoria });
  const mostraPreferiti = preferitoAttivo !== undefined && autenticato !== undefined;
  const prezzoFormattato = Number.isFinite(prezzo) ? prezzo.toFixed(2) : String(prezzo);

  return (
    <div className="group relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 transition hover:shadow-md">
      <Link href={`/prodotto/${slug}`} className="flex min-h-0 flex-1 flex-col p-3">
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-[#f5f2ea]">
          <ProdottoImmagine
            src={imageUrl}
            alt={nome}
            categoria={categoria ?? null}
            className="transition duration-300 group-hover:scale-[1.03]"
          />
        </div>

        <h3 className="mt-3 line-clamp-2 text-sm font-bold leading-5 text-slate-900">
          {nome}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-slate-500">
          {descrizione?.trim() ? descrizione : <span aria-hidden="true">&nbsp;</span>}
        </p>
        <p className="mt-2 text-sm font-black text-slate-900">
          {haVarianti ? "Da " : ""}&euro; {prezzoFormattato}
        </p>
      </Link>

      <Link
        href={`/prodotto/${slug}`}
        className="mx-3 mb-3 inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[#1f6b45] px-3 text-xs font-bold text-white transition hover:bg-[#175439] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f6b45] focus-visible:ring-offset-2"
        aria-label={`Aggiungi al carrello: ${nome}`}
      >
        Aggiungi al carrello
      </Link>

      {mostraPreferiti && (
        <FavoritoButton
          tipo="prodotto"
          riferimentoId={id}
          attivo={preferitoAttivo}
          autenticato={autenticato}
          className="absolute right-4 top-4 z-10"
          label={nome}
        />
      )}
    </div>
  );
}
