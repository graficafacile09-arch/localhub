"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/vision";
import MerchantProductAiUploader from "./MerchantProductAiUploader";
import MerchantProductResultCard from "./MerchantProductResultCard";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";
import MerchantCorreggiAiDialog from "./MerchantCorreggiAiDialog";

type AnalysisResult = {
  suggestion: ProductVisionSuggestion;
  lowConfidence: boolean;
  photoUrl: string;
};

type MerchantProductAiWizardProps = {
  negozioId: string;
  /** Link di ritorno alla dashboard (default: pagina negozio venditore). */
  backHref?: string;
  /** Redirect dopo il salvataggio (default: elenco prodotti venditore). */
  onSuccessRedirect?: string;
};

export default function MerchantProductAiWizard({
  negozioId,
  backHref = `/merchant/${negozioId}`,
  onSuccessRedirect = `/merchant/${negozioId}/prodotti`,
}: MerchantProductAiWizardProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [suggestion, setSuggestion] = useState<ProductVisionSuggestion | null>(null);
  const [editing, setEditing] = useState(false);
  const [correggiAperto, setCorreggiAperto] = useState(false);

  function handleResult(value: AnalysisResult) {
    setResult(value);
    setSuggestion(value.suggestion);
  }

  function handleRetake() {
    setResult(null);
    setSuggestion(null);
    setEditing(false);
    setCorreggiAperto(false);
  }

  function handleEdit() {
    setEditing(true);
  }

  /** Applica il draft corretto dall'AI: aggiorna solo lo stato in memoria. */
  function handleCorreggiConfermata(aggiornata: ProductVisionSuggestion) {
    setSuggestion(aggiornata);
    setResult((prev) => (prev ? { ...prev, suggestion: aggiornata } : prev));
    setCorreggiAperto(false);
  }

  const showScanner = !result && !editing;
  const showResult = result && !editing;
  const showForm = editing && result;

  return (
    <>
    <div className="space-y-3">
      {showScanner && (
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 px-4 py-3 text-white shadow shadow-blue-500/20">
          <Link
            href={backHref}
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

      {showResult && result && suggestion && (
        <MerchantProductResultCard
          negozioId={negozioId}
          suggestion={suggestion}
          lowConfidence={result.lowConfidence}
          photoUrl={result.photoUrl}
          onRetake={handleRetake}
          onEdit={handleEdit}
          onCorreggi={() => setCorreggiAperto(true)}
        />
      )}

      {showScanner && (
        <MerchantProductAiUploader
          negozioId={negozioId}
          onResult={handleResult}
          autoStart
        />
      )}

      {showForm && result && suggestion && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Modifica prodotto
            </p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">
              {suggestion.nome}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Correggi i campi e pubblica.
            </p>
          </div>

          <MerchantProductForm
            negozioId={negozioId}
            key={JSON.stringify(suggestion)}
            initialData={{
              nome: suggestion.nome,
              descrizione: suggestion.descrizione,
              descrizione_completa: suggestion.descrizioneCompleta ?? undefined,
              categoria: suggestion.categoria,
              sottocategoria: suggestion.sottocategoria ?? undefined,
              marca: suggestion.marca ?? undefined,
              colore: suggestion.colore ?? undefined,
              materiale: suggestion.materiale ?? undefined,
              caratteristiche: suggestion.caratteristiche,
              peso_volume: suggestion.pesoVolume ?? undefined,
              parole_chiave: suggestion.paroleChiave,
              filtri_catalogo: suggestion.filtriCatalogo ?? undefined,
              prezzo: suggestion.prezzoSuggerito ?? 0,
              prezzo_suggerito: suggestion.prezzoSuggerito ?? null,
              immagine_principale: result.photoUrl || (suggestion.immaginePrincipale ?? ""),
              quantita_disponibile: suggestion.quantitaSuggerita,
              stato_condizione: suggestion.statoCondizione,
              seo_title: suggestion.seoTitle ?? undefined,
              seo_description: suggestion.seoDescription ?? undefined,
              alt_text_immagine: suggestion.altTextImmagine ?? undefined,
              attivo: true,
              origine_pubblicazione: "ai",
            }}
            submitLabel="Pubblica prodotto"
            onSuccessRedirect={onSuccessRedirect}
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

    {correggiAperto && result && suggestion && (
      <MerchantCorreggiAiDialog
        negozioId={negozioId}
        suggestion={suggestion}
        photoUrl={result.photoUrl}
        onClose={() => setCorreggiAperto(false)}
        onConfirm={handleCorreggiConfermata}
      />
    )}
    </>
  );
}
