"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Menu, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import EditorSidebar from "./EditorSidebar";
import { getSezioniVisibili, type SezioneId } from "./editor-sections";
import SezioneEditor from "./SezioneEditor";
import { getSezioneDiBlocco, type BloccoId } from "./editor-sections";
import type { Negozio } from "@/types/negozio";

/** Mappa compatibilità: vecchi id step (8-step) → nuove sezioni (6). */
const STEP_TO_SEZIONE: Record<string, SezioneId> = {
  identita: "attivita",
  contatti: "contatti-orari",
  presentazione: "presentazione",
  catalogo: "catalogo",
  offerte: "catalogo",
  commerciale: "vendita",
  anteprima: "pubblicazione",
  pubblicazione: "pubblicazione",
};

function isSezioneId(v: string | null): v is SezioneId {
  return !!v && ["attivita", "contatti-orari", "presentazione", "catalogo", "vendita", "pubblicazione"].includes(v);
}

/** Normalizza un query step: accetta sezioni nuove O alias vecchi (8-step). */
function normalizzaSezione(v: string | null): SezioneId | null {
  if (!v) return null;
  if (isSezioneId(v)) return v;
  return STEP_TO_SEZIONE[v] ?? null;
}

type Props = {
  storeId: string;
  basePath?: string;
  area?: "admin" | "merchant";
};

export default function StoreEditor({
  storeId,
  basePath = "/merchant",
  area = "merchant",
}: Props) {
  const searchParams = useSearchParams();
  const initialStep = searchParams.get("step");
  const initialBlockRaw = searchParams.get("block");
  const initialBlock = (
    ["identita","contatti-orari","presentazione","catalogo-prodotti","servizi-strutturati","offerte","vendita-commerciale","prenotazioni","richiesta-info","anteprima","pubblicazione"] as const
  ).find((b) => b === initialBlockRaw) as BloccoId | undefined;
  // Se c'è un blocco richiesto, apri direttamente la sua sezione.
  const sezioneDaBlocco = initialBlock ? getSezioneDiBlocco(initialBlock) : null;

  const [activeSezione, setActiveSezione] = useState<SezioneId>(
    () =>
      (normalizzaSezione(initialStep) ?? sezioneDaBlocco?.id) ?? "attivita"
  );
  const [activeBlock, setActiveBlock] = useState<BloccoId | null>(initialBlock ?? null);
  const [store, setStore] = useState<Negozio | null>(null);
  const [counts, setCounts] = useState<{ prodotti: number; offerte: number }>({
    prodotti: 0,
    offerte: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);

  /** Container scrollabile reale dell'editor (cresce oltre il viewport su
   *  tutte le viewport: lo scroll avviene sul documento). */
  const mainRef = useRef<HTMLElement | null>(null);
  /** Root della sezione attiva: viene portato all'inizio della viewport
   *  a ogni cambio sezione (compreso il primo caricamento con ?block=). */
  const sectionRef = useRef<HTMLDivElement | null>(null);

  /** True quando il contenuto della sezione è realmente montato (dati
   *  caricati). Lo scroll va fatto SOLO a contenuto presente: al mount
   *  con deep-link la sezione arriva in modo asincrono dopo il fetch. */
  const contentReady = !loading && !!store && !loadError;

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

  // Aggiorna i conteggi quando si cambia sezione (dati restano allineati).
  useEffect(() => {
    if (!loading) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSezione]);

  // Sync sezione → URL senza navigazione completa.
  useEffect(() => {
    const url =
      activeSezione === "attivita"
        ? `${basePath}/${storeId}/edit`
        : `${basePath}/${storeId}/edit?step=${activeSezione}`;
    window.history.replaceState(null, "", url);
  }, [activeSezione, storeId, basePath]);

  // Quando la sezione attiva cambia (sidebar, drawer mobile, Avanti,
  // Indietro, deep-link con ?step= o ?block=), porta il ROOT della nuova
  // sezione all'inizio della viewport, così il titolo e i primi campi sono
  // subito visibili. Il root è riferito da sectionRef: scrollIntoView agisce
  // sul vero contenitore scrollabile (documento) e lo scroll-margin compensa
  // la top bar sticky dell'area merchant/admin su mobile. Esegue solo quando
  // il contenuto è montato: al primo caricamento con ?block= la sezione
  // arriva in modo asincrono, quindi l'effetto è agganciato a contentReady.
  useEffect(() => {
    if (!contentReady) return;
    // Azzera anche lo scroll interno del main dell'editor, per robustezza
    // in qualunque layout.
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [activeSezione, contentReady]);

  const sezioni = useMemo(() => getSezioniVisibili(store), [store]);

  const current = sezioni.find((s) => s.sezione.id === activeSezione) ?? sezioni[0];
  const currentIdx = sezioni.findIndex((s) => s.sezione.id === current.sezione.id);
  const prev = currentIdx > 0 ? sezioni[currentIdx - 1] : null;
  const next = currentIdx < sezioni.length - 1 ? sezioni[currentIdx + 1] : null;

  const handleSelect = useCallback((id: SezioneId) => {
    setActiveSezione(id);
    setSidebarOpen(false);
  }, []);

  const handleDataChanged = useCallback(() => {
    void refresh();
  }, [refresh]);

  // Quando il blocco richiesto è stato caricato, azzera la richiesta di focus
  // così il prossimo cambio sezione non lo rilancia. La gestione dello scroll
  // avviene in SezioneEditor (dove i blocchi sono renderizzati).
  const blockTarget = activeBlock ?? undefined;

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 shrink-0 border-r border-slate-100 bg-white pt-16 transition-transform duration-200 lg:relative lg:inset-auto lg:z-auto lg:translate-x-0 lg:pt-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <EditorSidebar
          activeSezione={activeSezione}
          onSelect={handleSelect}
          sezioni={sezioni}
          storeName={store?.nome ?? ""}
          basePath={basePath}
          storeId={storeId}
        />
      </aside>

      <main ref={mainRef} className="min-w-0 flex-1 overflow-auto px-4 py-4 sm:px-6 lg:px-8">
        {/* Mobile header */}
        <div className="mb-4 flex items-center gap-3 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-slate-900">
            {current?.sezione.numero}. {current?.sezione.titolo}
          </span>
        </div>

        {loading && !store ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : loadError || !store ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <p className="text-sm text-blue-500">Impossibile caricare i dati del negozio.</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void refresh();
              }}
              className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-bold text-blue-800 transition hover:bg-yellow-300"
            >
              Riprova
            </button>
          </div>
        ) : (
          <div ref={sectionRef} data-section-root className="scroll-mt-12 md:scroll-mt-0">
            {/* Header sezione */}
            <div className="mb-5">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">
                Sezione {current.sezione.numero} di {sezioni.length}
              </p>
              <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900">
                {current.sezione.titolo}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{current.sezione.sottotitolo}</p>
            </div>

            <SezioneEditor
              storeId={storeId}
              store={store}
              basePath={basePath}
              area={area}
              counts={counts}
              onDataChanged={handleDataChanged}
              sezione={current.sezione}
              blocchi={current.blocchi}
              targetBlocco={blockTarget}
            />

            {/* Navigazione avanti/indietro */}
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-4">
              {prev ? (
                <button
                  type="button"
                  onClick={() => setActiveSezione(prev.sezione.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" /> {prev.sezione.numero}. {prev.sezione.titolo}
                </button>
              ) : (
                <span />
              )}
              {next ? (
                <button
                  type="button"
                  onClick={() => setActiveSezione(next.sezione.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-4 py-2.5 text-xs font-bold text-blue-800 shadow-sm transition hover:bg-yellow-300"
                >
                  {next.sezione.numero}. {next.sezione.titolo} <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}