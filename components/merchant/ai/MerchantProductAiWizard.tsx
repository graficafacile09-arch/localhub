"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Sparkles } from "lucide-react";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/vision";
import MerchantProductAiUploader from "./MerchantProductAiUploader";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";

// ─── Tipi ─────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;
// 1 = upload foto
// 2 = analisi AI in corso (stato transitorio gestito dentro l'uploader)
// 3 = form pre-compilato + pubblica

type AnalysisResult = {
  suggestion: ProductVisionSuggestion;
  lowConfidence: boolean;
};

type MerchantProductAiWizardProps = {
  negozioId: string;
};

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Foto" },
  { id: 2, label: "Analisi AI" },
  { id: 3, label: "Pubblica" },
];

function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const done = current > step.id;
        const active = current === step.id;

        return (
          <div key={step.id} className="flex items-center">
            {/* Cerchio step */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all
                  ${done ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200" : ""}
                  ${active ? "bg-blue-600 text-white shadow-md shadow-blue-300/50 ring-4 ring-blue-100" : ""}
                  ${!done && !active ? "border-2 border-slate-200 bg-white text-slate-400" : ""}
                `}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : step.id}
              </div>
              <span
                className={`text-xs font-semibold ${active ? "text-blue-700" : done ? "text-emerald-600" : "text-slate-400"}`}
              >
                {step.label}
              </span>
            </div>

            {/* Linea connettore */}
            {idx < STEPS.length - 1 && (
              <div
                className={`mb-5 h-0.5 w-12 sm:w-20 transition-colors ${done ? "bg-emerald-400" : "bg-slate-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Wizard principale ────────────────────────────────────────────────────────

export default function MerchantProductAiWizard({ negozioId }: MerchantProductAiWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  function handleResult(value: AnalysisResult) {
    setResult(value);
    setStep(3);
  }

  function handleReset() {
    setResult(null);
    setStep(1);
  }

  return (
    <div className="space-y-6">
      {/* Header wizard */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              Assistente AI
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              Aggiungi prodotto con AI
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Scatta una foto — l&apos;AI riconosce il prodotto e compila l&apos;annuncio automaticamente.
            </p>
          </div>

          <StepIndicator current={step} />
        </div>
      </div>

      {/* ── STEP 1 & 2: Upload + analisi ─────────────────────────────────────── */}
      {step === 1 || step === 2 ? (
        <MerchantProductAiUploader
          negozioId={negozioId}
          onResult={handleResult}
          onAnalysisStart={() => setStep(2)}
        />
      ) : null}

      {/* ── STEP 3: Form pre-compilato + pubblica ────────────────────────────── */}
      {step === 3 && result ? (
        <div className="space-y-4">
          {/* Banner confidenza */}
          {result.lowConfidence ? (
            <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <div>
                <p className="text-sm font-bold text-amber-800">
                  Riconoscimento a bassa confidenza ({result.suggestion.confidenza}%)
                </p>
                <p className="mt-1 text-sm leading-6 text-amber-700">
                  L&apos;AI non è del tutto sicura dell&apos;identificazione. Verifica i campi prima di pubblicare.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                  {result.suggestion.confidenza}%
                </span>
                <p className="text-sm font-semibold text-emerald-800">
                  Prodotto riconosciuto — controlla i campi e pubblica.
                </p>
              </div>
            </div>
          )}

          {/* Form pre-compilato */}
          <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                  Step 3 — Rivedi e pubblica
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                  Dati compilati dall&apos;AI
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Modifica qualsiasi campo, poi premi &quot;Pubblica prodotto&quot; per salvare.
                </p>
              </div>

              {/* Pulsante ricomincia */}
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
              >
                <Camera className="h-4 w-4" />
                Nuova foto
              </button>
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

          {/* Link torna indietro */}
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Ricomincia con una foto diversa
          </button>
        </div>
      ) : null}
    </div>
  );
}
