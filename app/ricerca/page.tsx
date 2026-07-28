import Header from "@/components/Header/Header";
import SearchForm from "@/components/home/SearchForm";
import { OpenAssistantButton, OpenAssistantLink } from "@/components/assistant/OpenAssistantButton";
import { cercaNegozi } from "@/lib/negozi";
import { cercaProdotti } from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { search } from "@/lib/search-service";
import type { ProdottoRicerca, NegozioRicerca } from "@/lib/ricerca-ai";
import Link from "next/link";
import { Sparkles, MapPin, Phone } from "lucide-react";

export default async function RicercaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termine = q?.trim() ?? "";

  let prodotti: ProdottoRicerca[] = [];
  let negozi: NegozioRicerca[] = [];
  let rispostaAi: string | null = null;
  let erroreAi: string | null = null;

  if (termine) {
    [prodotti, negozi] = await Promise.all([
      cercaProdotti(termine),
      cercaNegozi(termine),
    ]);

    try {
      const result = await search(termine);
      rispostaAi = result.risposta;
      if (prodotti.length === 0 && result.prodotti.length > 0) {
        prodotti = result.prodotti;
      }
      if (negozi.length === 0 && result.negozi.length > 0) {
        negozi = result.negozi;
      }
    } catch (error) {
      erroreAi =
        error instanceof Error
          ? error.message
          : "Impossibile generare la risposta AI.";
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5">
        {/* Barra ricerca */}
        <div className="mb-3">
          <SearchForm initialQuery={termine} compact />
        </div>

        {termine ? (
          <>
            {/* Conteggio risultati */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">
                <span className="font-bold">{prodotti.length + negozi.length}</span> risultati per{" "}
                <span className="font-bold text-blue-700">&ldquo;{termine}&rdquo;</span>
              </span>
              <OpenAssistantButton label="Chiedi all'AI" />
            </div>

            {/* ═══ PRODOTTI ═══ */}
            {prodotti.length > 0 && (
              <section className="mb-4">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Prodotti ({prodotti.length})
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {prodotti.map((prodotto) => (
                    <Link
                      key={prodotto.id}
                      href={`/prodotto/${prodotto.id}`}
                      className="group overflow-hidden rounded-xl border border-slate-100 bg-white transition hover:border-blue-200 hover:shadow-md"
                    >
                      <div className="relative aspect-square overflow-hidden bg-slate-100">
                        <div
                          role="img"
                          aria-label={prodotto.nome}
                          className="h-full w-full bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                          style={{
                            backgroundImage: `url(${getProdottoImmagine({
                              immagine_principale: prodotto.immagine_principale,
                              categoria: prodotto.categoria,
                            })})`,
                          }}
                        />
                      </div>
                      <div className="p-2">
                        <h3 className="line-clamp-2 text-xs font-bold leading-tight text-slate-900">
                          {prodotto.nome}
                        </h3>
                        <p className="mt-0.5 text-sm font-black text-blue-700">
                          €{prodotto.prezzo}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">
                          {prodotto.negozio_nome}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* ═══ NEGOZI ═══ */}
            {negozi.length > 0 && (
              <section className="mb-4">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Negozi ({negozi.length})
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {negozi.map((negozio) => (
                    <Link
                      key={negozio.id}
                      href={`/negozio/${negozio.id}`}
                      className="group flex gap-3 overflow-hidden rounded-xl border border-slate-100 bg-white p-2.5 transition hover:border-blue-200 hover:shadow-sm"
                    >
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        <div
                          role="img"
                          aria-label={negozio.nome}
                          className="h-full w-full bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                          style={{
                            backgroundImage: `url(${getNegozioCardImmagine({
                              immagine: negozio.immagine,
                              categoria: negozio.categoria,
                            })})`,
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-bold text-slate-900">
                          {negozio.nome}
                        </h3>
                        {negozio.categoria && (
                          <p className="text-[10px] font-semibold text-blue-600">
                            {negozio.categoria}
                          </p>
                        )}
                        {negozio.indirizzo && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{negozio.indirizzo}</span>
                          </p>
                        )}
                        {negozio.telefono && (
                          <p className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span>{negozio.telefono}</span>
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Nessun risultato */}
            {prodotti.length === 0 && negozi.length === 0 && !rispostaAi && !erroreAi && (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-500">
                  Nessun risultato trovato per &ldquo;{termine}&rdquo;.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Prova con termini diversi o chiedi all&apos;AI.
                </p>
              </div>
            )}

            {/* Errore AI */}
            {erroreAi && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">Assistente AI non disponibile</p>
                <p className="mt-1 text-xs">{erroreAi}</p>
              </div>
            )}

            {/* ═══ CONSIGLI AI ═══ */}
            {rispostaAi && (
              <section className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Consigli AI
                  </h2>
                </div>
                <div className="rounded-xl border border-blue-100 bg-white p-3">
                  <div className="prose prose-sm prose-slate max-w-none prose-headings:text-sm prose-headings:font-bold prose-p:text-xs prose-li:text-xs">
                    {rispostaAi.split("\n").map((line, i) => (
                      <p key={i} className="text-xs leading-5 text-slate-700">
                        {line}
                      </p>
                    ))}
                  </div>
                  <OpenAssistantLink label="Approfondisci con l'AI" />
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-500">
              Inserisci un termine nella barra di ricerca.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
