import Header from "@/components/Header/Header";
import SearchForm from "@/components/home/SearchForm";
import CategoriaShowcaseView from "@/components/categoria/CategoriaShowcaseView";
import { OpenAssistantButton } from "@/components/assistant/OpenAssistantButton";
import { cercaNegozi, cercaProdotti, getCategoriaShowcase } from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import type { ProdottoRicerca, NegozioRicerca } from "@/lib/ricerca-ai";
import type { CategoriaShowcase } from "@/lib/negozi";
import Link from "next/link";
import { MapPin, Phone } from "lucide-react";

export default async function RicercaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string }>;
}) {
  const { q, categoria: categoriaSlug } = await searchParams;
  const termine = q?.trim() ?? "";

  let prodotti: ProdottoRicerca[] = [];
  let negozi: NegozioRicerca[] = [];
  let categoriaShowcase: CategoriaShowcase | null = null;

  // Stato preferiti per i pulsanti cuore: una sola chiamata per pagina
  // (Set di chiavi), nessuna richiesta per singola card.
  const statoPreferiti = await getStatoPreferitiPerPagina();

  // Vetrina categoria: pagina dedicata (header + card + empty state),
  // 3 query SQL, zero N+1 — nessuna ricerca testuale.
  if (categoriaSlug) {
    categoriaShowcase = await getCategoriaShowcase(categoriaSlug);
  } else if (termine) {
    // Ricerca NORMALE = solo database (negozi + prodotti attivi, ranking
    // tollerante con sinonimi/refusi). Nessuna chiamata AI: l'Assistente
    // Gemini parte SOLO con il pulsante esplicito qui sotto.
    [prodotti, negozi] = await Promise.all([
      cercaProdotti(termine),
      cercaNegozi(termine),
    ]);
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
            {prodotti.length === 0 && negozi.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-500">
                  Nessun risultato trovato per &ldquo;{termine}&rdquo;.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Prova con termini diversi o chiedi all&apos;AI.
                </p>
              </div>
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
