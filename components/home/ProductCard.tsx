import Link from "next/link";
import { ShoppingCart, Store } from "lucide-react";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";

type ProductCardProps = {
  id: string;
  slug: string;
  nome: string;
  prezzo: number;
  categoria?: string | null;
  descrizione?: string | null;
  negozio_nome: string;
  negozio_id: string;
  immagine_principale?: string | null;
  /** Stato iniziale del cuore calcolato dal server (opzionale). */
  preferitoAttivo?: boolean;
  autenticato?: boolean;
  /** True se il prodotto ha varianti attive (prezzo "Da €"). */
  haVarianti?: boolean;
  /** True se il prodotto appartiene alla vetrina "Prodotti tipici" (badge blu). */
  prodottoTipico?: boolean;
  /** True se il prodotto è in offerta (badge rosso "OFFERTA"). */
  prodottoInOfferta?: boolean;
  /** Badge di disponibilità reale. */
  esaurito?: boolean;
  /** Compatibilità con i vecchi chiamanti: le schede ora condividono le stesse dimensioni. */
  compatto?: boolean;
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
  prodottoTipico,
  prodottoInOfferta,
  descrizione,
  esaurito,
}: ProductCardProps) {
  const imageUrl = getProdottoImmagine({ immagine_principale, categoria });
  const mostraPreferiti = preferitoAttivo !== undefined && autenticato !== undefined;
  const prezzoFormattato = Number.isFinite(prezzo) ? prezzo.toFixed(2) : String(prezzo);

  return (
    <div className="group relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:border-yellow-300 hover:shadow-lg">
      <Link
        href={`/prodotto/${slug}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          className={`relative aspect-square w-full shrink-0 overflow-hidden border-b border-slate-200 ${prodottoTipico ? "bg-white" : "bg-slate-100"}`}
        >
          <div
            role="img"
            aria-label={nome}
            className={`h-full w-full ${
              prodottoTipico
                ? "bg-contain bg-center bg-no-repeat"
                : "bg-cover bg-center transition duration-300 group-hover:scale-105"
            }`}
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
          {prodottoTipico && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-blue-900/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
              {/* Su mobile la card è stretta: badge compatto per non sovrapporsi
                  al cuore preferiti. Da sm (griglia 3+ colonne) testo completo. */}
              <span className="sm:hidden">Tipico</span>
              <span className="hidden sm:inline">Prodotto tipico</span>
            </span>
          )}
          {prodottoInOfferta && (
            /* Stesso badge di "Tipico", stesso posizionamento e dimensioni,
                colore ROSSO per segnalare l'offerta. */
            <span className="absolute left-2.5 top-2.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm">
              Offerta
            </span>
          )}
          {haVarianti && !prodottoTipico && !prodottoInOfferta && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-blue-900/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
              Da
            </span>
          )}
          {esaurito && (
            <span className="absolute inset-x-0 bottom-0 bg-blue-600/90 py-1 text-center text-[9px] font-black uppercase tracking-wider text-white">
              Esaurito
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col border-l-4 border-blue-700 bg-slate-50 p-3">
          <h3 className="h-10 shrink-0 overflow-hidden line-clamp-2 text-sm font-bold leading-5 text-slate-900 transition group-hover:text-yellow-800">
            {nome}
          </h3>
          <p className="mt-1 h-8 shrink-0 overflow-hidden line-clamp-2 text-[11px] leading-4 text-slate-500">
            {descrizione?.trim() ? descrizione : <span aria-hidden="true">&nbsp;</span>}
          </p>
          <p className="mt-2 flex h-8 shrink-0 items-center">
            <span className="inline-flex h-7 items-center rounded-md border border-yellow-200 bg-yellow-50 px-2 text-xs font-black text-blue-700">
              {haVarianti ? "Da " : ""}&euro; {prezzoFormattato}
            </span>
          </p>
          <p className="mt-2 flex h-7 shrink-0 min-w-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600">
            <Store className="h-3 w-3 shrink-0 text-yellow-700" aria-hidden />
            <span className="min-w-0 truncate">{negozio_nome || "\u00a0"}</span>
          </p>
        </div>
      </Link>

      {/* CTA desktop dedicata alla vetrina Eccellenze: porta alla scheda prodotto
          dove l'utente può selezionare le opzioni e aggiungerlo al carrello. */}
      {prodottoTipico && (
        <Link
          href={`/prodotto/${slug}`}
          className="mx-3 mb-3 hidden h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-yellow-400 px-3 py-2 text-sm font-bold text-slate-900 transition hover:bg-yellow-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-600 focus-visible:ring-offset-2 md:flex"
          aria-label={`Acquista ${nome}`}
        >
          <ShoppingCart className="h-4 w-4" aria-hidden />
          Acquista
        </Link>
      )}

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
