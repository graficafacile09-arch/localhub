"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Menu, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import EditorSidebar from "./EditorSidebar";
import {
  EDITOR_STEPS,
  statoStep,
  type StepId,
  type StepStatus,
  type StepCounts,
  type StepProps,
} from "./editor-steps";
import type { Negozio } from "@/types/negozio";
import StepIdentita from "./steps/StepIdentita";
import StepContatti from "./steps/StepContatti";
import StepPresentazione from "./steps/StepPresentazione";
import StepCatalogo from "./steps/StepCatalogo";
import StepOfferte from "./steps/StepOfferte";
import StepCommerciale from "./steps/StepCommerciale";
import StepAnteprima from "./steps/StepAnteprima";
import StepPubblicazione from "./steps/StepPubblicazione";

const STEP_COMPONENTS: Record<StepId, React.ComponentType<StepProps>> = {
  identita: StepIdentita,
  contatti: StepContatti,
  presentazione: StepPresentazione,
  catalogo: StepCatalogo,
  offerte: StepOfferte,
  commerciale: StepCommerciale,
  anteprima: StepAnteprima,
  pubblicazione: StepPubblicazione,
};

function isStepId(v: string | null): v is StepId {
  return !!v && EDITOR_STEPS.some((s) => s.id === v);
}

type Props = {
  storeId: string;
  /** /merchant (venditore) oppure /amministratore/negozi (admin). */
  basePath?: string;
};

export default function StoreEditor({ storeId, basePath = "/merchant" }: Props) {
  const searchParams = useSearchParams();
  const initialStep = searchParams.get("step");

  const [activeStep, setActiveStep] = useState<StepId>(() =>
    isStepId(initialStep) ? initialStep : "identita"
  );
  const [store, setStore] = useState<Negozio | null>(null);
  const [counts, setCounts] = useState<StepCounts>({ prodotti: 0, offerte: 0 });
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [settingsRes, productsRes, offerteRes] = await Promise.all([
        fetch(`/api/merchant/stores/${storeId}/settings`),
        fetch(`/api/merchant/stores/${storeId}/products`),
        fetch(`/api/merchant/stores/${storeId}/offerte`),
      ]);
      const settingsJson = await settingsRes.json();
      const productsJson = await productsRes.json();
      const offerteJson = await offerteRes.json();

      if (settingsJson.success) {
        setStore(settingsJson.data.settings as Negozio);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
      if (productsJson.success && Array.isArray(productsJson.data?.products)) {
        setCounts((c) => ({ ...c, prodotti: productsJson.data.products.length }));
      }
      if (offerteJson.success && Array.isArray(offerteJson.data?.offerte)) {
        setCounts((c) => ({ ...c, offerte: offerteJson.data.offerte.length }));
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Aggiorna i conteggi (prodotti/offerte) quando si cambia step, così lo
  // stato della sidebar e il riepilogo restano sempre allineati.
  useEffect(() => {
    if (!loading) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep]);

  // Sync step → URL senza navigazione completa.
  useEffect(() => {
    const url =
      activeStep === "identita"
        ? `${basePath}/${storeId}/edit`
        : `${basePath}/${storeId}/edit?step=${activeStep}`;
    window.history.replaceState(null, "", url);
  }, [activeStep, storeId, basePath]);

  const statuses = useMemo(() => {
    const out: Record<StepId, StepStatus> = {} as Record<StepId, StepStatus>;
    for (const s of EDITOR_STEPS) {
      out[s.id] = statoStep(s.id, store, counts);
    }
    return out;
  }, [store, counts]);

  const stepIndex = EDITOR_STEPS.findIndex((s) => s.id === activeStep);
  const currentStep = EDITOR_STEPS[stepIndex];
  const prevStep = stepIndex > 0 ? EDITOR_STEPS[stepIndex - 1] : null;
  const nextStep = stepIndex < EDITOR_STEPS.length - 1 ? EDITOR_STEPS[stepIndex + 1] : null;

  const handleSelect = useCallback((id: StepId) => {
    setActiveStep(id);
    setSidebarOpen(false);
  }, []);

  const handleDataChanged = useCallback(() => {
    void refresh();
  }, [refresh]);

  const StepComponent = STEP_COMPONENTS[activeStep];

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 shrink-0 border-r border-slate-100 bg-white pt-16 transition-transform duration-200 md:relative md:inset-auto md:z-auto md:translate-x-0 md:pt-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <EditorSidebar
          activeStep={activeStep}
          onSelect={handleSelect}
          statuses={statuses}
          storeName={store?.nome ?? ""}
          basePath={basePath}
          storeId={storeId}
        />
      </aside>

      <main className="min-w-0 flex-1 overflow-auto px-4 py-4 sm:px-6 lg:px-8">
        {/* Mobile header */}
        <div className="mb-4 flex items-center gap-3 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-slate-900">
            {currentStep?.numero}. {currentStep?.titolo}
          </span>
        </div>

        {loading && !store ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : loadError || !store ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <p className="text-sm text-red-500">Impossibile caricare i dati del negozio.</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void refresh();
              }}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
            >
              Riprova
            </button>
          </div>
        ) : (
          <>
            {/* Header step */}
            <div className="mb-5">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">
                Step {currentStep.numero} di {EDITOR_STEPS.length}
              </p>
              <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900">
                {currentStep.titolo}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{currentStep.sottotitolo}</p>
            </div>

            <StepComponent
              storeId={storeId}
              store={store}
              basePath={basePath}
              counts={counts}
              onDataChanged={handleDataChanged}
            />

            {/* Navigazione avanti/indietro */}
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-4">
              {prevStep ? (
                <button
                  type="button"
                  onClick={() => setActiveStep(prevStep.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" /> {prevStep.numero}. {prevStep.titolo}
                </button>
              ) : (
                <span />
              )}
              {nextStep ? (
                <button
                  type="button"
                  onClick={() => setActiveStep(nextStep.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
                >
                  {nextStep.numero}. {nextStep.titolo} <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
