"use client";

import Link from "next/link";
import { ArrowRight, ShoppingBag, Store, Trash2 } from "lucide-react";
import { useCarrello } from "@/lib/carrello/CartContext";
import { chiaveDiRiga } from "@/lib/carrello/cart-core";
import QuantitySelector from "@/components/acquista/QuantitySelector";

const formattaEuro = (v: number) =>
  `€${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CarrelloPageClient() {
  const { righe, gruppi, totale, pezzi, aggiorna, rimuovi, svuota } = useCarrello();

  if (righe.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-3 py-10 sm:px-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <ShoppingBag className="h-7 w-7 text-blue-600" aria-hidden />
          </div>
          <h1 className="mt-4 text-3xl font-black text-slate-900">Il tuo carrello è vuoto</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Sfoglia i negozi della tua città e aggiungi i prodotti che ti interessano.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href="/negozi"
              className="inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-bold text-blue-800 shadow-sm transition hover:bg-yellow-300"
            >
              <Store className="h-4 w-4" aria-hidden />
              Vai ai negozi
            </Link>
            <Link
              href="/categorie"
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
            >
              Esplora le categorie
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-5 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Carrello{" "}
          <span className="text-sm font-semibold text-slate-400">
            ({pezzi} {pezzi === 1 ? "articolo" : "articoli"})
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href="/negozi"
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
          >
            Continua gli acquisti
          </Link>
          <button
            type="button"
            onClick={svuota}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-600 transition hover:border-blue-300 hover:bg-blue-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Svuota carrello
          </button>
        </div>
      </div>

      {/* Colonna esplicita minmax(0,1fr) anche su mobile: senza, la griglia
          usa una colonna implicita auto che cresce col contenuto (i nomi
          prodotto con truncate hanno min-content = testo intero) e provoca
          overflow orizzontale a destra. min-w-0 sui figli evita che il
          min-content dei contenuti gonfi la colonna. */}
      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Raggruppamento per negozio */}
        <div className="space-y-4">
          {gruppi.map((gruppo) => (
            <section
              key={gruppo.negozioId}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <header className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Store className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                  <p className="truncate text-sm font-bold text-slate-900">
                    {gruppo.negozioNome || "Negozio"}
                  </p>
                </div>
                <p className="shrink-0 text-xs font-bold text-slate-500">
                  Subtotale: <span className="text-blue-700">{formattaEuro(gruppo.subtotale)}</span>
                </p>
              </header>

              <ul className="divide-y divide-slate-100">
                {gruppo.righe.map((riga) => {
                  const chiave = chiaveDiRiga(riga);
                  const importoRiga = riga.prezzo * riga.quantita;
                  return (
                    <li key={chiave} className="flex gap-3 px-4 py-3">
                      {/* Immagine snapshot UI */}
                      <Link
                        href={`/prodotto/${riga.slug}`}
                        className="block h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-100"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={riga.immagine ?? ""}
                          alt={riga.nome}
                          className="h-full w-full object-cover"
                        />
                      </Link>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              href={`/prodotto/${riga.slug}`}
                              className="block truncate text-sm font-bold text-slate-900 transition hover:text-blue-700"
                            >
                              {riga.nome}
                            </Link>
                            {riga.variante && (
                              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                                Variante: {riga.variante}
                              </p>
                            )}
                            <p className="mt-0.5 text-xs text-slate-400">
                              {formattaEuro(riga.prezzo)} / pezzo
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => rimuovi(chiave)}
                            aria-label={`Rimuovi ${riga.nome} dal carrello`}
                            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <QuantitySelector
                            value={riga.quantita}
                            onChange={(v) => aggiorna(chiave, v)}
                          />
                          <p className="text-sm font-black text-blue-700 tabular-nums">
                            {formattaEuro(importoRiga)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* Riepilogo */}
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Riepilogo</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Articoli</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">{pezzi}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Spedizione</dt>
              <dd className="font-semibold text-slate-500">Calcolata al checkout</dd>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <dt className="text-base font-black text-slate-900">Totale</dt>
              <dd className="text-lg font-black text-blue-700 tabular-nums">
                {formattaEuro(totale)}
              </dd>
            </div>
          </dl>

          <Link
            href="/checkout"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-4 py-3 text-base font-bold text-blue-800 shadow-sm transition hover:bg-yellow-300 active:scale-[0.98]"
          >
            Procedi al checkout
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <p className="mt-2 text-center text-[11px] leading-4 text-slate-400">
            Prezzi e disponibilità sono verificati al momento dell&apos;ordine.
          </p>
        </aside>
      </div>
    </div>
  );
}
