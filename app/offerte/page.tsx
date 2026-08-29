import type { Metadata } from "next";
import Header from "@/components/Header/Header";
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
      "Le offerte e le promozioni dei negozi di Castrovillari: prodotti in sconto selezionati dai negozi della tua città.",
    alternates: { canonical },
    openGraph: {
      title: "Offerte",
      description:
        "Le offerte e le promozioni dei negozi di Castrovillari: prodotti in sconto selezionati dai negozi della tua città.",
      url: canonical,
      type: "website",
      siteName: "InCittà",
    },
    twitter: {
      card: "summary_large_image",
      title: "Offerte",
      description:
        "Le offerte e le promozioni dei negozi di Castrovillari: prodotti in sconto selezionati dai negozi della tua città.",
    },
  };
}

export default async function OffertePage() {
  const [prodottiOfferta, statoPreferiti] = await Promise.all([
    getProdottiOfferta(60),
    getStatoPreferitiPerPagina(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="inline-block whitespace-nowrap rounded-lg bg-red-600 px-2 py-1 text-[13px] font-black tracking-tight text-white shadow-sm sm:text-base md:px-3 md:py-1.5 md:text-2xl">
              OFFERTE
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Le migliori promozioni dei negozi della tua città, sempre aggiornate.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-blue-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Home
          </Link>
        </div>

        {prodottiOfferta.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white px-6 py-16 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
              <Tag className="h-8 w-8 text-red-500" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-black tracking-tight text-slate-900">
              Nessuna offerta al momento
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Non ci sono ancora prodotti in promozione. Esplora i negozi della tua città.
            </p>
            <Link
              href="/negozi"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-red-500"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Vedi i negozi
            </Link>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-4">
            {prodottiOfferta.map((prodotto) => {
              const prodottoId = String(prodotto.id);
              return (
                <ProductCard
                  key={prodottoId}
                  id={prodottoId}
                  slug={(prodotto.slug as string) ?? prodottoId}
                  nome={prodotto.nome as string}
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
        )}
      </div>
    </main>
  );
}
