import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import IntestazionePagina from "@/components/editoriale/IntestazionePagina";
import ProductCard from "@/components/home/ProductCard";
import { getProdottiCatalogoHomepage } from "@/lib/negozi";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import { getSiteUrl } from "@/lib/site";
import { ArrowLeft, Package } from "lucide-react";

// Catalogo prodotti pubblico — NESSUN secondo catalogo: è la stessa pagina
// Prodotti di sempre (stessa query `getProdottiCatalogoHomepage`, stessa scheda
// `ProductCard`), spostata sotto Filiere quando la vecchia /prodotti è stata
// liberata per TerraQ. Immagini, prezzi, descrizioni, negozio, link a
// /prodotto/[slug] e filtri per categoria restano quelli già in uso.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}): Promise<Metadata> {
  const { categoria } = await searchParams;
  const filtro = (categoria ?? "").trim();
  const canonical = `${getSiteUrl()}/filiere/prodotti${filtro ? `?categoria=${encodeURIComponent(filtro)}` : ""}`;
  // title senza suffisso "| Radici Calabria": lo aggiunge il template del layout.
  return {
    title: filtro ? `Prodotti — ${filtro}` : "Prodotti",
    description:
      "Il catalogo dei prodotti delle imprese locali: immagini, prezzi, descrizioni e negozio di provenienza, con le categorie come filtro.",
    alternates: { canonical },
  };
}

/** Etichetta categoria coerente con la vetrina della homepage. */
function testoCategoria(prodotto: Record<string, unknown>) {
  const valore = prodotto.categoria;
  if (typeof valore !== "string" || !valore.trim()) return "Altri prodotti";
  const pulita = valore.trim();
  return pulita.toLocaleLowerCase("it") === "gioiello" ? "Gioielli" : pulita;
}

export default async function ProdottiPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { categoria } = await searchParams;
  const filtroCategoria = (categoria ?? "").trim();

  const [catalogo, statoPreferiti] = await Promise.all([
    getProdottiCatalogoHomepage(1000),
    getStatoPreferitiPerPagina(),
  ]);

  // Conteggio per categoria: le stesse etichette mostrate sulle schede, così il
  // filtro non promette prodotti che poi non compaiono.
  const conteggi = new Map<string, number>();
  for (const prodotto of catalogo) {
    const etichetta = testoCategoria(prodotto);
    conteggi.set(etichetta, (conteggi.get(etichetta) ?? 0) + 1);
  }
  const categorie = Array.from(conteggi.keys()).sort((a, b) => a.localeCompare(b, "it"));

  const filtroValido = categorie.find(
    (etichetta) => etichetta.toLocaleLowerCase("it") === filtroCategoria.toLocaleLowerCase("it")
  );
  const prodotti = filtroValido
    ? catalogo.filter(
        (prodotto) => testoCategoria(prodotto).toLocaleLowerCase("it") === filtroValido.toLocaleLowerCase("it")
      )
    : catalogo;

  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      <IntestazionePagina
        occhiello="Catalogo delle imprese"
        titolo="Prodotti"
        icona={Package}
        sommario="I prodotti dei negozi e delle imprese del territorio, con prezzi e negozio di provenienza."
        azione={
          <Link href="/" className="rd-azione-tenue">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Home
          </Link>
        }
      >

        {/* CATEGORIE = FILTRI del catalogo (nessuna categoria eliminata). */}
        {categorie.length > 0 && (
          <nav
            aria-label="Filtra i prodotti per categoria"
            className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <Link
              href="/filiere/prodotti"
              aria-current={filtroValido ? undefined : "page"}
              className="rd-filtro"
            >
              Tutti ({catalogo.length})
            </Link>
            {categorie.map((etichetta) => {
              const attivo = filtroValido === etichetta;
              return (
                <Link
                  key={etichetta}
                  href={`/filiere/prodotti?categoria=${encodeURIComponent(etichetta)}`}
                  aria-current={attivo ? "page" : undefined}
                  className="rd-filtro"
                >
                  {etichetta} ({conteggi.get(etichetta)})
                </Link>
              );
            })}
            <Link
              href="/categorie"
              className="rd-filtro"
            >
              Tutte le categorie
            </Link>
          </nav>
        )}
      </IntestazionePagina>

      <div className="rd-guscio py-7 md:py-10">
        {prodotti.length === 0 ? (
          <div className="rd-fascia flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f4efe4] ring-1 ring-[#e5ded0]">
              <Package className="h-8 w-8 text-[#8a5a3b]" aria-hidden />
            </div>
            <h2 className="rd-titolo-scheda mt-4 text-lg">
              {filtroValido ? "Nessun prodotto in questa categoria" : "Nessun prodotto disponibile"}
            </h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-[#57534e]">
              {filtroValido
                ? "Prova un'altra categoria o torna al catalogo completo."
                : "I prodotti dei negozi locali saranno visibili qui appena disponibili."}
            </p>
            <Link
              href="/filiere/prodotti"
              className="rd-azione mt-6"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Tutti i prodotti
            </Link>
          </div>
        ) : (
          <>
            <h2 className="sr-only">Catalogo prodotti</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {prodotti.map((prodotto) => {
                const prodottoId = String(prodotto.id);
                return (
                  <ProductCard
                    key={prodottoId}
                    id={prodottoId}
                    slug={(prodotto.slug as string) ?? prodottoId}
                    nome={prodotto.nome as string}
                    descrizione={(prodotto.descrizione as string) ?? null}
                    prezzo={prodotto.prezzo as number}
                    categoria={(prodotto.categoria as string) ?? null}
                    negozio_nome={(prodotto.negozio_nome as string) ?? ""}
                    negozio_id={String(prodotto.negozio_id ?? "")}
                    immagine_principale={(prodotto.immagine_principale as string) ?? null}
                    haVarianti={Boolean(prodotto.ha_varianti)}
                    preferitoAttivo={statoPreferiti.chiavi.has(chiavePreferito("prodotto", prodottoId))}
                    autenticato={statoPreferiti.autenticato}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
