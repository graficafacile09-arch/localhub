import Header from "@/components/Header/Header";
import SearchForm from "@/components/home/SearchForm";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { getNegozi } from "../lib/negozi";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Baby,
  BriefcaseBusiness,
  Car,
  Dumbbell,
  HeartPulse,
  MapPin,
  PawPrint,
  Scissors,
  Shirt,
  Sofa,
  Sparkles,
  Smartphone,
  Store,
  UtensilsCrossed,
} from "lucide-react";

// ─── Categorie — chip orizzontali scrollabili ──────────────────────────────
const categorie: {
  nome: string;
  query: string;
  icon: LucideIcon;
  bg: string;
  text: string;
}[] = [
  { nome: "Negozi",    query: "Negozi",   icon: Store,            bg: "bg-blue-50",    text: "text-blue-700" },
  { nome: "Food",      query: "Food",     icon: UtensilsCrossed,  bg: "bg-orange-50",  text: "text-orange-700" },
  { nome: "Moda",      query: "Moda",     icon: Shirt,            bg: "bg-fuchsia-50", text: "text-fuchsia-700" },
  { nome: "Beauty",    query: "Beauty",   icon: Sparkles,         bg: "bg-pink-50",    text: "text-pink-700" },
  { nome: "Casa",      query: "Casa",     icon: Sofa,             bg: "bg-emerald-50", text: "text-emerald-700" },
  { nome: "Servizi",   query: "Servizi",  icon: BriefcaseBusiness,bg: "bg-slate-100",  text: "text-slate-700" },
  { nome: "Auto",      query: "Auto",     icon: Car,              bg: "bg-amber-50",   text: "text-amber-700" },
  { nome: "Salute",    query: "Salute",   icon: HeartPulse,       bg: "bg-red-50",     text: "text-red-700" },
  { nome: "Tech",      query: "Tech",     icon: Smartphone,       bg: "bg-indigo-50",  text: "text-indigo-700" },
  { nome: "Bimbi",     query: "Bimbi",    icon: Baby,             bg: "bg-yellow-50",  text: "text-yellow-700" },
  { nome: "Pet",       query: "Pet Shop", icon: PawPrint,         bg: "bg-orange-50",  text: "text-orange-700" },
  { nome: "Sport",     query: "Sport",    icon: Dumbbell,         bg: "bg-indigo-50",  text: "text-indigo-700" },
];

// ─── Sezioni suggerite — cards medie ──────────────────────────────────────
const sezioni: {
  titolo: string;
  ricerche: string[];
  icon: LucideIcon;
  bg: string;
  iconText: string;
}[] = [
  { titolo: "Beauty & Benessere", icon: Scissors,  ricerche: ["Parrucchiere", "Barber Shop", "Estetica"], bg: "bg-pink-50",    iconText: "text-pink-600" },
  { titolo: "Casa & Arredo",      icon: Sofa,       ricerche: ["Arredamento", "Decorazioni", "Luci"],      bg: "bg-emerald-50", iconText: "text-emerald-600" },
  { titolo: "Tech & Elettronica", icon: Smartphone, ricerche: ["Telefonia", "Computer", "Riparazioni"],    bg: "bg-blue-50",    iconText: "text-blue-600" },
  { titolo: "Pet Shop",           icon: PawPrint,   ricerche: ["Pet Shop", "Toelettatura", "Veterinario"],  bg: "bg-orange-50",  iconText: "text-orange-600" },
  { titolo: "Sport & Fitness",    icon: Dumbbell,   ricerche: ["Palestra", "Articoli sportivi", "Yoga"],    bg: "bg-indigo-50",  iconText: "text-indigo-600" },
  { titolo: "Bimbi",              icon: Baby,       ricerche: ["Giocattoli", "Prima infanzia", "Scuola"],   bg: "bg-yellow-50",  iconText: "text-yellow-600" },
];

// ─── Quick searches ────────────────────────────────────────────────────────
const quickSearches = ["Ristorante", "Farmacia", "Palestra", "Parrucchiere", "Pet Shop", "Arredamento"];

export default async function Home() {
  const negozi = await getNegozi();

  return (
    <main className="min-h-screen bg-gray-50 text-slate-900">
      <Header />

      {/* ══════════════════════════════════════════════════════════════════
          HERO — Ricerca above the fold, minimo chrome
      ══════════════════════════════════════════════════════════════════ */}
      <section className="bg-gradient-to-b from-[#1d4ed8] to-[#1e40af] px-3 pb-5 pt-4 sm:px-5">
        {/* Tagline minima */}
        <div className="mb-3 text-center">
          <p className="text-sm font-semibold text-blue-100">
            Trova negozi, servizi e attività della tua città
          </p>
        </div>

        {/* Search bar — protagonista assoluta */}
        <SearchForm />

        {/* Quick searches — chip sotto la barra */}
        <div
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {quickSearches.map((q) => (
            <Link
              key={q}
              href={`/ricerca?q=${encodeURIComponent(q)}`}
              className="shrink-0 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/20"
            >
              {q}
            </Link>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          CATEGORIE — scroll orizzontale, chip compatti (stile Amazon)
      ══════════════════════════════════════════════════════════════════ */}
      <section id="categorie" className="bg-white px-3 py-3 sm:px-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Categorie</h2>
          <Link href="/negozi" className="text-xs font-medium text-blue-600 hover:underline">
            Vedi tutti
          </Link>
        </div>

        <div
          className="flex gap-3 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
          aria-label="Categorie principali"
        >
          {categorie.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link
                key={cat.nome}
                href={`/ricerca?q=${encodeURIComponent(cat.query)}`}
                className="flex shrink-0 flex-col items-center gap-1.5"
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${cat.bg} ${cat.text} shadow-sm`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-semibold text-slate-600">{cat.nome}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Divider */}
      <div className="h-2 bg-gray-100" />

      {/* ══════════════════════════════════════════════════════════════════
          NEGOZI IN EVIDENZA — grid 2 col compatta, immagine + info essenziali
      ══════════════════════════════════════════════════════════════════ */}
      <section className="bg-white px-3 py-3 sm:px-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            <MapPin className="mr-1 inline h-3.5 w-3.5 text-blue-600" aria-hidden />
            Negozi vicino a te
          </h2>
          <Link
            href="/negozi"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
          >
            Vedi tutti
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {negozi.map((negozio) => {
            const imageUrl = getNegozioCardImmagine({
              immagine: negozio.immagine,
              categoria: negozio.categoria,
            });

            return (
              <Link
                key={negozio.id}
                href={`/negozio/${negozio.id}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                {/* Immagine — aspect 4/3 */}
                <div className="relative overflow-hidden bg-slate-100" style={{ aspectRatio: "4/3" }}>
                  <div
                    role="img"
                    aria-label={negozio.nome}
                    className="h-full w-full bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                    style={{ backgroundImage: `url(${imageUrl})` }}
                  />
                  {negozio.categoria && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
                      {negozio.categoria}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-col gap-0.5 p-2">
                  <h3 className="truncate text-xs font-bold text-slate-900">
                    {negozio.nome}
                  </h3>
                  {negozio.descrizione && (
                    <p className="line-clamp-2 text-[10px] leading-4 text-slate-500">
                      {negozio.descrizione}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Divider */}
      <div className="h-2 bg-gray-100" />

      {/* ══════════════════════════════════════════════════════════════════
          SEZIONI SUGGERITE — orizzontale scrollabile (stile Booking sezioni)
      ══════════════════════════════════════════════════════════════════ */}
      <section className="bg-white px-3 py-3 sm:px-5">
        <h2 className="mb-3 text-sm font-bold text-slate-900">Esplora per settore</h2>

        <div
          className="flex gap-3 overflow-x-auto pb-2"
          style={{ scrollbarWidth: "none" }}
        >
          {sezioni.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.titolo}
                className={`shrink-0 w-44 rounded-xl border border-slate-100 ${s.bg} p-3 shadow-sm`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 shrink-0 ${s.iconText}`} />
                  <span className="text-xs font-bold text-slate-800 leading-tight">{s.titolo}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {s.ricerche.map((r) => (
                    <Link
                      key={r}
                      href={`/ricerca?q=${encodeURIComponent(r)}`}
                      className="truncate rounded-lg bg-white/70 px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-white hover:text-blue-700"
                    >
                      {r}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom padding for content */}
      <div className="h-6 bg-gray-100" />
    </main>
  );
}
