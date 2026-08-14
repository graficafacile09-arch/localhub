"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Home, Pencil, X } from "lucide-react";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/vision";
import type { MerchantProductPayload } from "@/components/merchant/MerchantProductForm";
import MerchantProductAiUploader from "./MerchantProductAiUploader";
import MerchantProductResultCard from "./MerchantProductResultCard";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";
import MerchantCorreggiAiDialog from "./MerchantCorreggiAiDialog";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type AnalysisResult = {
  suggestion: ProductVisionSuggestion;
  lowConfidence: boolean;
  photoUrl: string;
};

/** Prodotto già salvato/pubblicato: id (per i salvataggi successivi → PUT) e dati. */
type ProdottoSalvato = {
  id: string;
  dati: MerchantProductPayload;
};

type MerchantProductAiWizardProps = {
  negozioId: string;
  /** Link di ritorno alla dashboard (default: pagina negozio venditore). */
  backHref?: string;
  /**
   * Mantenuto per compatibilità con i chiamanti esistenti. Dopo il salvataggio
   * il wizard NON effettua redirect: resta sull'annuncio con i dati aggiornati.
   */
  onSuccessRedirect?: string;
};

/** Applica i valori appena salvati dal form sul suggestion dell'annuncio. */
function applicaSalvataggio(
  originale: ProductVisionSuggestion,
  p: MerchantProductPayload
): ProductVisionSuggestion {
  return {
    ...originale,
    nome: p.nome,
    descrizione: p.descrizione,
    descrizioneCompleta: p.descrizioneCompleta ?? originale.descrizioneCompleta,
    categoria: p.categoria,
    sottocategoria: p.sottocategoria,
    marca: p.marca ?? null,
    colore: p.colore ?? null,
    materiale: p.materiale ?? null,
    caratteristiche: p.caratteristiche,
    pesoVolume: p.pesoVolume ?? null,
    paroleChiave: p.paroleChiave,
    filtriCatalogo: p.filtriCatalogo ?? null,
    prezzoSuggerito: p.prezzo,
    quantitaSuggerita: p.quantitaDisponibile,
    statoCondizione: p.statoCondizione,
    immaginePrincipale: p.immaginePrincipale || originale.immaginePrincipale,
    seoTitle: p.seoTitle ?? null,
    seoDescription: p.seoDescription ?? null,
    altTextImmagine: p.altTextImmagine ?? null,
  };
}

export default function MerchantProductAiWizard({
  negozioId,
  backHref = `/merchant/${negozioId}`,
}: MerchantProductAiWizardProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [suggestion, setSuggestion] = useState<ProductVisionSuggestion | null>(null);
  const [editing, setEditing] = useState(false);
  const [correggiAperto, setCorreggiAperto] = useState(false);
  const [prodottoSalvato, setProdottoSalvato] = useState<ProdottoSalvato | null>(null);
  /** True se l'editor ha modifiche non salvate. */
  const [formDirty, setFormDirty] = useState(false);
  const formDirtyRef = useRef(false);
  /** Dialog controllato di conferma uscita (mai alert nativo). */
  const [uscitaConferma, setUscitaConferma] = useState(false);

  function handleResult(value: AnalysisResult) {
    setResult(value);
    setSuggestion(value.suggestion);
  }

  /** Unico reset esplicito che riapre lo scanner: "Nuova scansione" / "Aggiungi un altro prodotto". */
  function handleRetake() {
    setResult(null);
    setSuggestion(null);
    setEditing(false);
    setCorreggiAperto(false);
    setProdottoSalvato(null);
    setFormDirty(false);
    formDirtyRef.current = false;
  }

  /**
   * "Modifica" apre l'editor NELLO STESSO annuncio: nessuna chiusura, nessun
   * reset, nessuna fotocamera. La fotocamera è raggiungibile SOLO tramite
   * "Nuova scansione" (handleRetake).
   */
  function handleEdit() {
    setEditing(true);
  }

  /** Applica il draft corretto dall'AI: aggiorna lo stato dell'annuncio in memoria. */
  function handleCorreggiConfermata(aggiornata: ProductVisionSuggestion) {
    setSuggestion(aggiornata);
    setResult((prev) => (prev ? { ...prev, suggestion: aggiornata } : prev));
    setCorreggiAperto(false);
  }

  /** Salvataggio confermato dall'editor: NESSUN redirect, NESSUNA chiusura. */
  function handleFormSuccess(esito: {
    payload: MerchantProductPayload;
    productId: string | null;
  }) {
    if (suggestion) {
      const aggiornata = applicaSalvataggio(suggestion, esito.payload);
      setSuggestion(aggiornata);
      setResult((prev) =>
        prev
          ? {
              ...prev,
              suggestion: aggiornata,
              // Se l'immagine è stata cambiata nell'editor, aggiorna anche la foto dell'annuncio.
              photoUrl: esito.payload.immaginePrincipale || prev.photoUrl,
            }
          : prev
      );
    }
    if (esito.productId) {
      setProdottoSalvato({ id: esito.productId, dati: esito.payload });
    }
    setEditing(false);
    setFormDirty(false);
    formDirtyRef.current = false;
  }

  function handleFormDirty(dirty: boolean) {
    formDirtyRef.current = dirty;
    setFormDirty(dirty);
  }

  /** Chiudi l'editor: se ci sono modifiche non salvate chiede conferma. */
  function richiediUscitaEditor() {
    if (formDirtyRef.current) {
      setUscitaConferma(true);
      return;
    }
    setEditing(false);
  }

  /** "Esci senza salvare": torna alla visualizzazione dell'annuncio (mai alla lista/scanner). */
  function esciSenzaSalvare() {
    setUscitaConferma(false);
    setEditing(false);
    setFormDirty(false);
    formDirtyRef.current = false;
  }

  // ── Protezione ESC: mai chiudere/uscire senza conferma se ci sono modifiche ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Il dialog di conferma uscita gestisce il suo ESC da sé.
      if (uscitaConferma) return;
      if (editing) richiediUscitaEditor();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, uscitaConferma]);

  // ── Protezione ricarica/chiusura tab con modifiche non salvate ──────────────
  useEffect(() => {
    if (!(editing && formDirtyRef.current)) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editing, formDirty]);

  // ── Nasconde la bottom nav mobile mentre l'editor è aperto (z-[60] sopra z-50) ──
  // Stesso pattern del dialog di correzione: senza questa classe la barra
  // copre il pulsante "Pubblica prodotto" su mobile.
  useEffect(() => {
    if (!editing) return;
    document.body.classList.add("correggi-ai-aperto");
    return () => document.body.classList.remove("correggi-ai-aperto");
  }, [editing]);

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
            giàSalvato={prodottoSalvato}
          />
        )}

        {showScanner && (
          <MerchantProductAiUploader
            negozioId={negozioId}
            onResult={handleResult}
            autoStart
          />
        )}
      </div>

      {/* ── EDITOR DELLO STESSO ANNUNCIO (modal): mai fotocamera, mai redirect ── */}
      {showForm && result && suggestion && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Modifica prodotto"
        >
          {/* Backdrop: NON chiude mai se ci sono modifiche non salvate */}
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={richiediUscitaEditor}
            aria-hidden
          />

          <div className="relative flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            {/* Header */}
            <div className="flex items-center gap-3 bg-gradient-to-b from-blue-600 to-blue-700 px-5 py-4 text-white">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Pencil className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-200">
                  Modifica prodotto
                </p>
                <p className="truncate text-sm font-black tracking-tight">{suggestion.nome}</p>
              </div>
              <button
                type="button"
                onClick={richiediUscitaEditor}
                aria-label="Chiudi editor"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Corpo scrollabile */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <MerchantProductForm
                negozioId={negozioId}
                productId={prodottoSalvato?.id}
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
                submitLabel={prodottoSalvato ? "Aggiorna prodotto" : "Pubblica prodotto"}
                onSuccess={handleFormSuccess}
                onDirtyChange={handleFormDirty}
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={richiediUscitaEditor}
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Torna al risultato
              </button>
              {formDirty && (
                <span className="rounded-full bg-yellow-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-yellow-700">
                  Modifiche non salvate
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog CONTROLLATO di conferma uscita (mai alert nativo) ────────── */}
      <ConfirmDialog
        open={uscitaConferma}
        title="Vuoi davvero uscire?"
        message="Hai delle modifiche non salvate. Se esci ora le perderai."
        confirmLabel="Esci senza salvare"
        cancelLabel="Continua modifica"
        destructive
        onConfirm={esciSenzaSalvare}
        onCancel={() => setUscitaConferma(false)}
      />

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
