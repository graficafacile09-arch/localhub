import Link from "next/link";
import { ArrowRight } from "lucide-react";
import HomepageProductCarousel from "@/components/home/HomepageProductCarousel";
import HomepageProductCategoryScroller from "@/components/home/HomepageProductCategoryScroller";

type ProdottoRecord = Record<string, unknown>;
type StatoPreferiti = {
  autenticato: boolean;
  chiavi: Set<string>;
};

function testoCategoria(prodotto: ProdottoRecord) {
  const categoria = prodotto.categoria;
  if (typeof categoria !== "string" || !categoria.trim()) return "Altri prodotti";
  const pulita = categoria.trim();
  if (pulita.toLocaleLowerCase("it") === "gioiello") return "Gioielli";
  return pulita;
}

function ProductSectionCard({
  titolo,
  href,
  prodotti,
  statoPreferiti,
  prodottoTipico = false,
}: {
  titolo: string;
  href: string;
  prodotti: ProdottoRecord[];
  statoPreferiti: StatoPreferiti;
  prodottoTipico?: boolean;
}) {
  if (prodotti.length === 0) return null;

  return (
    <article className="flex w-full min-w-0 flex-col rounded-2xl border border-blue-100 bg-[#f7faff] p-3 shadow-sm sm:p-4 md:w-[min(72vw,960px)] md:shrink-0 md:snap-start md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-base font-black leading-tight tracking-tight text-slate-900 sm:text-lg md:text-xl">
          {titolo}
        </h2>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-blue-700 hover:text-blue-900 sm:text-sm"
        >
          Vedi tutti <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <HomepageProductCarousel
        prodotti={prodotti}
        statoPreferiti={statoPreferiti}
        prodottoTipico={prodottoTipico}
        compatto
        mostraTutti
      />
    </article>
  );
}

export default function HomepageProductShowcase({
  prodottiTipici,
  prodottiCatalogo,
  statoPreferiti,
}: {
  prodottiTipici: ProdottoRecord[];
  prodottiCatalogo: ProdottoRecord[];
  statoPreferiti: StatoPreferiti;
}) {
  const idTipici = new Set(
    prodottiTipici.map((prodotto) => String(prodotto.id ?? "")).filter(Boolean)
  );
  const prodottiPerCategoria = new Map<string, ProdottoRecord[]>();

  for (const prodotto of prodottiCatalogo) {
    const id = String(prodotto.id ?? "");
    if (id && idTipici.has(id)) continue;
    const categoria = testoCategoria(prodotto);
    const gruppo = prodottiPerCategoria.get(categoria) ?? [];
    gruppo.push(prodotto);
    prodottiPerCategoria.set(categoria, gruppo);
  }

  const categorie = Array.from(prodottiPerCategoria.entries()).sort(([a], [b]) =>
    a.localeCompare(b, "it")
  );

  return (
    <section
      aria-label="Vetrina prodotti InCittà"
      className="w-full overflow-hidden bg-[#e5edf7] px-3 pb-5 pt-3 sm:px-4 md:px-6 md:pb-7 md:pt-4"
    >
      <div className="mx-auto max-w-[1800px]">
        <div data-home-products-swipe className="mb-3 flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-semibold text-blue-900 sm:text-sm">
            Scopri i prodotti dei negozi locali per categoria
          </p>
          <span className="shrink-0 text-xs font-semibold text-slate-500">
            Scorri <span aria-hidden>→</span>
          </span>
        </div>

        <HomepageProductCategoryScroller>
          <ProductSectionCard
            titolo="Eccellenze calabresi"
            href="/prodotti-tipici"
            prodotti={prodottiTipici}
            statoPreferiti={statoPreferiti}
            prodottoTipico
          />

          {categorie.map(([categoria, prodotti]) => (
            <ProductSectionCard
              key={categoria}
              titolo={categoria}
              href="/negozi"
              prodotti={prodotti}
              statoPreferiti={statoPreferiti}
            />
          ))}

          {prodottiTipici.length === 0 && categorie.length === 0 && (
            <article className="flex min-h-[260px] w-[88vw] max-w-[420px] shrink-0 snap-start items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              I prodotti dei negozi locali saranno visibili qui appena disponibili.
            </article>
          )}
        </HomepageProductCategoryScroller>
      </div>
    </section>
  );
}
