import Header from "@/components/Header/Header";
import SearchForm from "@/components/home/SearchForm";
import CategoriaShowcaseView from "@/components/categoria/CategoriaShowcaseView";
import { getCategoriaShowcase, getFiltriDisponibiliProdotti, isOrdinamentoProdottiPubblici, type OrdinamentoProdottiPubblici } from "@/lib/negozi";
import { search } from "@/lib/search-service";
import { prodottoEsaurito } from "@/lib/prodotti-disponibilita";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import type { ProdottoRicerca, NegozioRicerca } from "@/lib/ricerca-ai";
import type { CategoriaShowcase } from "@/lib/negozi";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site";
import Link from "next/link";
import { MapPin, Phone, SlidersHorizontal } from "lucide-react";
import { SearchResultsWithPino } from "@/components/ricerca/SearchResultsWithPino";

const PER_PAGINA = 12;

function parseNum(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return !Number.isNaN(n) && n > 0 ? n : undefined;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  };

  const termine = get("q").trim();
  const categoria = get("categoria").trim();
  const haFiltriTecnici = Boolean(
    get("sottocategoria").trim() ||
      get("marca").trim() ||
      get("colore").trim() ||
      parseNum(get("prezzo_min")) !== undefined ||
      parseNum(get("prezzo_max")) !== undefined ||
      get("disponibile") === "1"
  );
  const ordina = isOrdinamentoProdottiPubblici(get("ordina"))
    ? get("ordina")
    : "rilevanza";
  const pagina = Math.max(1, Number.parseInt(get("pagina"), 10) || 1);
  const soloOrdina = ordina !== "rilevanza";

  const usaVetrina =
    Boolean(categoria) && !termine && !haFiltriTecnici && !soloOrdina && pagina <= 1;
  if (usaVetrina) {
    return {
      title: "Ricerca",
      alternates: {
        canonical: `${getSiteUrl()}/categorie/${encodeURIComponent(categoria)}`,
      },
      robots: { index: true, follow: true },
    };
  }

  const soloParametriTecnici =
    !termine && !categoria && (haFiltriTecnici || soloOrdina);
  const indicizzabile = !soloParametriTecnici && pagina <= 1;

  const parametriCanonici = new URLSearchParams();
  if (termine) parametriCanonici.set("q", termine);
  if (categoria) parametriCanonici.set("categoria", categoria);
  const qs = parametriCanonici.toString();
  const canonical = `${getSiteUrl()}/ricerca${qs ? `?${qs}` : ""}`;

  return {
    title: termine ? `Ricerca: ${termine}` : "Ricerca",
    description: termine
      ? `Risultati per &ldquo;${termine}&rdquo; nei negozi e nei prodotti di InCitt&agrave;.`
      : "Cerca negozi, prodotti e servizi della tua citt&agrave; su InCitt&agrave;.",
    alternates: { canonical },
    robots: { index: indicizzabile, follow: true },
  };
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
    : { categorie: [], sottocategorie: [], marche: [], colori: [], prezzoMin: null, prezzoMax: null };

  const filtriCorrenti = {
    q: termine,
    categoria: categoria || undefined,
    sottocategoria: sottocategoria || undefined,
    marca: marca || undefined,
    colore: colore || undefined,
    prezzoMin: prezzoMin !== undefined ? String(prezzoMin) : undefined,
    prezzoMax: prezzoMax !== undefined ? String(prezzoMax) : undefined,
    soloDisponibili: soloDisponibili ? "1" : undefined,
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
        <div className="mb-3">
          <SearchForm initialQuery={termine} />
        </div>

        {usaVetrina && categoriaShowcase ? (
          <CategoriaShowcaseView
            showcase={categoriaShowcase}
            chiaviPreferiti={statoPreferiti.chiavi}
            autenticato={statoPreferiti.autenticato}
          />
        ) : (
          <>
            <h1 className="mb-3 text-3xl font-black tracking-tight text-slate-900">
              Ricerca
            </h1>
            {ricercaAttiva ? (
              <SearchResultsWithPino
                initialTermine={termine}
                initialCategoria={categoria}
                initialSottocategoria={sottocategoria}
                initialMarca={marca}
                initialColore={colore}
                initialPrezzoMin={prezzoMin}
                initialPrezzoMax={prezzoMax}
                initialSoloDisponibili={soloDisponibili}
                initialOrdina={ordina}
                initialPagina={pagina}
                initialProdotti={prodotti}
                initialNegozi={negozi}
                initialTotal={total}
                initialDisponibili={disponibili}
                initialFiltriCorrenti={filtriCorrenti}
                initialParamsPaginazione={paramsPaginazione}
                statoPreferiti={statoPreferiti}
              />
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-500">
                  Inserisci un termine nella barra di ricerca.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}