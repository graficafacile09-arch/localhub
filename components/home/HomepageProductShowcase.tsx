import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import HomepageProductCarousel from "@/components/home/HomepageProductCarousel";

type ProdottoRecord = Record<string, unknown>;
type StatoPreferiti = {
  autenticato: boolean;
  chiavi: Set<string>;
};

function testoCategoria(prodotto: ProdottoRecord) {
  const categoria = prodotto.categoria;
  if (typeof categoria === "string" && categoria.trim()) return categoria.trim();
  return "Altri prodotti";
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
    <article className="flex w-[88vw] max-w-[420px] shrink-0 snap-start flex-col rounded-2xl border border-blue-100 bg-[#f7faff] p-3 shadow-sm sm:p-4 md:w-[min(72vw,960px)] md:max-w-none md:p-5">
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
        <div className="mb-3 flex items-end justify-between gap-3 rounded-xl border border-blue-100 bg-white/75 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <p className="text-xs font-bold leading-5 text-blue-900 sm:text-sm">
              Negozi, offerte e servizi locali: cercali, confrontali e acquista restando nella tua città.
            </p>
          </div>
          <span className="hidden shrink-0 text-xs font-semibold text-slate-500 sm:inline">
            Scorri le sezioni <span aria-hidden>→</span>
          </span>
        </div>

        <div
          className="flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:thin] sm:gap-4 md:gap-5"
          aria-label="Sezioni prodotti scorrevoli"
        >
          <article className="flex w-[88vw] max-w-[420px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-blue-100 bg-[#f7faff] shadow-sm sm:max-w-[440px] md:w-[min(72vw,960px)] md:max-w-none">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 md:aspect-[4/3]">
              <Image
                src="/hero-coppia-castrovillari.webp"
                alt="Coppia che fa shopping nei negozi della città"
                fill
                priority
                sizes="(max-width: 639px) 88vw, 440px"
                className="object-cover object-center"
              />
            </div>
            <div className="flex flex-1 flex-col p-4 sm:p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-800 sm:text-xs">
                InCittà · Shopping locale
              </p>
              <h1 className="mt-2 text-xl font-black leading-tight tracking-tight text-slate-950 sm:text-2xl">
                Negozi, offerte e servizi locali: cercali, confrontali e acquista restando nella tua città.
              </h1>
              <p className="mt-2 text-sm leading-5 text-slate-600">
                Scopri i prodotti dei negozi locali e sostieni chi dà valore al tuo territorio.
              </p>
              <Link
                href="/negozi"
                className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-black text-blue-950 shadow-sm transition hover:bg-yellow-300"
              >
                Scopri i prodotti <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </article>

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
        </div>
      </div>
    </section>
  );
}
