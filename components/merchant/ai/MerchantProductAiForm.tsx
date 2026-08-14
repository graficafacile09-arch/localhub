"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/vision";
import MerchantProductAiUploader from "./MerchantProductAiUploader";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";

type MerchantProductAiFormProps = {
  negozioId: string;
};

type AnalysisResult = {
  suggestion: ProductVisionSuggestion;
  lowConfidence: boolean;
};

export default function MerchantProductAiForm({ negozioId }: MerchantProductAiFormProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);

  function handleResult(value: AnalysisResult) {
    setResult(value);
  }

  return (
    <div className="space-y-6">
      <MerchantProductAiUploader negozioId={negozioId} onResult={handleResult} />

      {result ? (
        <div className="space-y-4">
          {/* Banner avviso bassa confidenza */}
          {result.lowConfidence ? (
            <div className="flex items-start gap-4 rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" aria-hidden />
              <div>
                <p className="text-sm font-bold text-yellow-800">
                  Riconoscimento a bassa confidenza ({result.suggestion.confidenza}%)
                </p>
                <p className="mt-1 text-sm leading-6 text-yellow-700">
                  L&apos;AI non è completamente sicura dell&apos;identificazione del prodotto.
                  Verifica attentamente tutti i campi prima di pubblicare e correggi eventuali errori.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                {result.suggestion.confidenza}%
              </span>
              <p className="text-sm font-semibold text-blue-800">
                Riconoscimento affidabile — controlla i campi e pubblica.
              </p>
            </div>
          )}

          {/* Form pre-compilato con i dati dell'AI */}
          <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                Suggerimento AI
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Controlla e pubblica il prodotto
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                I campi sono stati compilati automaticamente dall&apos;AI. Modificali se necessario.
              </p>
            </div>

            <MerchantProductForm
              negozioId={negozioId}
              initialData={{
                nome: result.suggestion.nome,
                descrizione: result.suggestion.descrizione,
                categoria: result.suggestion.categoria,
                sottocategoria: result.suggestion.sottocategoria ?? undefined,
                marca: result.suggestion.marca ?? undefined,
                colore: result.suggestion.colore ?? undefined,
                materiale: result.suggestion.materiale ?? undefined,
                parole_chiave: result.suggestion.paroleChiave,
                prezzo: result.suggestion.prezzoSuggerito ?? 0,
                prezzo_suggerito: result.suggestion.prezzoSuggerito ?? null,
                immagine_principale: result.suggestion.immaginePrincipale ?? "",
                quantita_disponibile: result.suggestion.quantitaSuggerita,
                stato_condizione: result.suggestion.statoCondizione,
                attivo: true,
                origine_pubblicazione: "ai",
              }}
              submitLabel="Pubblica prodotto"
              onSuccessRedirect={`/merchant/${negozioId}/prodotti`}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6 text-slate-700">
          <p className="text-base font-semibold text-slate-900">Nessun suggerimento disponibile</p>
          <p className="mt-2 text-sm leading-6">
            Carica una foto per lasciare che l&apos;AI compili automaticamente il modulo.
          </p>
        </div>
      )}
    </div>
  );
}
