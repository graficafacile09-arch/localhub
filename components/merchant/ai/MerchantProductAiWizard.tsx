"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Home, Sparkles } from "lucide-react";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/vision";
import MerchantProductAiUploader from "./MerchantProductAiUploader";
import MerchantProductResultCard from "./MerchantProductResultCard";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";

type AnalysisResult = {
  suggestion: ProductVisionSuggestion;
  lowConfidence: boolean;
  photoUrl: string;
};

type MerchantProductAiWizardProps = {
  negozioId: string;
};

export default function MerchantProductAiWizard({ negozioId }: MerchantProductAiWizardProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [editing, setEditing] = useState(false);

  function handleResult(value: AnalysisResult) {
    setResult(value);
  }

  function handleRetake() {
    setResult(null);
    setEditing(false);
  }

  function handleEdit() {
    setEditing(true);
  }

  const showScanner = !result && !editing;
  const showResult = result && !editing;
  const showForm = editing && result;

  return (
    <div className="space-y-3">
      {/* Header minimale + Home — compatto */}
      {showScanner && (
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 px-4 py-3 text-white shadow shadow-blue-500/20">
          <Link
            href={`/merchant/${negozioId}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm transition hover:bg-white/25"
            aria-label="Torna alla dashboard"
          >
            <Home className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-200">
              Assistente AI
            </p>
            <p className="text-xs font-semibold text-white/90">Inquadra il prodotto</p>
          </div>
        </div>
      )}

      {showResult && result && (
        <MerchantProductResultCard
          negozioId={negozioId}
          suggestion={result.suggestion}
          lowConfidence={result.lowConfidence}
          photoUrl={result.photoUrl}
          onRetake={handleRetake}
          onEdit={handleEdit}
        />
      )}

      {showScanner && (
        <MerchantProductAiUploader
          negozioId={negozioId}
          onResult={handleResult}
          autoStart
        />
      )}

      {showForm && result && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Modifica prodotto
            </p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">
              {result.suggestion.nome}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Correggi i campi e pubblica.
            </p>
          </div>

          <MerchantProductForm
            negozioId={negozioId}
            initialData={{
              nome: result.suggestion.nome,
              descrizione: result.suggestion.descrizione,
              descrizione_completa: result.suggestion.descrizioneCompleta ?? undefined,
              categoria: result.suggestion.categoria,
              sottocategoria: result.suggestion.sottocategoria ?? undefined,
              marca: result.suggestion.marca ?? undefined,
              colore: result.suggestion.colore ?? undefined,
              materiale: result.suggestion.materiale ?? undefined,
              caratteristiche: result.suggestion.caratteristiche,
              peso_volume: result.suggestion.pesoVolume ?? undefined,
              parole_chiave: result.suggestion.paroleChiave,
              filtri_catalogo: result.suggestion.filtriCatalogo ?? undefined,
              prezzo: result.suggestion.prezzoSuggerito ?? 0,
              prezzo_suggerito: result.suggestion.prezzoSuggerito ?? null,
              immagine_principale: result.suggestion.immaginePrincipale ?? "",
              quantita_disponibile: result.suggestion.quantitaSuggerita,
              stato_condizione: result.suggestion.statoCondizione,
              seo_title: result.suggestion.seoTitle ?? undefined,
              seo_description: result.suggestion.seoDescription ?? undefined,
              alt_text_immagine: result.suggestion.altTextImmagine ?? undefined,
              attivo: true,
              origine_pubblicazione: "ai",
            }}
            submitLabel="Pubblica prodotto"
            onSuccessRedirect={`/merchant/${negozioId}/prodotti`}
          />

          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Torna al risultato
          </button>
        </div>
      )}
    </div>
  );
}
