import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import IntestazionePagina from "@/components/editoriale/IntestazionePagina";
import ProductCard from "@/components/home/ProductCard";
import { getProdottiOfferta } from "@/lib/negozi";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import { getSiteUrl } from "@/lib/site";
import Link from "next/link";
import { ArrowLeft, Tag } from "lucide-react";

// Pagina pubblica che elenca TUTTI i prodotti in offerta. I prodotti sono
// normalissimi prodotti del catalogo dei negozi, con flag prodotto_offerta =
// true: il click apre la stessa pagina /prodotto/[slug] già esistente, con
// le normali logiche di acquisto (varianti, stock, carrello, checkout).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = `${getSiteUrl()}/offerte`;
  return {
    title: "Offerte",
    description:
      "Le offerte e le promozioni dei produttori e dei negozi del territorio: prodotti in sconto selezionati tra le filiere locali.",
    alternates: { canonical },
    openGraph: {
      title: "Offerte",
      description:
        "Le offerte e le promozioni dei produttori e dei negozi del territorio: prodotti in sconto selezionati tra le filiere locali.",
      url: canonical,
      type: "website",
      siteName: "Radici Calabria",
    },
    twitter: {
      card: "summary_large_image",
      title: "Offerte",
      description:
        "Le offerte e le promozioni dei produttori e dei negozi del territorio: prodotti in sconto selezionati tra le filiere locali.",
    },
  };
}

export default async function OffertePage() {
  const [prodottiOfferta, statoPreferiti] = await Promise.all([
    getProdottiOfferta(60),
    getStatoPreferitiPerPagina(),
  ]);

  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      <IntestazionePagina
        occhiello="Promozioni"
        titolo="Offerte"
        icona={Tag}
        sommario="Le migliori promozioni delle imprese del territorio, sempre aggiornate."
        azione={
          <Link href="/" className="rd-azione-tenue">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Home
          </Link>
        }
      />

      <div className="rd-guscio py-7 md:py-10">
        {prodottiOfferta.length === 0 ? (
          <div className="rd-fascia flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f4efe4] ring-1 ring-[#e5ded0]">
              <Tag className="h-8 w-8 text-[#8a5a3b]" aria-hidden />
            </div>
            <h2 className="rd-titolo-scheda mt-4 text-lg">
              Nessuna offerta al momento
            </h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-[#57534e]">
              Non ci sono ancora prodotti in promozione. Esplora i negozi e le produzioni del territorio.
            </p>
            <Link
              href="/negozi"
              className="rd-azione mt-6"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Vedi i negozi
            </Link>
          </div>
        ) : (
          <>
            <h2 className="sr-only">Prodotti in offerta</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {prodottiOfferta.map((prodotto) => {
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
                  prodottoInOfferta
                  compatto
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
