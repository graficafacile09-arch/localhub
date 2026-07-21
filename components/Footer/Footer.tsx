import Link from "next/link";
import { LayoutGrid, MapPin, Search, Store } from "lucide-react";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/negozi", label: "Negozi" },
  { href: "/#categorie", label: "Categorie" },
  { href: "/ricerca", label: "Cerca" },
];

const quickSearches = ["Ristorante", "Parrucchiere", "Farmacia", "Palestra"];

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-blue-800/20 bg-[linear-gradient(180deg,#0f172a_0%,#1d4ed8_100%)] text-slate-200">
      <div className="h-1 bg-linear-to-r from-cyan-300 via-white to-yellow-300" />

      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
              <MapPin className="h-4 w-4" />
              LocalHub
            </div>
            <h2 className="mt-4 text-2xl font-black text-white">
              Cerca e acquista nella tua città
            </h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-slate-300">
              Trova negozi, attività, servizi e professionisti locali con categorie ordinate, fotografie curate e ricerca veloce.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">
              Navigazione
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">
              Ricerche rapide
            </h3>
            <div className="mt-4 flex flex-wrap gap-3">
              {quickSearches.map((item) => (
                <Link
                  key={item}
                  href={`/ricerca?q=${encodeURIComponent(item)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-white"
                >
                  <Search className="h-4 w-4" />
                  {item}
                </Link>
              ))}
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
              <Store className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p>Portale locale con vetrine, categorie, contatti e percorsi di ricerca rapidi.</p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-5 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
          <p>© 2026 LocalHub. Tutti i diritti riservati.</p>
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            <span>Marketplace locale per negozi, servizi e professionisti.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
