import Link from "next/link";
import { ArrowUpRight, LayoutGrid } from "lucide-react";
import type { Categoria } from "@/types/negozio";

// Immagini fotografiche REALI (Pexels) condivise con il resto del sito
// (stesso pattern di lib/negozi-card-immagini: nessuna illustrazione).
const pexelsImage = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1200&h=675&dpr=2`;

const FALLBACK = pexelsImage(33407840);

// Mappatura per parole chiave su slug + nome: copre tutte le categorie
// attuali e resta valida se in futuro le categorie verranno rinominate.
const IMMAGINI_CATEGORIE: { match: string[]; url: string }[] = [
  { match: ["panificio", "bakery", "forno", "pane", "pasticceria", "panetteria"], url: pexelsImage(2147491) },
  { match: ["beauty", "bellezza", "parrucchiere", "estetista", "barbiere", "salone", "skincare", "makeup"], url: pexelsImage(853427) },
  { match: ["casa", "arredo", "arredamento", "mobili", "interior", "decorazioni", "illuminazione", "cucina"], url: pexelsImage(5486110) },
  { match: ["auto", "officina", "meccanico", "carrozzeria", "concessionaria", "gomme", "macchina"], url: pexelsImage(29566871) },
  { match: ["salute", "farmacia", "parafarmacia", "benessere", "sanitaria", "medicinali", "wellness"], url: pexelsImage(8657365) },
  { match: ["tech", "elettronica", "tecnologia", "telefonia", "computer", "smartphone", "tablet", "informatica"], url: pexelsImage(25809260) },
  { match: ["cartoleria", "cancelleria", "ufficio", "forniture"], url: pexelsImage(18176581) },
  { match: ["bimbi", "bambini", "giocattoli", "infanzia", "neonati", "scuola"], url: pexelsImage(29790215) },
  { match: ["sport", "fitness", "palestra", "yoga", "training", "pilates", "running", "allenamento"], url: pexelsImage(8933584) },
  { match: ["abbigliamento", "moda", "boutique", "fashion", "vestiti", "shopping", "shop", "acquisti"], url: pexelsImage(15306470) },
  { match: ["pet", "animali", "cane", "gatto", "veterinario", "toelettatura", "mangime"], url: pexelsImage(12064408) },
  { match: ["ristorante", "ristoranti", "trattoria", "osteria", "cucina", "tavola calda", "food"], url: pexelsImage(30754469) },
  { match: ["bar", "caffe", "caffè", "caffetteria", "colazione", "coffee"], url: pexelsImage(19748170) },
  { match: ["pizzeria", "pizza", "focaccia"], url: pexelsImage(29807154) },
  { match: ["calzature", "scarpe", "footwear", "sneakers", "sandali", "stivali"], url: pexelsImage(37052027) },
  { match: ["fioraio", "fiori", "florist", "piante", "giardino", "composizioni"], url: pexelsImage(32939456) },
  { match: ["gioielleria", "gioielli", "orologeria", "oro", "argento", "pietre preziose"], url: pexelsImage(29043373) },
  { match: ["elettricista", "elettricita", "impianti", "elettrico", "quadro elettrico"], url: pexelsImage(19756443) },
  { match: ["idraulico", "idraulica", "caldaia", "termoidraulica", "riscaldamento"], url: pexelsImage(19756443) },
  { match: ["falegname", "falegnameria", "carpenteria", "legno", "mobilio"], url: pexelsImage(19756443) },
  { match: ["servizi", "services", "professionisti", "artigiani", "varie", "generico"], url: pexelsImage(19756443) },
  { match: ["eventi", "tempo libero", "event", "intrattenimento", "spettacolo", "cultura"], url: pexelsImage(1190298) },
  { match: ["gelateria", "gelato"], url: pexelsImage(36583362) },
];

function immaginePerCategoria(categoria: Categoria): string {
  const testo = `${categoria.slug} ${categoria.nome}`.toLowerCase();
  const trovato = IMMAGINI_CATEGORIE.find((stile) =>
    stile.match.some((termine) => testo.includes(termine))
  );
  return trovato?.url ?? FALLBACK;
}

// Card premium: immagine grande in alto, titolo sotto, ombra morbida e
// leggero rialzo all'hover (stile Esempio 2).
const CARD_CLASS =
  "group block overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-900/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/10";

const TITLE_CLASS =
  "truncate text-sm font-bold tracking-tight text-slate-900 md:text-base";

const BADGE_CLASS =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400 ring-1 ring-slate-100 transition-all duration-300 group-hover:bg-blue-600 group-hover:text-white group-hover:ring-blue-600 md:h-10 md:w-10";

export default function CategoryTile({
  categoria,
  index,
  count,
}: {
  categoria: Categoria;
  index: number;
  count?: number;
}) {
  const immagine = immaginePerCategoria(categoria);

  return (
    <Link
      href={`/categorie/${categoria.slug}`}
      className={CARD_CLASS}
    >
      {/* Grande immagine rappresentativa della categoria */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        <div
          role="img"
          aria-label={categoria.nome}
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url(${immagine})` }}
        />
      </div>

      {/* Titolo ben visibile sotto l'immagine */}
      <div className="flex items-center justify-between gap-3 p-3.5 md:p-4">
        <div className="min-w-0">
          <h3 className={TITLE_CLASS}>
            {categoria.nome}
          </h3>
          {typeof count === "number" && (
            <p className="mt-0.5 text-[11px] font-medium text-slate-400 md:text-xs">
              {count === 1 ? "1 negozio" : `${count} negozi`}
            </p>
          )}
        </div>
        <span className={BADGE_CLASS}>
          <ArrowUpRight className="h-4 w-4 md:h-[18px] md:w-[18px]" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

export function TutteCategorieTile({ index = 0 }: { index?: number }) {
  return (
    <Link href="/categorie" className={CARD_CLASS}>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        <div
          role="img"
          aria-label="Tutte le categorie"
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url(${pexelsImage(10907746)})` }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 p-3.5 md:p-4">
        <h3 className={TITLE_CLASS}>
          Tutte le categorie
        </h3>
        <span className={BADGE_CLASS}>
          <LayoutGrid className="h-4 w-4 md:h-[18px] md:w-[18px]" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
