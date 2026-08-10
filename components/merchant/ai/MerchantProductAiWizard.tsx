"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/vision";
import type { MerchantProductPayload } from "@/components/merchant/MerchantProductForm";
import MerchantProductAiUploader from "./MerchantProductAiUploader";
import MerchantProductResultCard from "./MerchantProductResultCard";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";
import MerchantCorreggiAiDialog from "./MerchantCorreggiAiDialog";

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

  function handleResult(value: AnalysisResult) {
    setResult(value);
    setSuggestion(value.suggestion);
  }

  /** Unico reset esplicito: riporta allo scanner (Riprova / Aggiungi un altro prodotto). */
  function handleRetake() {
    setResult(null);
    setSuggestion(null);
    setEditing(false);
    setCorreggiAperto(false);
    setProdottoSalvato(null);
  }

  /** Apre l'editor NELLO STESSO annuncio: nessuna chiusura/redirect. */
  function handleEdit() {
    setEditing(true);
  }

  /** Applica il draft corretto dall'AI: aggiorna solo lo stato in memoria. */
  function handleCorreggiConfermata(aggiornata: ProductVisionSuggestion) {
    setSuggestion(aggiornata);
    setResult((prev) => (prev ? { ...prev, suggestion: aggiornata } : prev));
    setCorreggiAperto(false);
  }

  /**
   * Salvataggio confermato dall'editor: NESSUN redirect, nessuna chiusura
   * dell'annuncio. Aggiorna immediatamente i dati visualizzati con i valori
   * appena salvati e torna alla visualizzazione dell'annuncio (editing=false).
   * Se il prodotto è stato creato adesso, registra l'id: i salvataggi
   * successivi usano PUT sullo stesso prodotto (niente duplicati).
   */
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
