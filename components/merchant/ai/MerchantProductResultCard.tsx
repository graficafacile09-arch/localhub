"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Pencil, RotateCcw } from "lucide-react";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/vision";

type ResultCardProps = {
  negozioId: string;
  suggestion: ProductVisionSuggestion;
  lowConfidence: boolean;
  photoUrl: string;
  onRetake: () => void;
  onEdit: () => void;
};

export default function MerchantProductResultCard({
  negozioId,
  suggestion,
  lowConfidence,
  photoUrl,
  onRetake,
  onEdit,
}: ResultCardProps) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      const payload = {
        nome: suggestion.nome,
        descrizione: suggestion.descrizione,
        descrizioneCompleta: suggestion.descrizioneCompleta || undefined,
        categoria: suggestion.categoria,
        sottocategoria: suggestion.sottocategoria || null,
        marca: suggestion.marca || undefined,
        colore: suggestion.colore || undefined,
        materiale: suggestion.materiale || undefined,
        caratteristiche: suggestion.caratteristiche,
        pesoVolume: suggestion.pesoVolume || undefined,
        paroleChiave: suggestion.paroleChiave,
        filtriCatalogo: suggestion.filtriCatalogo || undefined,
        prezzo: suggestion.prezzoSuggerito ?? 0,
        quantitaDisponibile: suggestion.quantitaSuggerita,
        statoCondizione: suggestion.statoCondizione,
        immaginePrincipale: suggestion.immaginePrincipale || "",
        seoTitle: suggestion.seoTitle || undefined,
        seoDescription: suggestion.seoDescription || undefined,
        altTextImmagine: suggestion.altTextImmagine || undefined,
        attivo: true,
        originePubblicazione: "ai",
      };

      const res = await fetch(`/api/merchant/stores/${negozioId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? "Errore durante la pubblicazione.");
      }

      setPublished(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore imprevisto.");
    } finally {
      setPublishing(false);
    }
  }

  if (published) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500">
          <CheckCircle2 className="h-6 w-6 text-white" />
        </div>
        <p className="mt-3 text-base font-bold text-emerald-900">Prodotto pubblicato</p>
        <p className="mt-1 text-sm text-emerald-700">{suggestion.nome} è ora nel catalogo.</p>
        <button
          type="button"
          onClick={onRetake}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
        >
          <RotateCcw className="h-4 w-4" />
          Aggiungi un altro prodotto
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Confidenza banner — compatto */}
      <div className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold ${lowConfidence ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
        {lowConfidence ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Bassa confidenza ({suggestion.confidenza}%) — verifica i dati</span>
          </>
        ) : (
          <>
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
              {suggestion.confidenza}%
            </span>
            <span>Prodotto riconosciuto</span>
          </>
        )}
      </div>

      <div className="p-4">
        {/* Riga superiore: immagine + dati */}
        <div className="flex gap-4">
          <div className="shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="h-[120px] w-[120px] rounded-xl object-cover border border-slate-200"
              />
            ) : (
              <div className="flex h-[120px] w-[120px] items-center justify-center rounded-xl bg-slate-100 text-slate-400 text-sm font-semibold">
                No img
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-black tracking-tight text-slate-900 truncate">
                {suggestion.nome}
              </h2>
              {suggestion.marca && (
                <p className="text-xs font-semibold text-slate-500 truncate">{suggestion.marca}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 leading-tight">
                  {suggestion.categoria}
                </span>
                {suggestion.sottocategoria && (
                  <span className="text-[11px] text-slate-400">{suggestion.sottocategoria}</span>
                )}
              </div>
            </div>

            {/* Prezzo — elemento principale */}
            {suggestion.prezzoSuggerito != null && (
              <div className="mt-3 inline-flex items-baseline gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 self-start">
                <span className="text-xl font-black text-emerald-800">
                  €{suggestion.prezzoSuggerito.toFixed(2)}
                </span>
                <span className="text-[10px] font-medium text-emerald-600">prezzo indicativo</span>
              </div>
            )}
          </div>
        </div>

        {/* Descrizione */}
        {suggestion.descrizione && (
          <p className="mt-3 text-sm leading-5 text-slate-600 line-clamp-3">
            {suggestion.descrizione}
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Azioni */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="flex-1 rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 px-3 py-2.5 text-sm font-bold text-white shadow shadow-blue-500/20 transition hover:shadow-md hover:shadow-blue-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {publishing ? "Pubblicazione..." : "Pubblica"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Modifica
          </button>
          <button
            type="button"
            onClick={onRetake}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Riprova
          </button>
        </div>
      </div>
    </div>
  );
}
