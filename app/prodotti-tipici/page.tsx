import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import ProductCard from "@/components/home/ProductCard";
import { getProdottiTipici } from "@/lib/negozi";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import { getSiteUrl } from "@/lib/site";
import Link from "next/link";
import { ArrowLeft, Wheat } from "lucide-react";

// Pagina pubblica che elenca TUTTI i prodotti tipici del territorio
// (Castrovillari / Pollino). I prodotti sono normalissimi prodotti del
// catalogo dei negozi, con flag prodotto_tipico = true: il click apre la
// stessa pagina /prodotto/[slug] già esistente.
export const dynamic = "force-dynamic";

// Metadata dedicati: la pagina non deve ereditare il default generico del
// layout, ma veicolare la vetrina territoriale "Eccellenze Calabresi" sia
// nel title/description sia nell'Open Graph (URL assoluti su incitta.online).
export async function generateMetadata(): Promise<Metadata> {
  const canonical = `${getSiteUrl()}/prodotti-tipici`;
  // title/og:title senza suffisso "| InCittà": il template del layout lo
  // aggiunge (title: { template: "%s | InCittà" }), evitando il duplicato.
  return {
    title: "Eccellenze Calabresi",
    description:
      "Le eccellenze di Castrovillari e del Pollino: cipolle bianche, mieli e prodotti tipici selezionati dai negozi della tua città.",
    alternates: { canonical },
    openGraph: {
      title: "Eccellenze Calabresi",
      description:
        "Le eccellenze di Castrovillari e del Pollino: cipolle bianche, mieli e prodotti tipici selezionati dai negozi della tua città.",
      url: canonical,
      type: "website",
      siteName: "InCittà",
    },
    twitter: {
      card: "summary_large_image",
      title: "Eccellenze Calabresi",
      description:
        "Le eccellenze di Castrovillari e del Pollino: cipolle bianche, mieli e prodotti tipici selezionati dai negozi della tua città.",
    },
  };
}

export default async function ProdottiTipiciPage() {
  const [prodottiTipici, statoPreferiti] = await Promise.all([
    getProdottiTipici(60),
    getStatoPreferitiPerPagina(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="inline-block whitespace-nowrap rounded-lg bg-yellow-400 px-2 py-1 text-[13px] font-black tracking-tight text-blue-900 shadow-sm sm:text-base md:px-3 md:py-1.5 md:text-2xl">
              ECCELLENZE CALABRESI
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Le eccellenze di Castrovillari e del Pollino, selezionate dai negozi della tua città.
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

        {prodottiTipici.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white px-6 py-16 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
              <Wheat className="h-8 w-8 text-blue-500" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-black tracking-tight text-slate-900">
              Nessun prodotto tipico al momento
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Non ci sono ancora prodotti nella vetrina territoriale. Esplora i negozi della tua città.
            </p>
            <Link
              href="/negozi"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 text-sm font-bold text-blue-800 transition hover:bg-yellow-300"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Vedi i negozi
            </Link>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-4">
            {prodottiTipici.map((prodotto) => {
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
                  prodottoTipico
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