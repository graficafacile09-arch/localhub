"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Pencil, RotateCcw, Sparkles } from "lucide-react";
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
      <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500">
          <CheckCircle2 className="h-7 w-7 text-white" />
        </div>
        <p className="mt-4 text-lg font-bold text-emerald-900">Prodotto pubblicato</p>
        <p className="mt-1 text-sm text-emerald-700">{suggestion.nome} è ora nel catalogo.</p>
        <button
          type="button"
          onClick={onRetake}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-emerald-300 bg-white px-5 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
        >
          <RotateCcw className="h-4 w-4" />
          Aggiungi un altro prodotto
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      {/* Confidenza banner */}
      {lowConfidence ? (
        <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50 px-5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs leading-5 text-amber-800">
            Riconoscimento a bassa confidenza ({suggestion.confidenza}%). Verifica i dati prima di pubblicare.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50 px-5 py-2.5">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
            {suggestion.confidenza}%
          </span>
          <p className="text-xs font-semibold text-emerald-800">Prodotto riconosciuto</p>
        </div>
      )}

      {/* Corpo scheda */}
      <div className="p-5">
        <div className="flex gap-4">
          {/* Miniatura foto */}
          <div className="shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt="Foto prodotto"
                className="h-24 w-24 rounded-xl object-cover border border-slate-200"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <Sparkles className="h-6 w-6" />
              </div>
            )}
          </div>

          {/* Dati prodotto */}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black tracking-tight text-slate-900 truncate">
              {suggestion.nome}
            </h2>
            {suggestion.marca && (
              <p className="mt-0.5 text-sm font-semibold text-slate-500">{suggestion.marca}</p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                {suggestion.categoria}
              </span>
              {suggestion.sottocategoria && (
                <span className="text-xs text-slate-400">{suggestion.sottocategoria}</span>
              )}
            </div>
          </div>
        </div>

        {/* Descrizione */}
        {suggestion.descrizione && (
          <p className="mt-4 text-sm leading-6 text-slate-600">
            {suggestion.descrizione}
          </p>
        )}

        {/* Prezzo */}
        {suggestion.prezzoSuggerito != null && (
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">
              €{suggestion.prezzoSuggerito.toFixed(2)}
            </span>
            <span className="text-xs text-slate-400">prezzo indicativo</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Azioni */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="flex-1 rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {publishing ? "Pubblicazione..." : "Pubblica"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Pencil className="h-4 w-4" />
            Modifica
          </button>
          <button
            type="button"
            onClick={onRetake}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Riprova
          </button>
        </div>
      </div>
    </div>
  );
}
