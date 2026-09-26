"use client";

import { useState, useEffect, useRef } from "react";
import { PinoAssistant } from "./PinoAssistant";
import SearchFilters, { FILTRI_VUOTI, type FiltriCorrenti } from "./SearchFilters";
import SearchSort from "./SearchSort";
import SearchPagination from "./SearchPagination";
import { getFiltriDisponibiliProdotti, isOrdinamentoProdottiPubblici, type OrdinamentoProdottiPubblici } from "@/lib/negozi";
import { prodottoEsaurito } from "@/lib/prodotti-disponibilita";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import type { ProdottoRicerca, NegozioRicerca } from "@/lib/ricerca-ai";
import type { CategoriaShowcase } from "@/lib/negozi";
import Link from "next/link";
import { MapPin, Phone, SlidersHorizontal } from "lucide-react";

const PER_PAGINA = 12;

function chiavePreferito(tipo: string, riferimentoId: string): string {
  return `${tipo}:${riferimentoId}`;
}

interface SearchResultsWithPinoProps {
  initialTermine: string;
  initialCategoria: string;
  initialSottocategoria: string;
  initialMarca: string;
  initialColore: string;
  initialPrezzoMin: number | undefined;
  initialPrezzoMax: number | undefined;
  initialSoloDisponibili: boolean;
  initialOrdina: OrdinamentoProdottiPubblici;
  initialPagina: number;
  initialProdotti: ProdottoRicerca[];
  initialNegozi: NegozioRicerca[];
  initialTotal: number;
  initialDisponibili: typeof FILTRI_VUOTI;
  initialFiltriCorrenti: {
    q: string;
    categoria: string | undefined;
    sottocategoria: string | undefined;
    marca: string | undefined;
    colore: string | undefined;
    prezzoMin: string | undefined;
    prezzoMax: string | undefined;
    soloDisponibili: string | undefined;
  };
  initialParamsPaginazione: Record<string, string | undefined>;
  statoPreferiti: { chiavi: Set<string>; autenticato: boolean };
}

export function SearchResultsWithPino({
  initialTermine,
  initialCategoria,
  initialSottocategoria,
  initialMarca,
  initialColore,
  initialPrezzoMin,
  initialPrezzoMax,
  initialSoloDisponibili,
  initialOrdina,
  initialPagina,
  initialProdotti,
  initialNegozi,
  initialTotal,
  initialDisponibili,
  initialFiltriCorrenti,
  initialParamsPaginazione,
  statoPreferiti,
}: SearchResultsWithPinoProps) {
  const [pinoState, setPinoState] = useState<"idle" | "searching" | "happy" | "sad">("idle");
  const [prodotti, setProdotti] = useState(initialProdotti);
  const [negozi, setNegozi] = useState(initialNegozi);
  const [total, setTotal] = useState(initialTotal);
  const [pagina, setPagina] = useState(initialPagina);
  const [ordina, setOrdina] = useState<OrdinamentoProdottiPubblici>(initialOrdina);
  const [disponibili, setDisponibili] = useState(initialDisponibili);
  const [filtriCorrenti, setFiltriCorrenti] = useState<FiltriCorrenti>(initialFiltriCorrenti);
  const [paramsPaginazione, setParamsPaginazione] = useState(initialParamsPaginazione);
  const [isLoading, setIsLoading] = useState(false);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    hasMountedRef.current = true;
    if (initialTermine || initialCategoria) {
      setPinoState("searching");
      const timer = setTimeout(() => {
        if (initialProdotti.length > 0 || initialNegozi.length > 0) {
          setPinoState("happy");
        } else {
          setPinoState("sad");
        }
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setPinoState("idle");
    }
  }, [initialTermine, initialCategoria, initialProdotti.length, initialNegozi.length]);

  const handleSearch = async (newFiltri: FiltriCorrenti) => {
    setIsLoading(true);
    setPinoState("searching");
    setFiltriCorrenti(newFiltri);

    const searchParams = new URLSearchParams();
    if (newFiltri.q) searchParams.set("q", newFiltri.q);
    if (newFiltri.categoria) searchParams.set("categoria", newFiltri.categoria);
    if (newFiltri.sottocategoria) searchParams.set("sottocategoria", newFiltri.sottocategoria);
    if (newFiltri.marca) searchParams.set("marca", newFiltri.marca);
    if (newFiltri.colore) searchParams.set("colore", newFiltri.colore);
    if (newFiltri.prezzoMin) searchParams.set("prezzo_min", newFiltri.prezzoMin);
    if (newFiltri.prezzoMax) searchParams.set("prezzo_max", newFiltri.prezzoMax);
    if (newFiltri.soloDisponibili) searchParams.set("disponibile", "1");

    try {
      const response = await fetch(`/api/ricerca?${searchParams.toString()}`);
      const data = await response.json();
      setProdotti(data.prodotti || []);
      setNegozi(data.negozi || []);
      setTotal(data.total || 0);
      setPagina(1);
      
      setTimeout(() => {
        if ((data.prodotti?.length || 0) > 0 || (data.negozi?.length || 0) > 0) {
          setPinoState("happy");
        } else {
          setPinoState("sad");
        }
      }, 600);
    } catch {
      setPinoState("sad");
    } finally {
      setIsLoading(false);
    }
  };

  const queryForPino = initialTermine || initialCategoria || "ricerca";

  return (
    <div className="lg:grid lg:grid-cols-[250px,1fr] lg:gap-5">
      <aside className="hidden lg:block">
        <div className="sticky top-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <SearchFilters
            current={filtriCorrenti}
            disponibili={disponibili}
            onChange={handleSearch}
            isLoading={isLoading}
          />
        </div>
      </aside>

      <div className="min-w-0 relative">
        <div className="absolute top-0 right-0 w-48 sm:w-56 md:w-64 pointer-events-none" aria-hidden="true">
          <PinoAssistant state={pinoState} query={queryForPino} />
        </div>

        <details className="mb-3 rounded-xl border border-slate-200 bg-white shadow-sm lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-slate-700 [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
            Filtri
            <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-600">
              {[initialCategoria, initialSottocategoria, initialMarca, initialColore, initialPrezzoMin !== undefined ? "min" : null, initialPrezzoMax !== undefined ? "max" : null, initialSoloDisponibili ? "disp" : null].filter(Boolean).length}
            </span>
          </summary>
          <div className="border-t border-slate-100 p-3">
            <SearchFilters
              current={filtriCorrenti}
              disponibili={disponibili}
              onChange={handleSearch}
              isLoading={isLoading}
            />
          </div>
        </details>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-600">
            <span className="font-bold">{total}</span>{" "}
            {total === 1 ? "prodotto" : "prodotti"}
            {initialTermine && (
              <> per <span className="font-bold text-blue-700">&ldquo;{initialTermine}&rdquo;</span></>
            )}
            {negozi.length > 0 && (
              <> · <span className="font-bold">{negozi.length}</span> {negozi.length === 1 ? "negozio" : "negozi"}</>
            )}
          </span>
          <SearchSort basePath="/ricerca" value={ordina} onChange={(v) => {
            setOrdina(v);
            const newParams = { ...paramsPaginazione, ordina: v === "rilevanza" ? undefined : v, pagina: undefined };
            setParamsPaginazione(newParams);
            handleSearch({ ...filtriCorrenti, ordina: v });
          }} />
        </div>

        {prodotti.length > 0 ? (
          <section className="mb-4">
            <h2 className="mb-2 text-lg font-black tracking-tight text-slate-900">
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
                      {prodottoEsaurito(prodotto.quantita_disponibile, prodotto.quantita_riservata) && (
                        <span className="absolute inset-x-0 bottom-0 bg-blue-600/90 py-1 text-center text-[9px] font-black uppercase tracking-wider text-white">
                          Esaurito
                        </span>
                      )}
                    </div>
                    <div className="p-2">
                      <h3 className="line-clamp-2 text-xs font-bold leading-tight text-slate-900">
                        {prodotto.nome}
                      </h3>
                      <p className="mt-0.5 text-sm font-black text-blue-700">
                        {prodotto.ha_varianti ? "Da " : ""}€{prodotto.prezzo}
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
              href={initialTermine ? `/ricerca?q=${encodeURIComponent(initialTermine)}` : "/ricerca"}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 transition hover:text-blue-700"
            >
              Azzera i filtri
            </a>
          </div>
        )}

        {negozi.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 text-lg font-black tracking-tight text-slate-900">
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

        <SearchPagination
          basePath="/ricerca"
          params={paramsPaginazione}
          pagina={pagina}
          totale={total}
          perPagina={PER_PAGINA}
        />
      </div>
    </div>
  );
}