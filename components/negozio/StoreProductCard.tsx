import Link from "next/link";
import { Store } from "lucide-react";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { LOGHI_RICONOSCIMENTO, riconoscimentoProdotto } from "@/lib/territori";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import ProdottoImmagine from "@/components/home/ProdottoImmagine";

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

/**
 * Card prodotto del catalogo di un negozio.
 * Stesso linguaggio editoriale della scheda del catalogo (rd-scheda) e stessa
 * fonte immagine/preferiti: nessuna variante grafica da negozio a negozio.
 */
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
  // Stesso riconoscimento della scheda del catalogo, ricavato dallo slug:
  // nessuna certificazione inventata per i prodotti che non ne hanno una.
  const marchio = riconoscimentoProdotto(slug);
  const logoMarchio = marchio
    ? LOGHI_RICONOSCIMENTO[marchio as keyof typeof LOGHI_RICONOSCIMENTO]
    : null;

  return (
    <div className="rd-scheda rd-scheda--interattiva group relative h-full w-full min-w-0">
      <Link href={`/prodotto/${slug}`} className="flex min-h-0 flex-1 flex-col">
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-[#f4efe4]">
          <ProdottoImmagine
            src={imageUrl}
            alt={nome}
            categoria={categoria}
            className="transition duration-500 group-hover:scale-[1.04]"
          />

          {(esaurito || haVarianti) && (
            <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-3.25rem)] flex-col items-start gap-1">
              {haVarianti && !esaurito && (
                <span className="rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-[#24462f] shadow-sm ring-1 ring-[#e5ded0]">
                  Varianti
                </span>
              )}
              {esaurito && (
                <span className="rounded-full bg-[#1b3624] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-[#faf9f5] shadow-sm">
                  Esaurito
                </span>
              )}
            </div>
          )}

          {logoMarchio ? (
            <span className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 py-0.5 pl-1 pr-2 shadow-sm ring-1 ring-[#e5ded0]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoMarchio.src}
                alt={logoMarchio.alt}
                width={40}
                height={40}
                loading="lazy"
                className="h-6 w-6 shrink-0 object-contain"
              />
              <span className="text-[9px] font-black uppercase leading-none tracking-[0.08em] text-[#24462f]">
                {marchio}
              </span>
            </span>
          ) : marchio ? (
            <span className="absolute bottom-2 left-2 z-10 rounded-full bg-[#d5a83a] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-[#16281c] shadow-sm">
              {marchio}
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col px-3.5 pb-3 pt-3">
          <h3 className="rd-titolo-scheda line-clamp-2 min-h-10 text-[0.95rem] transition group-hover:text-[#8a5a3b]">
            {nome}
          </h3>
          <p className="mt-1 line-clamp-2 min-h-9 overflow-hidden text-[11.5px] leading-[1.45] text-[#6b6459]">
            {descrizione?.trim() ? descrizione : <span aria-hidden="true">&nbsp;</span>}
          </p>
          <p className="mt-2.5 flex items-end">
            <span className="inline-flex items-baseline gap-1 rounded-lg bg-[#f4efe4] px-2 py-1 ring-1 ring-[#e5ded0]">
              {haVarianti && (
                <span className="text-[9px] font-black uppercase tracking-[0.08em] text-[#8a5a3b]">
                  Da
                </span>
              )}
              <span className="text-[0.95rem] font-extrabold leading-none tracking-tight text-[#1b3624] tabular-nums">
                &euro; {prezzo.toFixed(2)}
              </span>
            </span>
          </p>
        </div>

        <div className="mt-auto flex items-center gap-1.5 border-t border-[#e5ded0] bg-[#fbf9f4] px-3.5 py-2 text-[11px] font-semibold text-[#57534e]">
          <Store className="h-3.5 w-3.5 shrink-0 text-[#8a5a3b]" aria-hidden />
          <span className="truncate">{negozio_nome.trim() || "\u00a0"}</span>
        </div>
      </Link>

      {mostraPreferiti && (
        <FavoritoButton
          tipo="prodotto"
          riferimentoId={id}
          attivo={preferitoAttivo}
          autenticato={autenticato}
          className="absolute right-2 top-2 z-20"
          label={nome}
        />
      )}
    </div>
  );
}
