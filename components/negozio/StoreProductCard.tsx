import { getProdottoImmagine } from "@/lib/prodotti-immagini";

type StoreProductCardProps = {
  id: string;
  nome: string;
  descrizione?: string | null;
  prezzo: number;
  categoria?: string | null;
  immagine_principale?: string | null;
};

export default function StoreProductCard({
  nome,
  descrizione,
  prezzo,
  categoria,
  immagine_principale,
}: StoreProductCardProps) {
  const imageUrl = getProdottoImmagine({ immagine_principale, categoria });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white transition hover:border-blue-200 hover:shadow-sm">
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        <div
          role="img"
          aria-label={nome}
          className="h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
        {categoria && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-px text-[9px] font-semibold text-white backdrop-blur-sm">
            {categoria}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="line-clamp-1 text-sm font-bold text-slate-900">{nome}</h3>
        {descrizione && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-[14px] text-slate-400">
            {descrizione}
          </p>
        )}
        <p className="mt-1 text-base font-black text-blue-700">€{prezzo}</p>
      </div>
    </div>
  );
}
