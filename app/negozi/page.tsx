import Header from "@/components/Header/Header";
import { getNegozi } from "@/lib/negozi";
import { negoziDemo } from "@/lib/negozi-demo";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import Link from "next/link";
import { MapPin } from "lucide-react";

export default async function NegoziPage() {
  const negoziDB = await getNegozi();
  const negozi = negoziDB.length > 0 ? negoziDB : negoziDemo;

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5">
        <h1 className="mb-3 text-lg font-black tracking-tight text-slate-900">
          Negozi di Castrovillari
        </h1>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {negozi.map((negozio) => {
            const imageUrl = getNegozioCardImmagine({
              immagine: negozio.immagine,
              categoria: negozio.categoria,
            });

            return (
              <Link
                key={negozio.id}
                href={`/negozio/${negozio.id}`}
                className="group overflow-hidden rounded-xl border border-slate-100 bg-white transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="relative aspect-video overflow-hidden bg-slate-100">
                  <div
                    role="img"
                    aria-label={negozio.nome}
                    className="h-full w-full bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                    style={{ backgroundImage: `url(${imageUrl})` }}
                  />
                  {negozio.categoria && (
                    <span className="absolute bottom-1 left-1.5 rounded-full bg-black/55 px-1.5 py-px text-[9px] font-semibold text-white backdrop-blur-sm">
                      {negozio.categoria}
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <h2 className="truncate text-xs font-bold text-slate-900">
                    {negozio.nome}
                  </h2>
                  {negozio.indirizzo && (
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                      <MapPin className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{negozio.indirizzo}</span>
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
