"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { prodottoEsaurito } from "@/lib/prodotti-disponibilita";
import type { MerchantProduct } from "@/lib/merchant/types";
import MerchantProductDeleteButton from "@/components/merchant/MerchantProductDeleteButton";

type AzioneBulk = "attiva" | "disattiva" | "elimina";

export default function MerchantProductListManager({
  negozioId,
  products,
  basePath,
}: {
  negozioId: string;
  products: MerchantProduct[];
  basePath: string;
}) {
  const router = useRouter();
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [quantitaBozza, setQuantitaBozza] = useState<Record<string, string>>({});
  const [occupato, setOccupato] = useState(false);

  const idsPagina = useMemo(() => products.map((p) => p.id), [products]);
  const tuttiSelezionati = idsPagina.length > 0 && idsPagina.every((id) => selezionati.has(id));
  const countSelezionati = selezionati.size;

  function toggle(id: string) {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTutti() {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (idsPagina.every((id) => next.has(id))) {
        idsPagina.forEach((id) => next.delete(id));
      } else {
        idsPagina.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function azzeraSelezione() {
    setSelezionati(new Set());
  }

  async function eseguiAzione(azione: AzioneBulk) {
    if (selezionati.size === 0) return;
    if (azione === "elimina") {
      const conferma = window.confirm(
        `Eliminare definitivamente ${selezionati.size} ${selezionati.size === 1 ? "prodotto" : "prodotti"} selezionati?`
      );
      if (!conferma) return;
    }
    setOccupato(true);
    try {
      const res = await fetch(`/api/merchant/stores/${negozioId}/products/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selezionati), azione }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        alert(data?.error?.message ?? "Errore durante l'operazione.");
        return;
      }
      azzeraSelezione();
      router.refresh();
    } catch {
      alert("Errore di rete.");
    } finally {
      setOccupato(false);
    }
  }

  async function salvaQuantita(product: MerchantProduct) {
    const raw = quantitaBozza[product.id] ?? String(product.quantita_disponibile ?? "");
    const parsed = raw.trim() === "" ? null : Number(raw);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      alert("Inserisci una quantità valida (0 o superiore).");
      return;
    }
    setOccupato(true);
    try {
      const res = await fetch(`/api/merchant/stores/${negozioId}/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantitaDisponibile: parsed }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        alert(data?.error?.message ?? "Errore durante il salvataggio.");
        return;
      }
      setQuantitaBozza((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      router.refresh();
    } catch {
      alert("Errore di rete.");
    } finally {
      setOccupato(false);
    }
  }

  return (
    <>
      {/* Barra azioni bulk — visibile solo con selezione attiva */}
      {countSelezionati > 0 && (
        <div className="sticky top-3 z-20 -mx-1 rounded-[1.5rem] border border-blue-200 bg-blue-50/95 p-3 shadow-md backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-800">
              <CheckSquare className="h-4 w-4" />
              {countSelezionati} selezionati
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => eseguiAzione("attiva")}
                disabled={occupato}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white transition hover:bg-yellow-400 hover:text-blue-900 disabled:opacity-50"
              >
                Attiva
              </button>
              <button
                type="button"
                onClick={() => eseguiAzione("disattiva")}
                disabled={occupato}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 disabled:opacity-50"
              >
                Disattiva
              </button>
              <button
                type="button"
                onClick={() => eseguiAzione("elimina")}
                disabled={occupato}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-blue-300 bg-white px-3.5 text-xs font-bold text-blue-600 transition hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Elimina
              </button>
              <button
                type="button"
                onClick={azzeraSelezione}
                disabled={occupato}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-slate-500 transition hover:text-slate-800 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Deseleziona
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {products.map((product) => {
          const imageUrl = getProdottoImmagine({
            immagine_principale: product.immagine_principale,
            categoria: product.categoria,
          });
          const esaurito = prodottoEsaurito(product.quantita_disponibile, product.quantita_riservata);
          const qtaBozza = quantitaBozza[product.id];

          return (
            <div
              key={product.id}
              className={`flex gap-4 rounded-[2rem] border p-4 shadow-sm transition ${
                selezionati.has(product.id)
                  ? "border-blue-400 bg-blue-50/60"
                  : "border-white/70 bg-white hover:shadow-md"
              }`}
            >
              {/* Checkbox selezione */}
              <label className="flex shrink-0 cursor-pointer items-start pt-1">
                <input
                  type="checkbox"
                  checked={selezionati.has(product.id)}
                  onChange={() => toggle(product.id)}
                  aria-label={`Seleziona ${product.nome}`}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600"
                />
                <span className="sr-only">Seleziona {product.nome}</span>
              </label>

              {/* Thumbnail 80x80 */}
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                <Image
                  src={imageUrl}
                  alt={product.nome}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
                {esaurito && (
                  <span className="absolute bottom-0 inset-x-0 bg-blue-600/90 py-0.5 text-center text-[9px] font-black uppercase tracking-wide text-white">
                    Esaurito
                  </span>
                )}
              </div>

              {/* Info + azioni */}
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-slate-900">
                      {product.nome}
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {product.categoria ?? "Categoria"}
                      {product.sottocategoria && ` · ${product.sottocategoria}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        product.attivo
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {product.attivo ? "Attivo" : "Bozza"}
                    </span>
                    {esaurito && (
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600">
                        Esaurito
                      </span>
                    )}
                    {product.prodotto_tipico && (
                      <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-[11px] font-bold text-yellow-800">
                        TIPICO
                      </span>
                    )}
                    {product.prodotto_offerta && (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
                        OFFERTA
                      </span>
                    )}
                    {product.origine_pubblicazione === "ai" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                        <Sparkles className="h-3 w-3" />
                        AI
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="font-semibold text-slate-900">
                      € {Number(product.prezzo ?? 0).toFixed(2)}
                    </span>

                    {/* Modifica rapida quantità */}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={qtaBozza !== undefined ? qtaBozza : String(product.quantita_disponibile ?? "")}
                        onChange={(e) =>
                          setQuantitaBozza((prev) => ({
                            ...prev,
                            [product.id]: e.target.value,
                          }))
                        }
                        aria-label={`Quantità di ${product.nome}`}
                        placeholder="n/d"
                        title={product.quantita_disponibile == null ? "Quantità non tracciata: lascia vuoto" : "Quantità disponibile"}
                        className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <span className="text-[11px] text-slate-400">disp.</span>
                      <button
                        type="button"
                        onClick={() => salvaQuantita(product)}
                        disabled={occupato}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-900 px-2.5 text-[11px] font-bold text-white transition hover:bg-slate-700 disabled:opacity-50"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Aggiorna
                      </button>
                    </div>

                    {esaurito && (
                      <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-semibold text-yellow-700">
                        Da riordinare
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`${basePath}/${product.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Modifica
                    </Link>
                    <MerchantProductDeleteButton
                      negozioId={negozioId}
                      productId={product.id}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
