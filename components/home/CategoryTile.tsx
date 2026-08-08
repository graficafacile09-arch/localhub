import Link from "next/link";
import {
  Baby,
  Croissant,
  CalendarDays,
  Car,
  Coffee,
  Droplets,
  Dumbbell,
  Flower2,
  Footprints,
  Gem,
  Hammer,
  HeartPulse,
  Home,
  LayoutGrid,
  PawPrint,
  PenLine,
  Pill,
  Pizza,
  Scissors,
  Shirt,
  ShoppingBag,
  Smartphone,
  Store,
  UtensilsCrossed,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Categoria } from "@/types/negozio";

// Immagini fotografiche REALI (Pexels) condivise con il resto del sito
// (stesso pattern di lib/negozi-card-immagini: nessuna illustrazione).
const pexelsImage = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1200&h=675&dpr=2`;

type StileCategoria = {
  url: string;
  icona: LucideIcon;
};

const FALLBACK: StileCategoria = { url: pexelsImage(33407840), icona: Store };

// Mappatura per parole chiave su slug + nome: copre tutte le categorie
// attuali (Panificio, Beauty, Casa, Auto, Salute, Tech, Bimbi, Sport,
// Abbigliamento, Pet, Ristorante, Bar, ...) e resta valida se in futuro
// le categorie verranno rinominate con i nuovi nomi.
const STILI_CATEGORIE: { match: string[]; url: string; icona: LucideIcon }[] = [
  { match: ["panificio", "bakery", "forno", "pane", "pasticceria", "panetteria"], url: pexelsImage(2147491), icona: Croissant },
  { match: ["beauty", "bellezza", "parrucchiere", "estetista", "barbiere", "salone", "skincare", "makeup"], url: pexelsImage(853427), icona: Scissors },
  { match: ["casa", "arredo", "arredamento", "mobili", "interior", "decorazioni", "illuminazione", "cucina"], url: pexelsImage(5486110), icona: Home },
  { match: ["auto", "officina", "meccanico", "carrozzeria", "concessionaria", "gomme", "macchina"], url: pexelsImage(29566871), icona: Car },
  { match: ["salute", "farmacia", "parafarmacia", "benessere", "sanitaria", "medicinali", "wellness"], url: pexelsImage(8657365), icona: HeartPulse },
  { match: ["tech", "elettronica", "tecnologia", "telefonia", "computer", "smartphone", "tablet", "informatica"], url: pexelsImage(25809260), icona: Smartphone },
  { match: ["cartoleria", "cancelleria", "ufficio", "forniture"], url: pexelsImage(18176581), icona: PenLine },
  { match: ["bimbi", "bambini", "giocattoli", "infanzia", "neonati", "scuola"], url: pexelsImage(29790215), icona: Baby },
  { match: ["sport", "fitness", "palestra", "yoga", "training", "pilates", "running", "allenamento"], url: pexelsImage(8933584), icona: Dumbbell },
  { match: ["abbigliamento", "moda", "boutique", "fashion", "vestiti", "shopping", "shop", "acquisti"], url: pexelsImage(15306470), icona: Shirt },
  { match: ["pet", "animali", "cane", "gatto", "veterinario", "toelettatura", "mangime"], url: pexelsImage(12064408), icona: PawPrint },
  { match: ["ristorante", "ristoranti", "trattoria", "osteria", "cucina", "tavola calda", "food"], url: pexelsImage(30754469), icona: UtensilsCrossed },
  { match: ["bar", "caffe", "caffè", "caffetteria", "colazione", "coffee"], url: pexelsImage(19748170), icona: Coffee },
  { match: ["pizzeria", "pizza", "focaccia"], url: pexelsImage(29807154), icona: Pizza },
  { match: ["calzature", "scarpe", "footwear", "sneakers", "sandali", "stivali"], url: pexelsImage(37052027), icona: Footprints },
  { match: ["fioraio", "fiori", "florist", "piante", "giardino", "composizioni"], url: pexelsImage(32939456), icona: Flower2 },
  { match: ["gioielleria", "gioielli", "orologeria", "oro", "argento", "pietre preziose"], url: pexelsImage(29043373), icona: Gem },
  { match: ["elettricista", "elettricita", "impianti", "elettrico", "quadro elettrico"], url: pexelsImage(19756443), icona: Zap },
  { match: ["idraulico", "idraulica", "caldaia", "termoidraulica", "riscaldamento"], url: pexelsImage(19756443), icona: Droplets },
  { match: ["falegname", "falegnameria", "carpenteria", "legno", "mobilio"], url: pexelsImage(19756443), icona: Hammer },
  { match: ["servizi", "services", "professionisti", "artigiani", "varie", "generico"], url: pexelsImage(19756443), icona: Wrench },
  { match: ["eventi", "tempo libero", "event", "intrattenimento", "spettacolo", "cultura"], url: pexelsImage(1190298), icona: CalendarDays },
  { match: ["gelateria", "gelato"], url: pexelsImage(36583362), icona: Coffee },
];

function stilePerCategoria(categoria: Categoria): StileCategoria {
  const testo = `${categoria.slug} ${categoria.nome}`.toLowerCase();
  const trovato = STILI_CATEGORIE.find((stile) =>
    stile.match.some((termine) => testo.includes(termine))
  );
  return trovato ?? FALLBACK;
}

const CARD_CLASS =
  "group relative block aspect-[2/1] overflow-hidden rounded-xl bg-slate-200 shadow-sm ring-1 ring-slate-900/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/10";

const OVERLAY_CLASS =
  "absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/25 to-transparent";

const ICON_BADGE_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-900/5 md:h-8 md:w-8";

const NOME_CLASS =
  "truncate text-xs font-bold tracking-tight text-white drop-shadow-sm md:text-sm";

export default function CategoryTile({
  categoria,
  index,
  count,
}: {
  categoria: Categoria;
  index: number;
  count?: number;
}) {
  const stile = stilePerCategoria(categoria);
  const Icona = stile.icona;

  return (
    <Link
      href={`/categorie/${categoria.slug}`}
      className={CARD_CLASS}
    >
      {/* Immagine fotografica reale a tutta card */}
      <div
        role="img"
        aria-label={categoria.nome}
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: `url(${stile.url})` }}
      />
      {/* Overlay leggermente scuro nella parte inferiore */}
      <div className={OVERLAY_CLASS} />

      {/* Nome in bianco + icona circolare bianca in basso */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 md:p-2.5">
        <div className="min-w-0">
          <h3 className={NOME_CLASS}>
            {categoria.nome}
          </h3>
          {typeof count === "number" && (
            <p className="mt-0.5 text-[9px] font-medium text-white/80 md:text-[10px]">
              {count === 1 ? "1 negozio" : `${count} negozi`}
            </p>
          )}
        </div>
        <span className={ICON_BADGE_CLASS}>
          <Icona className="h-3.5 w-3.5 text-blue-700 md:h-4 md:w-4" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

export function TutteCategorieTile({ index = 0 }: { index?: number }) {
  return (
    <Link href="/categorie" className={CARD_CLASS}>
      <div
        role="img"
        aria-label="Tutte le categorie"
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: `url(${pexelsImage(10907746)})` }}
      />
      <div className={OVERLAY_CLASS} />

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 md:p-2.5">
        <h3 className={NOME_CLASS}>
          Tutte le categorie
        </h3>
        <span className={ICON_BADGE_CLASS}>
          <LayoutGrid className="h-3.5 w-3.5 text-blue-700 md:h-4 md:w-4" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
