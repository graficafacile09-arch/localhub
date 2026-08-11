import Header from "@/components/Header/Header";
import SearchForm from "@/components/home/SearchForm";
import CategoriaShowcaseView from "@/components/categoria/CategoriaShowcaseView";
import { OpenAssistantButton } from "@/components/assistant/OpenAssistantButton";
import SearchFilters, { FILTRI_VUOTI } from "@/components/ricerca/SearchFilters";
import SearchSort from "@/components/ricerca/SearchSort";
import SearchPagination from "@/components/ricerca/SearchPagination";
import { getCategoriaShowcase, getFiltriDisponibiliProdotti, isOrdinamentoProdottiPubblici, type OrdinamentoProdottiPubblici } from "@/lib/negozi";
import { search } from "@/lib/search-service";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import type { ProdottoRicerca, NegozioRicerca } from "@/lib/ricerca-ai";
import type { CategoriaShowcase } from "@/lib/negozi";
import Link from "next/link";
import { MapPin, Phone, SlidersHorizontal } from "lucide-react";

const PER_PAGINA = 12;

function parseNum(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return !Number.isNaN(n) && n > 0 ? n : undefined;
}

export default async function RicercaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  };

  const termine = get("q").trim();
  const categoria = get("categoria").trim();
  const sottocategoria = get("sottocategoria").trim();
  const marca = get("marca").trim();
  const colore = get("colore").trim();
  const prezzoMin = parseNum(get("prezzo_min"));
  const prezzoMax = parseNum(get("prezzo_max"));
  const soloDisponibili = get("disponibile") === "1";
  const ordina: OrdinamentoProdottiPubblici = isOrdinamentoProdottiPubblici(get("ordina"))
    ? get("ordina") as OrdinamentoProdottiPubblici
    : "rilevanza";
  const pagina = Math.max(1, Number.parseInt(get("pagina"), 10) || 1);

  const statoPreferiti = await getStatoPreferitiPerPagina();

  // Vetrina categoria (backward compat): /ricerca?categoria=<slug> da sola,
  // senza testo né altri filtri → pagina vetrina come prima.
  const haFiltriExtra = Boolean(
    sottocategoria || marca || colore ||
    prezzoMin !== undefined || prezzoMax !== undefined ||
    soloDisponibili || ordina !== "rilevanza" || pagina > 1
  );
  let usaVetrina = Boolean(categoria) && !termine && !haFiltriExtra;
  let categoriaShowcase: CategoriaShowcase | null = null;
  if (usaVetrina) {
    categoriaShowcase = await getCategoriaShowcase(categoria);
    if (!categoriaShowcase?.categoria) usaVetrina = false;
  }

  const ricercaAttiva = Boolean(
    termine || categoria || sottocategoria || marca || colore ||
    prezzoMin !== undefined || prezzoMax !== undefined || soloDisponibili
  );

  let prodotti: ProdottoRicerca[] = [];
  let negozi: NegozioRicerca[] = [];
  let total = 0;

  if (!usaVetrina && ricercaAttiva) {
    const risultato = await search(termine, {
      categoria: categoria || undefined,
      sottocategoria: sottocategoria || undefined,
      marca: marca || undefined,
      colore: colore || undefined,
      prezzoMin,
      prezzoMax,
      soloDisponibili: soloDisponibili || undefined,
      ordina,
      pagina,
      perPagina: PER_PAGINA,
    });
    prodotti = risultato.prodotti;
    negozi = risultato.negozi;
    total = risultato.total;
  }

  const disponibili = ricercaAttiva && !usaVetrina
    ? await getFiltriDisponibiliProdotti()
    : FILTRI_VUOTI;

  const filtriCorrenti = {
    q: termine,
    categoria: categoria || undefined,
    sottocategoria: sottocategoria || undefined,
    marca: marca || undefined,
    colore: colore || undefined,
    prezzoMin: prezzoMin !== undefined ? String(prezzoMin) : undefined,
    prezzoMax: prezzoMax !== undefined ? String(prezzoMax) : undefined,
    soloDisponibili: soloDisponibili || undefined,
  };

  const paramsPaginazione: Record<string, string | undefined> = {
    q: termine || undefined,
    categoria: categoria || undefined,
    sottocategoria: sottocategoria || undefined,
    marca: marca || undefined,
    colore: colore || undefined,
    prezzo_min: prezzoMin !== undefined ? String(prezzoMin) : undefined,
    prezzo_max: prezzoMax !== undefined ? String(prezzoMax) : undefined,
    disponibile: soloDisponibili ? "1" : undefined,
    ordina: ordina === "rilevanza" ? undefined : ordina,
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5">
        {/* Barra ricerca — SEMPRE utilizzabile (form GET nativo verso /ricerca?q=) */}
        <div className="mb-3">
          <SearchForm initialQuery={termine} />
        </div>

        {usaVetrina && categoriaShowcase ? (
          /* ═══ VETRINA CATEGORIA (comportamento storico) ═══ */
          <CategoriaShowcaseView
            showcase={categoriaShowcase}
            chiaviPreferiti={statoPreferiti.chiavi}
            autenticato={statoPreferiti.autenticato}
          />
        ) : ricercaAttiva ? (
          <div className="lg:grid lg:grid-cols-[250px,1fr] lg:gap-5">
            {/* Sidebar filtri (desktop) */}
            <aside className="hidden lg:block">
              <div className="sticky top-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <SearchFilters current={filtriCorrenti} disponibili={disponibili} />
              </div>
            </aside>

            <div className="min-w-0">
              {/* Pannello filtri (mobile) */}
              <details className="mb-3 rounded-xl border border-slate-200 bg-white shadow-sm lg:hidden">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-slate-700 [&::-webkit-details-marker]:hidden">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
                  Filtri
                  <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-600">
                    {[categoria, sottocategoria, marca, colore, prezzoMin !== undefined ? "min" : null, prezzoMax !== undefined ? "max" : null, soloDisponibili ? "disp" : null].filter(Boolean).length}
                  </span>
                </summary>
                <div className="border-t border-slate-100 p-3">
                  <SearchFilters current={filtriCorrenti} disponibili={disponibili} />
                </div>
              </details>

              {/* Conteggio + ordinamento */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-slate-600">
                  <span className="font-bold">{total}</span>{" "}
                  {total === 1 ? "prodotto" : "prodotti"}
                  {termine && (
                    <> per <span className="font-bold text-blue-700">&ldquo;{termine}&rdquo;</span></>
                  )}
                  {negozi.length > 0 && (
                    <> · <span className="font-bold">{negozi.length}</span> {negozi.length === 1 ? "negozio" : "negozi"}</>
                  )}
                </span>
                <SearchSort basePath="/ricerca" value={ordina} />
              </div>

              {/* ═══ PRODOTTI ═══ */}
              {prodotti.length > 0 ? (
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
                        <Link href={`/prodotto/${prodotto.slug}`} className="group block">
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
              ) : (
                <div className="rounded-xl border border-slate-100 bg-white p-8 text-center">
                  <p className="text-sm font-semibold text-slate-600">
                    Nessun prodotto trovato con questi filtri.
                  </p>
                  <a
                    href={termine ? `/ricerca?q=${encodeURIComponent(termine)}` : "/ricerca"}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 transition hover:text-blue-700"
                  >
                    Azzera i filtri
                  </a>
                </div>
              )}

              {/* ═══ NEGOZI (solo ricerca base senza filtri) ═══ */}
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
                        <Link href={`/negozio/${negozio.slug}`} className="group flex min-w-0 flex-1 gap-3">
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

              {/* Paginazione prodotti */}
              <SearchPagination
                basePath="/ricerca"
                params={paramsPaginazione}
                pagina={pagina}
                totale={total}
                perPagina={PER_PAGINA}
              />

              {/* Invito AI solo quando non ci sono risultati */}
              {prodotti.length === 0 && negozi.length === 0 && (
                <div className="mt-2 flex justify-center">
                  <OpenAssistantButton label="Chiedi all'AI" />
                </div>
              )}
            </div>
          </div>
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
