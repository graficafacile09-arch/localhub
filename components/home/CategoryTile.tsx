import Link from "next/link";
import {
  Baby,
  CalendarDays,
  Car,
  Cat,
  Coffee,
  Croissant,
  Dog,
  Droplets,
  Dumbbell,
  Flower2,
  Footprints,
  Gem,
  Hammer,
  HeartPulse,
  Home,
  LayoutGrid,
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

// Simboli (icone) piccoli con sfondo pastello coordinato: un tocco di colore
// per ogni categoria, senza immagini e senza icone giocattolose.
type StileCategoria = {
  icona: LucideIcon;
  /** Seconda icona affiancata (es. cane + gatto). */
  icona2?: LucideIcon;
  bg: string;
  text: string;
};

const FALLBACK: StileCategoria = { icona: Store, bg: "bg-blue-100", text: "text-blue-600" };

const ICONE_CATEGORIE: ({ match: string[] } & StileCategoria)[] = [
  { match: ["panificio", "bakery", "forno", "pane", "pasticceria", "panetteria"], icona: Croissant, bg: "bg-amber-100", text: "text-amber-600" },
  { match: ["beauty", "bellezza", "parrucchiere", "estetista", "barbiere", "salone", "skincare", "makeup"], icona: Scissors, bg: "bg-fuchsia-100", text: "text-fuchsia-600" },
  { match: ["casa", "arredo", "arredamento", "mobili", "interior", "decorazioni", "illuminazione", "cucina"], icona: Home, bg: "bg-orange-100", text: "text-orange-600" },
  { match: ["auto", "officina", "meccanico", "carrozzeria", "concessionaria", "gomme", "macchina"], icona: Car, bg: "bg-sky-100", text: "text-sky-600" },
  { match: ["salute", "farmacia", "parafarmacia", "benessere", "sanitaria", "medicinali", "wellness"], icona: HeartPulse, bg: "bg-rose-100", text: "text-rose-600" },
  { match: ["tech", "elettronica", "tecnologia", "telefonia", "computer", "smartphone", "tablet", "informatica"], icona: Smartphone, bg: "bg-violet-100", text: "text-violet-600" },
  { match: ["cartoleria", "cancelleria", "ufficio", "forniture"], icona: PenLine, bg: "bg-indigo-100", text: "text-indigo-600" },
  { match: ["bimbi", "bambini", "giocattoli", "infanzia", "neonati", "scuola"], icona: Baby, bg: "bg-yellow-100", text: "text-yellow-600" },
  { match: ["sport", "fitness", "palestra", "yoga", "training", "pilates", "running", "allenamento"], icona: Dumbbell, bg: "bg-emerald-100", text: "text-emerald-600" },
  // NB: niente "shop" tra i match: "Pet Shop & Animali" lo intercetterebbe
  // (il find prende il PRIMO match) e mostrerebbe la maglietta. Resta "shopping".
  { match: ["abbigliamento", "moda", "boutique", "fashion", "vestiti", "shopping", "acquisti"], icona: Shirt, bg: "bg-pink-100", text: "text-pink-600" },
  { match: ["pet", "animali", "cane", "gatto", "veterinario", "toelettatura", "mangime"], icona: Dog, icona2: Cat, bg: "bg-teal-100", text: "text-teal-600" },
  { match: ["ristorante", "ristoranti", "trattoria", "osteria", "cucina", "tavola calda", "food"], icona: UtensilsCrossed, bg: "bg-red-100", text: "text-red-600" },
  { match: ["bar", "caffe", "caffè", "caffetteria", "colazione", "coffee"], icona: Coffee, bg: "bg-lime-100", text: "text-lime-600" },
  { match: ["pizzeria", "pizza", "focaccia"], icona: Pizza, bg: "bg-amber-100", text: "text-amber-600" },
  { match: ["calzature", "scarpe", "footwear", "sneakers", "sandali", "stivali"], icona: Footprints, bg: "bg-cyan-100", text: "text-cyan-600" },
  { match: ["fioraio", "fiori", "florist", "piante", "giardino", "composizioni"], icona: Flower2, bg: "bg-green-100", text: "text-green-600" },
  { match: ["gioielleria", "gioielli", "orologeria", "oro", "argento", "pietre preziose"], icona: Gem, bg: "bg-purple-100", text: "text-purple-600" },
  { match: ["elettricista", "elettricita", "impianti", "elettrico", "quadro elettrico"], icona: Zap, bg: "bg-yellow-100", text: "text-yellow-600" },
  { match: ["idraulico", "idraulica", "caldaia", "termoidraulica", "riscaldamento"], icona: Droplets, bg: "bg-blue-100", text: "text-blue-600" },
  { match: ["falegname", "falegnameria", "carpenteria", "legno", "mobilio"], icona: Hammer, bg: "bg-stone-100", text: "text-stone-600" },
  { match: ["servizi", "services", "professionisti", "artigiani", "varie", "generico"], icona: Wrench, bg: "bg-cyan-100", text: "text-cyan-600" },
  { match: ["eventi", "tempo libero", "event", "intrattenimento", "spettacolo", "cultura"], icona: CalendarDays, bg: "bg-fuchsia-100", text: "text-fuchsia-600" },
  { match: ["gelateria", "gelato"], icona: Coffee, bg: "bg-pink-100", text: "text-pink-600" },
];

function stilePerCategoria(categoria: Categoria): StileCategoria {
  const testo = `${categoria.slug} ${categoria.nome}`.toLowerCase();
  const trovato = ICONE_CATEGORIE.find((stile) =>
    stile.match.some((termine) => testo.includes(termine))
  );
  return trovato ?? FALLBACK;
}

// Card pulita senza immagini: simbolo colorato + nome ben leggibile.
const CARD_CLASS =
  "group flex flex-col items-center gap-2 rounded-2xl bg-white p-3.5 ring-1 ring-slate-100 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md md:p-4";

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
  const stile = stilePerCategoria(categoria);
  const Icona = stile.icona;
  const SecondaIcona = stile.icona2;

  return (
    <Link
      href={`/categorie/${categoria.slug}`}
      className={CARD_CLASS}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110 md:h-11 md:w-11 ${stile.bg}`}
      >
        {SecondaIcona ? (
          <span className={`flex items-center gap-[2px] ${stile.text}`} aria-hidden>
            <Icona className="h-[18px] w-[18px] md:h-5 md:w-5" />
            <SecondaIcona className="h-[18px] w-[18px] md:h-5 md:w-5" />
          </span>
        ) : (
          <Icona className={`h-5 w-5 md:h-[22px] md:w-[22px] ${stile.text}`} aria-hidden />
        )}
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
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 transition-transform duration-200 group-hover:scale-110 md:h-11 md:w-11">
        <LayoutGrid className="h-5 w-5 text-blue-600 md:h-[22px] md:w-[22px]" aria-hidden />
      </span>
      <span className="text-center">
        <span className={NOME_CLASS}>
          Tutte le categorie
        </span>
      </span>
    </Link>
  );
}
