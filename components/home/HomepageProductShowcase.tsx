import Link from "next/link";
import { ArrowRight } from "lucide-react";
import HomepageProductCarousel from "@/components/home/HomepageProductCarousel";
import {
  classificaProdottoPerFiliera,
  posizioneFiliera,
} from "@/lib/filiere-prodotti";

type ProdottoRecord = Record<string, unknown>;
type StatoPreferiti = {
  autenticato: boolean;
  chiavi: Set<string>;
};

export function ProductSectionCard({
  titolo,
  href,
  prodotti,
  statoPreferiti,
  prodottoTipico = false,
  evidenziato = false,
  standalone = false,
}: {
  titolo: string;
  href: string;
  prodotti: ProdottoRecord[];
  statoPreferiti: StatoPreferiti;
  prodottoTipico?: boolean;
  evidenziato?: boolean;
  standalone?: boolean;
}) {
  if (prodotti.length === 0) return null;

  const desktopWidthClass = standalone
    ? "mx-auto md:w-full"
    : titolo.toLocaleLowerCase("it") === "altri prodotti"
      ? "md:w-[min(88vw,1600px)] md:shrink-0 md:snap-start"
      : "md:w-[min(72vw,960px)] md:shrink-0 md:snap-start";

  return (
    <article className={`flex w-full min-w-0 flex-col rounded-2xl border p-3 shadow-sm sm:p-4 ${desktopWidthClass} md:p-5 ${
      evidenziato
        ? "border-[#d5a83a] bg-[#fdfbf6] shadow-md ring-2 ring-[#e0cc9a]/70"
        : "border-[#e5ded0] bg-[#fbf9f4]"
    }`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2
          className={`inline-flex min-w-0 max-w-full items-center font-black leading-tight tracking-tight shadow-sm ${
            evidenziato
              ? "rounded-lg border-2 border-[#8a5a3b] bg-white px-4 py-2 text-sm uppercase tracking-[0.1em] text-[#8a5a3b] shadow-[0_4px_0_rgba(138,90,59,0.18)] sm:text-base md:text-lg"
              : "rounded-lg border-l-4 border-[#d5a83a] bg-[#24462f] px-3 py-2 text-base text-white sm:text-lg md:text-xl"
          }`}
        >
          {titolo}
        </h2>
        <Link
          href={href}
          className="rd-link-freccia shrink-0 text-xs sm:text-sm"
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

  // I prodotti tipici sono mostrati nella scheda gialla fuori dallo swipe;
  // i prodotti del Panificio Zini restano esclusi da questa vetrina.
  // Le schede seguono le FILIERE, non le categorie dei negozi: una categoria
  // larga come «Alimentari» teneva insieme miele, pasta e salumi.
  const prodottiPerFiliera = new Map<string, ProdottoRecord[]>();
  for (const prodotto of prodottiCatalogo) {
    const id = String(prodotto.id ?? "");
    if ((id && idTipici.has(id)) || String(prodotto.negozio_nome ?? "").trim().toLocaleLowerCase("it").includes("panificio zini")) continue;
    const filiera = classificaProdottoPerFiliera(prodotto);
    // I prodotti senza filiera non entrano in nessuna scheda.
    if (!filiera) continue;
    const gruppo = prodottiPerFiliera.get(filiera) ?? [];
    gruppo.push(prodotto);
    prodottiPerFiliera.set(filiera, gruppo);
  }

  // Ordine delle schede: quello della vetrina filiere, «Altri prodotti» in coda.
  const gruppi = Array.from(prodottiPerFiliera.entries()).sort(
    ([a], [b]) => posizioneFiliera(a) - posizioneFiliera(b) || a.localeCompare(b, "it")
  );

  return (
    <section
      aria-label="Vetrina prodotti Radici Calabria"
      className="w-full overflow-hidden bg-[#f6f3ec] px-3 pb-5 pt-3 sm:px-4 md:px-6 md:pb-7 md:pt-4"
    >
      <div className="mx-auto max-w-[1800px]">
        <div data-home-products-swipe className="mb-3 flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-semibold text-[#57534e] sm:text-sm">
            Scopri i prodotti dei negozi locali, filiera per filiera
          </p>
        </div>

        {/* Una filiera per riga, a tutta larghezza: il titolo della filiera e i
            suoi prodotti restano un blocco unico, così non si vedono più
            prodotti di filiere diverse mescolati nella stessa fila. */}
        <div className="grid gap-3 md:gap-4" data-home-prodotti-per-filiera>
          {gruppi.map(([filiera, prodotti]) => (
            <ProductSectionCard
              key={filiera}
              titolo={filiera}
              href="/negozi"
              prodotti={prodotti}
              statoPreferiti={statoPreferiti}
              standalone
            />
          ))}

          {gruppi.length === 0 && (
            <article className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-[#d6cab2] bg-white p-6 text-center text-sm text-[#6b6459]">
              I prodotti dei negozi locali saranno visibili qui appena disponibili.
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
