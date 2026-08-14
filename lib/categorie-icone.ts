/**
 * ICONE CATEGORIE PUBBLICHE — mappa centralizzata slug → stile icona.
 *
 * Unica fonte per l'icona di ogni categoria della navigazione pubblica
 * (homepage + pagina /categorie). Le icone sono icone Lucide minimali e
 * lineari — stesso linguaggio visivo del resto di InCittà, con un pastello di
 * sfondo + colore coordinato, leggibili anche in dimensioni piccole.
 *
 * La mappa è indicizzata per SLUG (l'identificatore stabile delle categorie,
 * identico a `public.categorie.slug`). Il componente CategoryTile risolve lo
 * stile tramite `stileCategoria(slug)`; nessun altro punto del frontend
 * definisce icone o colori per le categorie.
 */

import {
  Armchair,
  BedDouble,
  Beef,
  Beer,
  Bike,
  BookOpen,
  Briefcase,
  Building,
  Building2,
  Cake,
  Camera,
  Car,
  Clapperboard,
  Coffee,
  Cog,
  CookingPot,
  Croissant,
  Cross,
  Diamond,
  Drill,
  Dumbbell,
  Fish,
  Flower2,
  Footprints,
  Gem,
  Gift,
  Glasses,
  GraduationCap,
  Guitar,
  Hammer,
  Handbag,
  HardHat,
  HeartPulse,
  Home,
  Hotel,
  IceCreamBowl,
  Lamp,
  Landmark,
  Laptop,
  Map,
  MoreHorizontal,
  Motorbike,
  Palette,
  PawPrint,
  PenLine,
  PenTool,
  Pill,
  Pizza,
  Plane,
  Printer,
  Puzzle,
  Scissors,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
  Sofa,
  Sparkles,
  SprayCan,
  Store,
  Tv,
  Trophy,
  User,
  UtensilsCrossed,
  WashingMachine,
  Watch,
  Wheat,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type StileIconaCategoria = {
  icona: LucideIcon;
  /** Seconda icona affiancata (non usata dal catalogo: riservata per estensioni). */
  icona2?: LucideIcon;
  bg: string;
  text: string;
};

/** Fallback professionale (nessuna categoria deve restare senza icona). */
export const STILE_CATEGORIA_FALLBACK: StileIconaCategoria = {
  icona: Store,
  bg: "bg-blue-100",
  text: "text-blue-600",
};

/**
 * Mappa slug → stile. Ogni voce associa un simbolo semanticamente
 * riconoscibile alla categoria, nello stesso stile grafico minimal.
 */
export const ICONE_CATEGORIE: Record<string, StileIconaCategoria> = {
  // Moda & persona
  abbigliamento: { icona: Shirt, bg: "bg-pink-100", text: "text-pink-600" },
  accessori: { icona: Watch, bg: "bg-purple-100", text: "text-purple-600" },
  gioielleria: { icona: Gem, bg: "bg-purple-100", text: "text-purple-700" },
  oreficeria: { icona: Diamond, bg: "bg-violet-100", text: "text-violet-700" },
  profumeria: { icona: SprayCan, bg: "bg-fuchsia-100", text: "text-fuchsia-600" },
  cosmetica: { icona: Palette, bg: "bg-fuchsia-100", text: "text-fuchsia-700" },
  ottica: { icona: Glasses, bg: "bg-sky-100", text: "text-sky-700" },
  pelletteria: { icona: Handbag, bg: "bg-amber-100", text: "text-amber-800" },
  intimo: { icona: Shirt, bg: "bg-rose-100", text: "text-rose-600" },
  calzature: { icona: Footprints, bg: "bg-cyan-100", text: "text-cyan-700" },

  // Sport & tempo libero
  sport: { icona: Trophy, bg: "bg-emerald-100", text: "text-emerald-700" },

  // Tech
  elettronica: { icona: Tv, bg: "bg-violet-100", text: "text-violet-600" },
  informatica: { icona: Laptop, bg: "bg-indigo-100", text: "text-indigo-700" },
  telefonia: { icona: Smartphone, bg: "bg-violet-100", text: "text-violet-700" },
  elettrodomestici: { icona: WashingMachine, bg: "bg-sky-100", text: "text-sky-600" },

  // Casa & fai da te
  casa: { icona: Home, bg: "bg-orange-100", text: "text-orange-600" },
  arredamento: { icona: Sofa, bg: "bg-orange-100", text: "text-orange-700" },
  mobili: { icona: Armchair, bg: "bg-amber-100", text: "text-amber-700" },
  illuminazione: { icona: Lamp, bg: "bg-yellow-100", text: "text-yellow-600" },
  ferramenta: { icona: Wrench, bg: "bg-stone-100", text: "text-stone-600" },
  edilizia: { icona: HardHat, bg: "bg-yellow-100", text: "text-yellow-700" },
  "fai-da-te": { icona: Drill, bg: "bg-amber-100", text: "text-amber-700" },

  // Auto & moto
  auto: { icona: Car, bg: "bg-sky-100", text: "text-sky-600" },
  moto: { icona: Motorbike, bg: "bg-slate-100", text: "text-slate-700" },
  "ricambi-auto": { icona: Cog, bg: "bg-zinc-100", text: "text-zinc-700" },
  biciclette: { icona: Bike, bg: "bg-lime-100", text: "text-lime-700" },

  // Alimentari & ristorazione
  alimentari: { icona: ShoppingBasket, bg: "bg-emerald-100", text: "text-emerald-600" },
  supermercato: { icona: ShoppingCart, bg: "bg-emerald-100", text: "text-emerald-700" },
  macelleria: { icona: Beef, bg: "bg-red-100", text: "text-red-600" },
  pescheria: { icona: Fish, bg: "bg-cyan-100", text: "text-cyan-700" },
  panetteria: { icona: Croissant, bg: "bg-amber-100", text: "text-amber-700" },
  pasticceria: { icona: Cake, bg: "bg-pink-100", text: "text-pink-700" },
  gelateria: { icona: IceCreamBowl, bg: "bg-pink-100", text: "text-pink-600" },
  gastronomia: { icona: CookingPot, bg: "bg-red-100", text: "text-red-700" },
  enoteca: { icona: Wine, bg: "bg-red-100", text: "text-red-600" },
  bar: { icona: Coffee, bg: "bg-amber-100", text: "text-amber-700" },
  ristorante: { icona: UtensilsCrossed, bg: "bg-red-100", text: "text-red-700" },
  pizzeria: { icona: Pizza, bg: "bg-red-100", text: "text-red-600" },
  pub: { icona: Beer, bg: "bg-amber-100", text: "text-amber-800" },

  // Natura & animali
  agricoltura: { icona: Wheat, bg: "bg-green-100", text: "text-green-700" },
  "fiori-e-piante": { icona: Flower2, bg: "bg-green-100", text: "text-green-600" },
  "animali-e-pet-shop": { icona: PawPrint, bg: "bg-teal-100", text: "text-teal-600" },

  // Salute & benessere
  farmacia: { icona: Cross, bg: "bg-emerald-100", text: "text-emerald-700" },
  parafarmacia: { icona: Pill, bg: "bg-green-100", text: "text-green-700" },
  "salute-e-benessere": { icona: HeartPulse, bg: "bg-rose-100", text: "text-rose-600" },
  parrucchiere: { icona: Scissors, bg: "bg-fuchsia-100", text: "text-fuchsia-700" },
  barbiere: { icona: Scissors, bg: "bg-slate-100", text: "text-slate-600" },
  estetica: { icona: Sparkles, bg: "bg-rose-100", text: "text-rose-600" },
  "palestre-e-fitness": { icona: Dumbbell, bg: "bg-emerald-100", text: "text-emerald-700" },

  // Turismo & ospitalità
  turismo: { icona: Map, bg: "bg-cyan-100", text: "text-cyan-700" },
  hotel: { icona: Hotel, bg: "bg-indigo-100", text: "text-indigo-600" },
  "bed-and-breakfast": { icona: BedDouble, bg: "bg-indigo-100", text: "text-indigo-700" },
  "agenzia-immobiliare": { icona: Building, bg: "bg-sky-100", text: "text-sky-700" },
  "agenzia-viaggi": { icona: Plane, bg: "bg-cyan-100", text: "text-cyan-600" },

  // Servizi & professioni
  "servizi-professionali": { icona: Briefcase, bg: "bg-blue-100", text: "text-blue-600" },
  "studi-professionali": { icona: GraduationCap, bg: "bg-indigo-100", text: "text-indigo-600" },
  assicurazioni: { icona: ShieldCheck, bg: "bg-blue-100", text: "text-blue-700" },
  "banche-e-servizi-finanziari": { icona: Landmark, bg: "bg-emerald-100", text: "text-emerald-700" },

  // Artigianato & creatività
  artigianato: { icona: Hammer, bg: "bg-stone-100", text: "text-stone-700" },
  fotografia: { icona: Camera, bg: "bg-slate-100", text: "text-slate-700" },
  "grafica-e-comunicazione": { icona: PenTool, bg: "bg-indigo-100", text: "text-indigo-700" },
  stampa: { icona: Printer, bg: "bg-slate-100", text: "text-slate-600" },

  // Shopping & regali
  regali: { icona: Gift, bg: "bg-pink-100", text: "text-pink-600" },
  giocattoli: { icona: Puzzle, bg: "bg-yellow-100", text: "text-yellow-600" },
  libreria: { icona: BookOpen, bg: "bg-amber-100", text: "text-amber-700" },
  cartoleria: { icona: PenLine, bg: "bg-indigo-100", text: "text-indigo-600" },
  "musica-e-strumenti-musicali": { icona: Guitar, bg: "bg-violet-100", text: "text-violet-700" },
  "cultura-e-intrattenimento": { icona: Clapperboard, bg: "bg-fuchsia-100", text: "text-fuchsia-700" },

  // Servizi
  "servizi-alla-persona": { icona: User, bg: "bg-cyan-100", text: "text-cyan-700" },
  "servizi-per-aziende": { icona: Building2, bg: "bg-slate-100", text: "text-slate-600" },

  // Altro
  altro: { icona: MoreHorizontal, bg: "bg-slate-100", text: "text-slate-600" },
};

/** Risolve lo stile (icona + colori) di una categoria a partire dallo slug. */
export function stileCategoria(slug: string): StileIconaCategoria {
  return ICONE_CATEGORIE[slug] ?? STILE_CATEGORIA_FALLBACK;
}
