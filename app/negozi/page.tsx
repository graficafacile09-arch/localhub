import Header from "@/components/Header/Header";
import { getNegozi, getNegoziInEvidenza } from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import { getImpostazioniPubbliche } from "@/lib/platform/settings";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import Link from "next/link";
import { ArrowLeft, MapPin, Star } from "lucide-react";

export default async function NegoziPage({
  searchParams,
}: {
  searchParams: Promise<{ featured?: string }>;
}) {
  const { featured } = await searchParams;
  const soloEvidenziati = featured === "1";

  const impostazioni = await getImpostazioniPubbliche();
  const citta = impostazioni.city_name?.trim() || "Castrovillari";

  // /negozi?featured=1 → solo negozi in evidenza (2 query, zero N+1);
  // altrimenti tutti i negozi attivi (comportamento attuale invariato).
  const negozi = soloEvidenziati
    ? await getNegoziInEvidenza()
    : await getNegozi();

  // Stato preferiti per i pulsanti cuore: una sola chiamata per pagina.
  const statoPreferiti = await getStatoPreferitiPerPagina();

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5">
        <h1 className="mb-3 text-3xl font-black tracking-tight text-slate-900">
          {soloEvidenziati ? "⭐ Negozi in evidenza" : `Negozi di ${citta}`}
        </h1>

        {soloEvidenziati && negozi.length === 0 ? (
          /* Empty State professionale: nessun negozio evidenziato */
          <div className="flex flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white px-6 py-16 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
              <Star className="h-8 w-8 text-blue-500" />
            </div>
            <h2 className="mt-4 text-lg font-black tracking-tight text-slate-900">
              Nessun negozio in evidenza
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Al momento non ci sono negozi in evidenza. Esplora tutte le attività della tua città.
            </p>
            <Link
              href="/negozi"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-yellow-400 hover:text-blue-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Vedi tutti i negozi
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {negozi.map((negozio) => {
              const imageUrl = getNegozioCardImmagine({
                logo_url: negozio.logo_url,
                categoria: negozio.categoria,
              });

              return (
                <div
                  key={negozio.id}
                  className="relative overflow-hidden rounded-xl border border-slate-100 bg-white transition hover:border-blue-200 hover:shadow-sm"
                >
                  <Link
                    href={`/negozio/${negozio.slug}`}
                    className="group block"
                  >
                    <div className="relative aspect-video overflow-hidden bg-slate-100">
                      <div
                        role="img"
                        aria-label={negozio.nome}
                        className="h-full w-full bg-cover bg-center"
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
                  <FavoritoButton
                    tipo="negozio"
                    riferimentoId={negozio.id}
                    attivo={statoPreferiti.chiavi.has(chiavePreferito("negozio", negozio.id))}
                    autenticato={statoPreferiti.autenticato}
                    className="absolute right-2 top-2 z-10"
                    label={negozio.nome}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
