import Link from "next/link";
import {
  Baby,
  CalendarDays,
  Car,
  Coffee,
  Croissant,
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
  Pizza,
  Scissors,
  Shirt,
  Smartphone,
  Store,
  UtensilsCrossed,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Categoria } from "@/types/negozio";

// Simboli (icone) piccoli e professionali per ogni categoria: niente immagini.
const FALLBACK_ICONA: LucideIcon = Store;

const ICONE_CATEGORIE: { match: string[]; icona: LucideIcon }[] = [
  { match: ["panificio", "bakery", "forno", "pane", "pasticceria", "panetteria"], icona: Croissant },
  { match: ["beauty", "bellezza", "parrucchiere", "estetista", "barbiere", "salone", "skincare", "makeup"], icona: Scissors },
  { match: ["casa", "arredo", "arredamento", "mobili", "interior", "decorazioni", "illuminazione", "cucina"], icona: Home },
  { match: ["auto", "officina", "meccanico", "carrozzeria", "concessionaria", "gomme", "macchina"], icona: Car },
  { match: ["salute", "farmacia", "parafarmacia", "benessere", "sanitaria", "medicinali", "wellness"], icona: HeartPulse },
  { match: ["tech", "elettronica", "tecnologia", "telefonia", "computer", "smartphone", "tablet", "informatica"], icona: Smartphone },
  { match: ["cartoleria", "cancelleria", "ufficio", "forniture"], icona: PenLine },
  { match: ["bimbi", "bambini", "giocattoli", "infanzia", "neonati", "scuola"], icona: Baby },
  { match: ["sport", "fitness", "palestra", "yoga", "training", "pilates", "running", "allenamento"], icona: Dumbbell },
  { match: ["abbigliamento", "moda", "boutique", "fashion", "vestiti", "shopping", "shop", "acquisti"], icona: Shirt },
  { match: ["pet", "animali", "cane", "gatto", "veterinario", "toelettatura", "mangime"], icona: PawPrint },
  { match: ["ristorante", "ristoranti", "trattoria", "osteria", "cucina", "tavola calda", "food"], icona: UtensilsCrossed },
  { match: ["bar", "caffe", "caffè", "caffetteria", "colazione", "coffee"], icona: Coffee },
  { match: ["pizzeria", "pizza", "focaccia"], icona: Pizza },
  { match: ["calzature", "scarpe", "footwear", "sneakers", "sandali", "stivali"], icona: Footprints },
  { match: ["fioraio", "fiori", "florist", "piante", "giardino", "composizioni"], icona: Flower2 },
  { match: ["gioielleria", "gioielli", "orologeria", "oro", "argento", "pietre preziose"], icona: Gem },
  { match: ["elettricista", "elettricita", "impianti", "elettrico", "quadro elettrico"], icona: Zap },
  { match: ["idraulico", "idraulica", "caldaia", "termoidraulica", "riscaldamento"], icona: Droplets },
  { match: ["falegname", "falegnameria", "carpenteria", "legno", "mobilio"], icona: Hammer },
  { match: ["servizi", "services", "professionisti", "artigiani", "varie", "generico"], icona: Wrench },
  { match: ["eventi", "tempo libero", "event", "intrattenimento", "spettacolo", "cultura"], icona: CalendarDays },
  { match: ["gelateria", "gelato"], icona: Coffee },
];

function iconaPerCategoria(categoria: Categoria): LucideIcon {
  const testo = `${categoria.slug} ${categoria.nome}`.toLowerCase();
  const trovato = ICONE_CATEGORIE.find((stile) =>
    stile.match.some((termine) => testo.includes(termine))
  );
  return trovato?.icona ?? FALLBACK_ICONA;
}

// Card pulita senza immagini: simbolo piccolo + nome ben leggibile.
const CARD_CLASS =
  "group flex flex-col items-center gap-2 rounded-2xl bg-white p-3.5 ring-1 ring-slate-100 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md md:p-4";

const ICON_BADGE_CLASS =
  "flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-slate-50 to-slate-100 ring-1 ring-slate-100 transition-colors duration-200 group-hover:from-blue-50 group-hover:to-blue-100 md:h-11 md:w-11";

const NOME_CLASS =
  "block text-[11px] font-semibold text-slate-700 transition-colors group-hover:text-blue-600 md:text-xs";

export default function CategoryTile({
  categoria,
  index,
  count,
}: {
  categoria: Categoria;
  index: number;
  count?: number;
}) {
  const Icona = iconaPerCategoria(categoria);

  return (
    <Link
      href={`/categorie/${categoria.slug}`}
      className={CARD_CLASS}
    >
      <span className={ICON_BADGE_CLASS}>
        <Icona className="h-5 w-5 text-slate-600 transition-colors group-hover:text-blue-600 md:h-[22px] md:w-[22px]" aria-hidden />
      </span>
      <span className="text-center">
        <span className={NOME_CLASS}>
          {categoria.nome}
        </span>
        {typeof count === "number" && (
          <span className="block text-[9px] font-medium text-slate-400 md:text-[10px]">
            {count === 1 ? "1 negozio" : `${count} negozi`}
          </span>
        )}
      </span>
    </Link>
  );
}

export function TutteCategorieTile({ index = 0 }: { index?: number }) {
  return (
    <Link href="/categorie" className={CARD_CLASS}>
      <span className={ICON_BADGE_CLASS}>
        <LayoutGrid className="h-5 w-5 text-slate-600 transition-colors group-hover:text-blue-600 md:h-[22px] md:w-[22px]" aria-hidden />
      </span>
      <span className="text-center">
        <span className={NOME_CLASS}>
          Tutte le categorie
        </span>
      </span>
    </Link>
  );
}
