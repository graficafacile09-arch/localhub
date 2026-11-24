"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import ProdottoImmagine from "@/components/home/ProdottoImmagine";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { FILIERE_EDITORIALI } from "@/lib/filiere-editoriali";

/**
 * Le dieci filiere agroalimentari calabresi.
 * Denominazioni DOP/IGP come da registri europei; nessun dato inventato.
 * Foto ufficiali dall'archivio Qualivita/Qualigeo (consorzi di tutela DOP e IGP);
 * la scheda ittica usa una foto di Wikimedia Commons. File locali in `public/filiere`.
 *
 * Vive nel pannello dello swipe "Scopri la filiera" della homepage (era la sua
 * sede originale, prima del restyle): palette crema/verde bosco/oro del sito.
 */
const TOTALE = FILIERE_EDITORIALI.length;

type ProdottoRecord = Record<string, unknown>;

function freccia(direzione: "sinistra" | "destra") {
  return direzione === "sinistra" ? (
    <ChevronLeft className="h-6 w-6" aria-hidden />
  ) : (
    <ChevronRight className="h-6 w-6" aria-hidden />
  );
}

export default function HomepageFiliereShowcase({
  prodottiPerFiliera = {},
}: {
  /** Prodotti già raggruppati per filiera dal server (chiave = nome filiera). */
  prodottiPerFiliera?: Record<string, ProdottoRecord[]>;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dettaglioRef = useRef<HTMLDivElement>(null);
  /** Indice della scheda aperta: `null` = carosello. */
  const [aperta, setAperta] = useState<number | null>(null);

  function scorri(direzione: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direzione * Math.max(320, Math.round(scroller.clientWidth * 0.82)),
      behavior: "smooth",
    });
  }

  // Con la scheda aperta il focus va sul pannello, così tastiera e lettori
  // di schermo non restano sul carosello ormai nascosto.
  useEffect(() => {
    if (aperta === null) return;
    dettaglioRef.current?.focus({ preventScroll: true });
    function suEsc(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAperta(null);
    }
    window.addEventListener("keydown", suEsc);
    return () => window.removeEventListener("keydown", suEsc);
  }, [aperta]);

  const filiera = aperta === null ? null : FILIERE_EDITORIALI[aperta];
  // Prodotti della sola filiera aperta: sotto la scheda non compare nessun
  // elenco di altre filiere, che confonderebbe la lettura.
  const prodottiFiliera = filiera ? (prodottiPerFiliera[filiera.nome] ?? []) : [];

  return (
    <section
      id="homepage-filiere"
      aria-labelledby="titolo-home-filiere"
      className="w-full bg-[#f6f3ec] px-3 pb-5 pt-3 sm:px-4 md:px-6 md:pb-7 md:pt-4"
    >
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a5a3b]">Radici Calabria</p>
            <h2
              id="titolo-home-filiere"
              className="text-base font-black leading-tight tracking-tight text-[#24462f] sm:text-lg md:text-xl"
            >
              SCOPRI LA FILIERA
            </h2>
          </div>
          <p className="text-[11px] font-semibold text-[#57534e] sm:text-sm">
            {filiera
              ? `${filiera.nome} · ${(aperta ?? 0) + 1} di ${TOTALE}`
              : "Dieci filiere agroalimentari calabresi: scorri e apri una scheda"}
          </p>
        </div>

        {filiera === null ? (
          <div>
          <div className="flex min-w-0 items-stretch gap-2">
            <button
              type="button"
              onClick={() => scorri(-1)}
              aria-label="Mostra le filiere precedenti"
              className="hidden h-11 w-11 shrink-0 self-center items-center justify-center rounded-full border border-[#e5ded0] bg-white text-[#24462f] shadow-sm transition hover:border-[#d5a83a] hover:bg-[#fbf6e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f] md:inline-flex"
            >
              {freccia("sinistra")}
            </button>

            <div
              ref={scrollerRef}
              data-home-inner-horizontal-scroll
              aria-label="Schede delle filiere calabresi"
              className="flex min-w-0 flex-1 snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [scrollbar-width:none] md:gap-5"
            >
              {FILIERE_EDITORIALI.map((voce, indice) => (
                <button
                  key={voce.nome}
                  type="button"
                  onClick={() => setAperta(indice)}
                  aria-expanded={false}
                  aria-label={`Apri la scheda: ${voce.nome}`}
                  className="group flex w-[86vw] max-w-[420px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[#e5ded0] bg-white text-left shadow-sm transition hover:border-[#d5a83a] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f] md:w-[min(46vw,620px)] md:max-w-none"
                >
                  <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-[#f4efe4] md:aspect-[2/1]">
                    <Image
                      src={voce.img}
                      alt={voce.alt}
                      fill
                      sizes="(max-width: 767px) 86vw, 46vw"
                      className="object-cover object-center transition duration-500 group-hover:scale-[1.02]"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-[#24462f]/90 px-2.5 py-1 text-[10px] font-black tracking-wide text-[#e0cc9a]">
                      {String(indice + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-3.5 md:p-4">
                    <h3 className="text-[15px] font-black leading-tight tracking-tight text-[#1c2b22] md:text-lg">
                      {voce.nome}
                    </h3>
                    <p className="mt-1.5 text-[13px] leading-5 text-[#57534e] md:text-sm md:leading-6">
                      {voce.testo}
                    </p>
                    <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] font-bold leading-4 text-[#8a5a3b] md:text-xs">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {voce.territorio}
                    </p>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                      <span className="min-w-0 truncate text-[9px] text-[#8a8378] md:text-[10px]">{voce.credito}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#d5a83a] px-2.5 py-1.5 text-[11px] font-black text-[#16281c] transition group-hover:bg-[#e0cc9a] md:text-xs">
                        Apri la scheda
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => scorri(1)}
              aria-label="Mostra le filiere successive"
              className="hidden h-11 w-11 shrink-0 self-center items-center justify-center rounded-full border border-[#d5a83a] bg-[#d5a83a] text-[#16281c] shadow-sm transition hover:bg-[#e0cc9a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f] md:inline-flex"
            >
              {freccia("destra")}
            </button>
          </div>

          {/* Su mobile le frecce laterali non ci stanno accanto alle schede
              (largo 86vw): restano sotto il carosello, sempre visibili. */}
          <div
            data-filiere-frecce-mobile
            className="mt-2 flex items-center justify-center gap-3 md:hidden"
          >
            <button
              type="button"
              onClick={() => scorri(-1)}
              aria-label="Mostra le filiere precedenti"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5ded0] bg-white text-[#24462f] shadow-sm transition active:scale-95 hover:border-[#d5a83a] hover:bg-[#fbf6e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f]"
            >
              {freccia("sinistra")}
            </button>
            <button
              type="button"
              onClick={() => scorri(1)}
              aria-label="Mostra le filiere successive"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d5a83a] bg-[#d5a83a] text-[#16281c] shadow-sm transition active:scale-95 hover:bg-[#e0cc9a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f]"
            >
              {freccia("destra")}
            </button>
          </div>
          </div>
        ) : (
          <div
            ref={dettaglioRef}
            tabIndex={-1}
            role="region"
            aria-label={filiera.nome}
            className="overflow-hidden rounded-2xl border border-[#e5ded0] bg-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f]"
          >
            <div className="grid md:grid-cols-[minmax(0,38%)_minmax(0,1fr)]">
              <div className="relative aspect-[16/10] w-full bg-[#f4efe4] md:aspect-auto md:h-full md:min-h-[420px]">
                <Image
                  src={filiera.img}
                  alt={filiera.alt}
                  fill
                  sizes="(max-width: 767px) 100vw, 38vw"
                  className="object-cover object-center"
                />
                <span className="absolute left-3 top-3 rounded-full bg-[#24462f]/90 px-2.5 py-1 text-[10px] font-black tracking-wide text-[#e0cc9a]">
                  {String((aperta ?? 0) + 1).padStart(2, "0")} / {String(TOTALE).padStart(2, "0")}
                </span>
              </div>

              <div className="flex flex-col p-3.5 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[17px] font-black leading-tight tracking-tight text-[#1c2b22] md:text-xl">
                    {filiera.nome}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setAperta(null)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#24462f] px-3 py-1.5 text-[11px] font-black text-white transition hover:bg-[#1b3624] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f] md:text-xs"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                    Tutte le filiere
                  </button>
                </div>

                <p className="mt-1.5 text-[13px] leading-5 text-slate-700 md:text-sm md:leading-6">
                  {filiera.testo}
                </p>
                <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] font-bold leading-4 text-[#8a5a3b] md:text-xs">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {filiera.territorio}
                </p>

                {prodottiFiliera.length > 0 ? (
                  <section
                    aria-label={`Prodotti della ${filiera.nome}`}
                    className="mt-3 rounded-xl border border-[#e5ded0] bg-[#fbf9f4] p-3"
                  >
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8a5a3b]">
                      I prodotti di questa filiera ({prodottiFiliera.length})
                    </p>
                    {/* Due colonne al massimo: righe larghe, nomi interi (niente
                        testo tagliato) e miniature leggibili. */}
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {prodottiFiliera.map((prodotto, indice) => {
                        const id = String(prodotto.id ?? prodotto.slug ?? indice);
                        const slug = String(prodotto.slug ?? id);
                        const nome = String(prodotto.nome ?? "");
                        const prezzo = Number(prodotto.prezzo);
                        const categoria = (prodotto.categoria as string) ?? null;
                        const negozio = String(prodotto.negozio_nome ?? "").trim();
                        return (
                          <li key={id}>
                            <Link
                              href={`/prodotto/${slug}`}
                              className="flex items-center gap-2.5 rounded-lg border border-[#e5ded0] bg-white px-2.5 py-2 transition hover:border-[#d5a83a] hover:bg-[#fbf6e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24462f]"
                            >
                              {/* Miniatura: la riga resta compatta, niente foto grandi. */}
                              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#f4efe4]">
                                <ProdottoImmagine
                                  src={getProdottoImmagine({
                                    immagine_principale: (prodotto.immagine_principale as string) ?? null,
                                    categoria,
                                  })}
                                  alt={nome}
                                  categoria={categoria}
                                />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block break-words text-[12.5px] font-bold leading-snug text-[#1c2b22]">
                                  {nome}
                                </span>
                                {negozio && (
                                  <span className="block truncate text-[10.5px] leading-tight text-[#8a8378]">
                                    {negozio}
                                  </span>
                                )}
                              </span>
                              {Number.isFinite(prezzo) && (
                                <span className="shrink-0 self-start pt-0.5 text-[12px] font-black tabular-nums text-[#24462f]">
                                  € {prezzo.toFixed(2).replace(".", ",")}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed border-[#d6cab2] bg-[#fbf9f4] p-3 text-[11px] leading-4 text-[#8a8378]">
                    Nessun prodotto di questa filiera disponibile in questo momento.
                  </p>
                )}

                {filiera.paragrafi.map((paragrafo) => (
                  <p
                    key={paragrafo.slice(0, 24)}
                    className="mt-2.5 text-[13px] leading-5 text-[#57534e] md:text-sm md:leading-6"
                  >
                    {paragrafo}
                  </p>
                ))}

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a5a3b]">
                      Cosa si produce
                    </p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {filiera.prodotti.map((prodotto) => (
                        <li
                          key={prodotto}
                          className="rounded-full bg-[#f4efe4] px-2 py-1 text-[11px] font-semibold leading-4 text-[#5b5348]"
                        >
                          {prodotto}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a5a3b]">
                      Riconoscimenti
                    </p>
                    {filiera.riconoscimenti.length > 0 ? (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {filiera.riconoscimenti.map((riconoscimento) => (
                          <li
                            key={riconoscimento}
                            className="rounded-full bg-[#fbf6e8] px-2 py-1 text-[11px] font-bold leading-4 text-[#24462f]"
                          >
                            {riconoscimento}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-[11px] leading-4 text-[#8a8378]">
                        Nessuna denominazione europea: filiera di prodotti tradizionali.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 rounded-xl bg-[#faf7f0] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a5a3b]">
                    Come si lavora
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {filiera.lavorazione.map((passo) => (
                      <li
                        key={passo}
                        className="flex gap-1.5 text-[12px] leading-5 text-[#57534e] md:text-[13px]"
                      >
                        <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#d5a83a]" />
                        {passo}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-[#e5ded0] pt-2 text-[11px] leading-4 text-[#8a8378] md:text-xs">
                    <strong className="font-black text-[#1c2b22]">Stagionalità:</strong> {filiera.stagionalita}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAperta(((aperta ?? 0) - 1 + TOTALE) % TOTALE)}
                    aria-label="Filiera precedente"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e5ded0] text-[#24462f] transition hover:border-[#d5a83a] hover:bg-[#fbf6e8]"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAperta(((aperta ?? 0) + 1) % TOTALE)}
                    aria-label="Filiera successiva"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e5ded0] text-[#24462f] transition hover:border-[#d5a83a] hover:bg-[#fbf6e8]"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                  <span className="text-[10px] font-semibold text-[#8a8378] md:text-[11px]">
                    {(aperta ?? 0) + 1} di {TOTALE}
                  </span>
                  <span className="ml-auto text-[9px] text-[#8a8378] md:text-[10px]">{filiera.credito}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
