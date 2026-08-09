import Header from "@/components/Header/Header";
import SearchForm from "@/components/home/SearchForm";
import CategoriaShowcaseView from "@/components/categoria/CategoriaShowcaseView";
import { OpenAssistantButton, OpenAssistantLink } from "@/components/assistant/OpenAssistantButton";
import { cercaNegozi, cercaProdotti, getCategoriaShowcase } from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import { search } from "@/lib/search-service";
import type { ProdottoRicerca, NegozioRicerca } from "@/lib/ricerca-ai";
import type { CategoriaShowcase } from "@/lib/negozi";
import Link from "next/link";
import { Sparkles, MapPin, Phone } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renderizza la risposta AI in markdown (come nella chat assistente): i link
// eventualmente presenti nel testo diventano cliccabili e la formattazione
// (grassetti, elenchi) viene rispettata invece di mostrare righe piatte.
function RispostaAiMarkdown({ testo }: { testo: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h3 className="mt-3 text-sm font-black tracking-tight text-slate-950 first:mt-0">{children}</h3>
        ),
        h2: ({ children }) => (
          <h3 className="mt-3 text-sm font-black tracking-tight text-slate-950 first:mt-0">{children}</h3>
        ),
        h3: ({ children }) => (
          <h4 className="mt-2 text-sm font-bold text-slate-900 first:mt-0">{children}</h4>
        ),
        p: ({ children }) => (
          <p className="mt-2 text-xs leading-5 text-slate-700 first:mt-0">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-700">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-slate-700">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-xs leading-5 text-slate-700">{children}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-extrabold text-slate-950">{children}</strong>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 transition hover:text-blue-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
      }}
    >
      {testo}
    </ReactMarkdown>
  );
}

export default async function RicercaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string }>;
}) {
  const { q, categoria: categoriaSlug } = await searchParams;
  const termine = q?.trim() ?? "";

  let prodotti: ProdottoRicerca[] = [];
  let negozi: NegozioRicerca[] = [];
  let rispostaAi: string | null = null;
  let erroreAi: string | null = null;
  let categoriaShowcase: CategoriaShowcase | null = null;

  // Stato preferiti per i pulsanti cuore: una sola chiamata per pagina
  // (Set di chiavi), nessuna richiesta per singola card.
  const statoPreferiti = await getStatoPreferitiPerPagina();

  // Vetrina categoria: pagina dedicata (header + card + empty state),
  // 3 query SQL, zero N+1 — nessuna ricerca testuale.
  if (categoriaSlug) {
    categoriaShowcase = await getCategoriaShowcase(categoriaSlug);
  } else if (termine) {
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

        {categoriaShowcase ? (
          /* ═══ VETRINA CATEGORIA ═══ */
          <CategoriaShowcaseView
            showcase={categoriaShowcase}
            chiaviPreferiti={statoPreferiti.chiavi}
            autenticato={statoPreferiti.autenticato}
          />
        ) : termine ? (
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
                    <div
                      key={prodotto.id}
                      className="relative overflow-hidden rounded-xl border border-slate-100 bg-white transition hover:border-blue-200 hover:shadow-sm"
                    >
                      <Link
                        href={`/prodotto/${prodotto.slug}`}
                        className="group block"
                      >
                        <div className="relative aspect-square overflow-hidden bg-slate-100">
                          <div
                            role="img"
                            aria-label={prodotto.nome}
                            className="h-full w-full bg-cover bg-center"
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
                      <FavoritoButton
                        tipo="prodotto"
                        riferimentoId={prodotto.id}
                        attivo={statoPreferiti.chiavi.has(chiavePreferito("prodotto", prodotto.id))}
                        autenticato={statoPreferiti.autenticato}
                        className="absolute right-2 top-2 z-10"
                        label={prodotto.nome}
                      />
                    </div>
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
                    <div
                      key={negozio.id}
                      className="relative flex gap-3 overflow-hidden rounded-xl border border-slate-100 bg-white p-2.5 transition hover:border-blue-200 hover:shadow-sm"
                    >
                      <Link
                        href={`/negozio/${negozio.slug}`}
                        className="group flex min-w-0 flex-1 gap-3"
                      >
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          <div
                            role="img"
                            aria-label={negozio.nome}
                            className="h-full w-full bg-cover bg-center"
                            style={{
                              backgroundImage: `url(${getNegozioCardImmagine({
                                logo_url: negozio.logo_url,
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
                      <FavoritoButton
                        tipo="negozio"
                        riferimentoId={negozio.id}
                        attivo={statoPreferiti.chiavi.has(chiavePreferito("negozio", negozio.id))}
                        autenticato={statoPreferiti.autenticato}
                        className="absolute right-2 top-2 z-10"
                        label={negozio.nome}
                      />
                    </div>
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
                    <RispostaAiMarkdown testo={rispostaAi} />
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
