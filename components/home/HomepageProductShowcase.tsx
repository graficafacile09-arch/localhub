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
    <article className="flex w-[86vw] max-w-[640px] shrink-0 snap-start flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:w-[70vw] sm:p-5 lg:w-[calc(50vw-2rem)] xl:w-[calc(42vw-2rem)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">
          {titolo}
        </h2>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-blue-700 hover:text-blue-900 sm:text-sm"
        >
          Vedi tutti <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <div className="min-w-0">
        <HomepageProductCarousel
          prodotti={prodotti}
          statoPreferiti={statoPreferiti}
          prodottoTipico={prodottoTipico}
          compatto={prodottoTipico}
          mostraTutti
        />
      </div>
    </article>
  );
}

export default function HomepageProductShowcase({
  prodottiTipici,
  prodottiInEvidenza,
  statoPreferiti,
}: {
  prodottiTipici: ProdottoRecord[];
  prodottiInEvidenza: ProdottoRecord[];
  statoPreferiti: StatoPreferiti;
}) {
  const idTipici = new Set(
    prodottiTipici.map((prodotto) => String(prodotto.id ?? "")).filter(Boolean)
  );
  const prodottiPerCategoria = new Map<string, ProdottoRecord[]>();

  for (const prodotto of prodottiInEvidenza) {
    if (idTipici.has(String(prodotto.id ?? ""))) continue;
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
      className="w-full overflow-hidden bg-[#eef3f8] px-3 pb-5 pt-4 sm:px-4 md:px-6 md:pb-8 md:pt-6"
    >
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-800 sm:text-xs">
              Il marketplace della tua città
            </p>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">
              Scorri le sezioni e scopri i prodotti dei negozi locali.
            </p>
          </div>
          <span className="hidden shrink-0 text-xs font-semibold text-slate-500 sm:inline">
            Scorri per esplorare <span aria-hidden>→</span>
          </span>
        </div>

        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin] sm:gap-4 xl:gap-5">
          <article className="group relative isolate flex min-h-[350px] w-[86vw] max-w-[420px] shrink-0 snap-start overflow-hidden rounded-3xl bg-slate-950 shadow-lg shadow-slate-900/10 sm:min-h-[390px] lg:min-h-[430px]">
            <Image
              src="/hero-coppia-castrovillari.webp"
              alt="Coppia che fa shopping a Castrovillari"
              fill
              priority
              sizes="(max-width: 639px) 86vw, (max-width: 1023px) 420px, 32vw"
              className="absolute inset-0 -z-20 object-cover object-center transition duration-700 group-hover:scale-[1.025]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-slate-950/10"
            />
            <div className="mt-auto w-full p-5 text-white sm:p-6">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-300 sm:text-xs">
                InCittà · Shopping locale
              </p>
              <h1 className="text-3xl font-black leading-[1.05] tracking-tight drop-shadow-md sm:text-4xl">
                Tutto quello che cerchi... <span className="text-yellow-300">è già</span> nella tua città.
              </h1>
              <p className="mt-3 text-sm leading-5 text-white/90">
                Scopri i prodotti dei negozi locali e sostieni chi dà valore al tuo territorio.
              </p>
              <Link
                href="/negozi"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-blue-950 shadow-md transition hover:bg-yellow-300"
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
            <article className="flex min-h-[350px] w-[86vw] max-w-[640px] shrink-0 snap-start items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              I prodotti dei negozi locali saranno visibili qui appena disponibili.
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
