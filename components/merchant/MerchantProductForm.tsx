"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronDown, ChevronUp, ImagePlus, Tag, Truck, Wheat } from "lucide-react";
import ProductGalleryManager from "@/components/merchant/products/ProductGalleryManager";
import { Toggle } from "@/components/merchant/modules/ModuleFields";
import type { MerchantProduct } from "@/lib/merchant/types";

/** Valori salvati dal form, passati al chiamante quando non si fa redirect. */
export type MerchantProductPayload = {
  nome: string;
  descrizione: string;
  descrizioneCompleta?: string;
  categoria: string;
  sottocategoria: string | null;
  marca?: string;
  colore?: string;
  materiale?: string;
  caratteristiche: string[];
  pesoVolume?: string;
  /** Peso reale in grammi (motore tariffario spedizioni). */
  pesoGrammi?: number | null;
  /** Tariffa corriere locale per prodotto (unica tariffa del venditore). */
  costoSpedizioneLocale?: number | null;
  paroleChiave: string[];
  filtriCatalogo?: Record<string, string>;
  prezzo: number;
  prezzoSuggerito: number | null;
  quantitaDisponibile: number;
  statoCondizione: "nuovo" | "usato" | "ricondizionato";
  immaginePrincipale: string;
  seoTitle?: string;
  seoDescription?: string;
  altTextImmagine?: string;
  attivo: boolean;
  originePubblicazione: string;
  prodottoTipico: boolean;
  /** True se il prodotto è in offerta (vetrina "Offerte", badge rosso). */
  prodottoOfferta: boolean;
};

type MerchantProductFormProps = {
  negozioId: string;
  productId?: string;
  initialData?: Partial<MerchantProduct>;
  submitLabel?: string;
  onSuccessRedirect?: string;
  /**
   * Se fornito, dopo il salvataggio NON viene eseguito alcun redirect: il
   * chiamante resta nella stessa vista (es. annuncio prodotto del wizard AI)
   * e riceve i valori salvati + l'id del prodotto creato/aggiornato.
   */
  onSuccess?: (esito: {
    payload: MerchantProductPayload;
    productId: string | null;
  }) => void;
  /**
   * Notifica il chiamante quando il form ha modifiche non salvate (true) o
   * quando torna a coincidere con i valori iniziali (false). Usato dal wizard
   * AI per proteggere l'uscita dall'editor con un dialog di conferma.
   */
  onDirtyChange?: (dirty: boolean) => void;
};

const DEFAULT_PRODUCT_FORM = {
  nome: "",
  descrizione: "",
  descrizione_completa: "",
  categoria: "",
  sottocategoria: "",
  marca: "",
  colore: "",
  materiale: "",
  caratteristiche: "",
  peso_volume: "",
  peso_grammi: null as number | null,
  costo_spedizione_locale: null as number | null,
  parole_chiave: "",
  filtri_catalogo: "",
  prezzo: 0,
  prezzoSuggerito: null as number | null,
  quantitaDisponibile: 1 as number | null,
  statoCondizione: "nuovo" as "nuovo" | "usato" | "ricondizionato",
  immaginePrincipale: "",
  seo_title: "",
  seo_description: "",
  alt_text_immagine: "",
  attivo: true,
  originePubblicazione: "manuale",
  prodotto_tipico: false,
  prodotto_offerta: false,
};

export default function MerchantProductForm({
  negozioId,
  productId,
  initialData,
  submitLabel = productId ? "Aggiorna prodotto" : "Pubblica prodotto",
  onSuccessRedirect,
  onSuccess,
  onDirtyChange,
}: MerchantProductFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newImageDataUrl, setNewImageDataUrl] = useState<string | null>(null);
  // True se il prodotto appartiene alla vetrina "Prodotti tipici" (homepage).
  const [prodottoTipico, setProdottoTipico] = useState(Boolean(initialData?.prodotto_tipico));
  // True se il prodotto è in offerta (vetrina "Offerte", badge rosso).
  const [prodottoOfferta, setProdottoOfferta] = useState(Boolean(initialData?.prodotto_offerta));

  // ── Rilevamento modifiche non salvate ────────────────────────────────────
  const dirtyRef = useRef(false);
  const snapshotRef = useRef<string | null>(null);

  /** Normalizza in stringa anche i valori array (caratteristiche/parole_chiave). */
  function str(v: unknown): string {
    if (Array.isArray(v)) return v.join(", ");
    return String(v ?? "").trim();
  }

  function snapshotIniziale(): string {
    return JSON.stringify({
      nome: str(initialValues.nome),
      descrizione: str(initialValues.descrizione),
      descrizione_completa: str(initialValues.descrizione_completa),
      categoria: str(initialValues.categoria),
      sottocategoria: str(initialValues.sottocategoria),
      marca: str(initialValues.marca),
      colore: str(initialValues.colore),
      materiale: str(initialValues.materiale),
      caratteristiche: str(initialValues.caratteristiche),
      peso_volume: str(initialValues.peso_volume),
      peso_grammi: str(initialValues.peso_grammi),
      costo_spedizione_locale: str(initialValues.costo_spedizione_locale),
      parole_chiave: str(initialValues.parole_chiave),
      filtri_catalogo: str(initialValues.filtri_catalogo),
      prezzo: str(initialValues.prezzo),
      quantitaDisponibile: str(initialValues.quantitaDisponibile),
      statoCondizione: str(initialValues.statoCondizione),
      immaginePrincipale: str(initialValues.immaginePrincipale),
      seo_title: str(initialValues.seo_title),
      seo_description: str(initialValues.seo_description),
      alt_text_immagine: str(initialValues.alt_text_immagine),
      prodotto_tipico: String(Boolean(initialValues.prodotto_tipico)),
      prodotto_offerta: String(Boolean(initialValues.prodotto_offerta)),
    });
  }

  function getSnapshot(): string {
    if (snapshotRef.current === null) snapshotRef.current = snapshotIniziale();
    return snapshotRef.current;
  }

  function notifyDirty(next: boolean) {
    if (dirtyRef.current === next) return;
    dirtyRef.current = next;
    onDirtyChange?.(next);
  }

  function handleFormChange(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    const current = JSON.stringify({
      nome: get("nome"),
      descrizione: get("descrizione"),
      descrizione_completa: get("descrizione_completa"),
      categoria: get("categoria"),
      sottocategoria: get("sottocategoria"),
      marca: get("marca"),
      colore: get("colore"),
      materiale: get("materiale"),
      caratteristiche: get("caratteristiche"),
      peso_volume: get("peso_volume"),
      peso_grammi: get("peso_grammi"),
      costo_spedizione_locale: get("costo_spedizione_locale"),
      parole_chiave: get("parole_chiave"),
      filtri_catalogo: get("filtri_catalogo"),
      prezzo: get("prezzo"),
      quantitaDisponibile: get("quantitaDisponibile"),
      statoCondizione: get("statoCondizione"),
      immaginePrincipale: newImageDataUrl ?? get("immaginePrincipale"),
      seo_title: get("seo_title"),
      seo_description: get("seo_description"),
      alt_text_immagine: get("alt_text_immagine"),
      prodotto_tipico: String(prodottoTipico),
      prodotto_offerta: String(prodottoOfferta),
    });
    notifyDirty(current !== getSnapshot());
  }

  const initialValues = initialData
    ? {
        nome: initialData.nome ?? "",
        descrizione: initialData.descrizione ?? "",
        descrizione_completa: initialData.descrizione_completa ?? "",
        categoria: initialData.categoria ?? "",
        sottocategoria: initialData.sottocategoria ?? "",
        marca: initialData.marca ?? "",
        colore: initialData.colore ?? "",
        materiale: initialData.materiale ?? "",
        caratteristiche:
          Array.isArray(initialData.caratteristiche) && initialData.caratteristiche.length > 0
            ? initialData.caratteristiche.join(", ")
            : (initialData.caratteristiche as string | null | undefined) ?? "",
        peso_volume: initialData.peso_volume ?? "",
        peso_grammi: initialData.peso_grammi ?? null,
        costo_spedizione_locale: initialData.costo_spedizione_locale ?? null,
        parole_chiave:
          Array.isArray(initialData.parole_chiave) && initialData.parole_chiave.length > 0
            ? initialData.parole_chiave.join(", ")
            : (initialData.parole_chiave as string | null | undefined) ?? "",
        filtri_catalogo:
          initialData.filtri_catalogo && typeof initialData.filtri_catalogo === "object"
            ? Object.entries(initialData.filtri_catalogo as Record<string, string>)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ")
            : (initialData.filtri_catalogo as string | null | undefined) ?? "",
        prezzo: initialData.prezzo ?? 0,
        prezzoSuggerito: initialData.prezzo_suggerito ?? null,
        quantitaDisponibile: initialData.quantita_disponibile ?? 1,
        statoCondizione: (initialData.stato_condizione ?? "nuovo") as "nuovo" | "usato" | "ricondizionato",
        immaginePrincipale: initialData.immagine_principale ?? "",
        seo_title: initialData.seo_title ?? "",
        seo_description: initialData.seo_description ?? "",
        alt_text_immagine: initialData.alt_text_immagine ?? "",
        attivo: initialData.attivo ?? true,
        originePubblicazione: initialData.origine_pubblicazione ?? "manuale",
        prodotto_tipico: initialData.prodotto_tipico ?? false,
        prodotto_offerta: initialData.prodotto_offerta ?? false,
      }
    : DEFAULT_PRODUCT_FORM;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);

    // Validazione esplicita prima della chiamata API: evita che il venditore
    // prema "Pubblica" senza sapere quale campo obbligatorio manca.
    const nome = String(formData.get("nome") ?? "").trim();
    const descrizione = String(formData.get("descrizione") ?? "").trim();
    const categoria = String(formData.get("categoria") ?? "").trim();

    if (!nome) {
      setError("Inserisci il nome del prodotto.");
      setSubmitting(false);
      return;
    }
    if (!descrizione) {
      setError("Inserisci una descrizione del prodotto.");
      setSubmitting(false);
      return;
    }
    if (!categoria) {
      setError("Inserisci la categoria del prodotto.");
      setSubmitting(false);
      return;
    }

    const prezzoRaw = String(formData.get("prezzo") ?? "").trim();
    const prezzo = Number(prezzoRaw.replace(",", "."));
    if (!prezzoRaw || !Number.isFinite(prezzo) || prezzo < 0) {
      setError("Inserisci un prezzo valido, ad esempio 12,50.");
      setSubmitting(false);
      return;
    }

    const quantitaRaw = String(formData.get("quantitaDisponibile") ?? "").trim();
    const quantita = quantitaRaw ? Number(quantitaRaw.replace(",", ".")) : 1;
    if (!Number.isInteger(quantita) || quantita < 0) {
      setError("Inserisci una quantità disponibile valida.");
      setSubmitting(false);
      return;
    }

    const prezzoSuggeritoRaw = String(formData.get("prezzoSuggerito") ?? "").trim();
    const prezzoSuggerito = prezzoSuggeritoRaw
      ? Number(prezzoSuggeritoRaw.replace(",", "."))
      : null;
    if (prezzoSuggerito !== null && (!Number.isFinite(prezzoSuggerito) || prezzoSuggerito < 0)) {
      setError("Il prezzo suggerito non è valido.");
      setSubmitting(false);
      return;
    }

    const payload: MerchantProductPayload = {
      nome,
      descrizione,
      descrizioneCompleta: String(formData.get("descrizione_completa") ?? "").trim() || undefined,
      categoria,
      sottocategoria: String(formData.get("sottocategoria") ?? "").trim() || null,
      marca: String(formData.get("marca") ?? "").trim() || undefined,
      colore: String(formData.get("colore") ?? "").trim() || undefined,
      materiale: String(formData.get("materiale") ?? "").trim() || undefined,
      caratteristiche: String(formData.get("caratteristiche") ?? "")
        .split(/[,;]\s*/)
        .map((item) => item.trim())
        .filter(Boolean),
      pesoVolume: String(formData.get("peso_volume") ?? "").trim() || undefined,
      pesoGrammi: formData.get("peso_grammi")
        ? Number(formData.get("peso_grammi"))
        : null,
      costoSpedizioneLocale: formData.get("costo_spedizione_locale")
        ? Number(formData.get("costo_spedizione_locale"))
        : null,
      paroleChiave: String(formData.get("parole_chiave") ?? "")
        .split(/[,;]\s*/)
        .map((item) => item.trim())
        .filter(Boolean),
      filtriCatalogo: String(formData.get("filtri_catalogo") ?? "")
        .split(/[,;]\s*/)
        .map((pair) => pair.trim())
        .filter(Boolean)
        .reduce<Record<string, string>>((acc, pair) => {
          const sepIndex = pair.indexOf(":");
          if (sepIndex > 0) {
            const key = pair.slice(0, sepIndex).trim();
            const val = pair.slice(sepIndex + 1).trim();
            if (key && val) acc[key] = val;
          }
          return acc;
        }, {}) || undefined,
      prezzo,
      prezzoSuggerito,
      quantitaDisponibile: quantita,
      statoCondizione: String(formData.get("statoCondizione") ?? "nuovo") as "nuovo" | "usato" | "ricondizionato",
      immaginePrincipale: newImageDataUrl ?? String(formData.get("immaginePrincipale") ?? "").trim(),
      seoTitle: String(formData.get("seo_title") ?? "").trim() || undefined,
      seoDescription: String(formData.get("seo_description") ?? "").trim() || undefined,
      altTextImmagine: String(formData.get("alt_text_immagine") ?? "").trim() || undefined,
      attivo: true,
      originePubblicazione: String(formData.get("originePubblicazione") ?? initialValues.originePubblicazione),
      prodottoTipico: prodottoTipico,
      prodottoOfferta: prodottoOfferta,
    };

    const route = productId
      ? `/api/merchant/stores/${negozioId}/products/${productId}`
      : `/api/merchant/stores/${negozioId}/products`;

    const method = productId ? "PUT" : "POST";

    let response: Response;
    try {
      response = await fetch(route, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (fetchError) {
      console.error("[MerchantProductForm] Errore di rete durante la pubblicazione:", fetchError);
      setError("Impossibile raggiungere il servizio di pubblicazione. Riprova.");
      setSubmitting(false);
      return;
    }

    let result: {
      success: boolean;
      error?: { message?: string };
      product?: { id?: string };
      data?: { product?: { id?: string } };
    };
    try {
      result = (await response.json()) as {
        success: boolean;
        error?: { message?: string };
        product?: { id?: string };
        data?: { product?: { id?: string } };
      };
    } catch (jsonError) {
      console.error("[MerchantProductForm] Risposta API non valida:", jsonError);
      setError("Il servizio di pubblicazione ha restituito una risposta non valida.");
      setSubmitting(false);
      return;
    }

    if (!response.ok || !result.success) {
      setError(result.error?.message ?? "Impossibile pubblicare il prodotto.");
      setSubmitting(false);
      return;
    }

    // Salvataggio riuscito: il form torna pulito (niente modifiche pendenti).
    dirtyRef.current = false;
    onDirtyChange?.(false);

    // Modalità "resta nella stessa vista" (es. annuncio del wizard): niente
    // redirect, il chiamante aggiorna il proprio stato con i dati salvati.
    if (onSuccess) {
      onSuccess({
        payload,
        productId: productId ?? result.data?.product?.id ?? result.product?.id ?? null,
      });
      router.refresh();
      setSubmitting(false);
      return;
    }

    router.push(onSuccessRedirect ?? `/merchant/${negozioId}/prodotti`);
    router.refresh();
  }
      success: boolean;
      error?: { message?: string };
      product?: { id?: string };
      // Le route prodotti rispondono con { success, data: { product } }.
      data?: { product?: { id?: string } };
    };

    if (!response.ok || !result.success) {
      setError(result.error?.message ?? "Impossibile salvare il prodotto.");
      setSubmitting(false);
      return;
    }

    // Salvataggio riuscito: il form torna pulito (niente modifiche pendenti).
    dirtyRef.current = false;
    onDirtyChange?.(false);

    // Modalità "resta nella stessa vista" (es. annuncio del wizard AI): niente
    // redirect, il chiamante aggiorna il proprio stato con i dati salvati.
    if (onSuccess) {
      onSuccess({
        payload,
        // Id reale del prodotto creato: le route rispondono { success, data: { product } }.
        // Il fallback piatto resta per compatibilità con eventuali risposte non incapsulate.
        productId: productId ?? result.data?.product?.id ?? result.product?.id ?? null,
      });
      router.refresh();
      setSubmitting(false);
      return;
    }

    router.push(onSuccessRedirect ?? `/merchant/${negozioId}/prodotti`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} onChange={handleFormChange} noValidate className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Errore */}
      {error ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">{error}</div>
      ) : null}

      {/* Anteprima immagine + upload */}
      <div className="flex flex-col items-center gap-3">
        {newImageDataUrl || initialValues.immaginePrincipale ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Sostituisci foto prodotto"
            aria-label="Sostituisci foto prodotto"
            className="group relative cursor-pointer rounded-2xl border-0 bg-transparent p-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
          >
            <img
              src={newImageDataUrl || initialValues.immaginePrincipale}
              alt=""
              className="h-40 w-40 rounded-2xl object-cover shadow-md transition group-hover:opacity-90"
            />
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md">
              <Camera className="h-3 w-3 text-slate-600" />
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Aggiungi foto prodotto"
            aria-label="Aggiungi foto prodotto"
            className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition hover:border-yellow-300 hover:bg-yellow-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
          >
            <Camera className="h-8 w-8" />
            <span className="text-[10px] font-medium">Nessuna foto</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              setNewImageDataUrl(dataUrl);
              // Un'immagine diversa da quella iniziale è sempre una modifica.
              notifyDirty(dataUrl !== initialValues.immaginePrincipale.trim());
            };
            reader.readAsDataURL(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-yellow-50"
        >
          <Camera className="h-3.5 w-3.5" />
          {initialValues.immaginePrincipale ? "Cambia immagine" : "Aggiungi immagine"}
        </button>
      </div>

      {/* Galleria multi-immagine (solo per prodotti già salvati) */}
      {productId ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-blue-600" />
            <div>
              <p className="text-xs font-bold text-slate-800">Galleria immagini</p>
              <p className="text-[10px] text-slate-500">Aggiungi altre foto: la prima impostata come principale viene mostrata nel catalogo.</p>
            </div>
          </div>
          <ProductGalleryManager negozioId={negozioId} productId={productId} />
        </div>
      ) : null}

      {/* Prodotto tipico — vetrina territoriale della homepage */}
      <div>
        <Toggle
          icon={<Wheat className="h-4 w-4 text-blue-600" aria-hidden />}
          label="Prodotto tipico"
          description="Mostra questo prodotto nella vetrina &quot;Prodotti tipici&quot; di LocalHub. Il prodotto resta nel normale catalogo del negozio."
          checked={prodottoTipico}
          onChange={(v) => {
            setProdottoTipico(v);
            notifyDirty(v !== Boolean(initialValues.prodotto_tipico));
          }}
        />
      </div>

      {/* Prodotto in offerta — vetrina Offerte */}
      <div>
        <Toggle
          icon={<Tag className="h-4 w-4 text-red-600" aria-hidden />}
          label="Prodotto in offerta"
          description="Mostra questo prodotto nella pagina &quot;Offerte&quot; di InCittà con il badge rosso OFFERTA. Il prodotto resta nel normale catalogo del negozio."
          checked={prodottoOfferta}
          onChange={(v) => {
            setProdottoOfferta(v);
            notifyDirty(v !== Boolean(initialValues.prodotto_offerta));
          }}
        />
      </div>

      {/* Banner prezzo AI */}
      {initialValues.prezzoSuggerito !== null ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          AI suggerisce €{initialValues.prezzoSuggerito.toFixed(2)}
        </div>
      ) : null}

      {/* Peso di spedizione — campo prioritario */}
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-4">
        <div className="mb-3 flex items-start gap-2">
          <Truck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-bold text-slate-900">Peso del prodotto per la spedizione</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
              Inserisci il peso reale del prodotto in grammi. InCittà usa questo dato per determinare automaticamente la fascia tariffaria compatibile per Poste Italiane e BRT.
            </p>
          </div>
        </div>
        <div className="relative">
          <input
            id="peso_grammi"
            name="peso_grammi"
            type="number"
            min="0"
            step="1"
            defaultValue={initialValues.peso_grammi ?? ""}
            placeholder="Es. 1000"
            className="h-12 w-full rounded-lg border-2 border-blue-200 bg-white px-3 pr-10 text-base font-semibold outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">g</span>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">
          Senza peso, le tariffe che dipendono dal peso restano non disponibili. Il corriere locale continua a usare il costo configurato dal negozio.
        </p>
        <div className="mt-3 relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">&euro;</span>
          <input
            id="costo_spedizione_locale"
            name="costo_spedizione_locale"
            type="number"
            min="0"
            step="0.01"
            defaultValue={initialValues.costo_spedizione_locale ?? ""}
            placeholder="Costo corriere locale (opzionale)"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-7 pr-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
          />
        </div>
      </div>

      {/* Nome */}
      <div>
        <input
          id="nome"
          name="nome"
          defaultValue={initialValues.nome}
          required
          placeholder="Nome prodotto *"
          className="h-10 min-w-0 w-full max-w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
        />
      </div>

      {/* Categoria + Marca */}
      <div className="grid grid-cols-2 gap-3">
        <input
          id="categoria"
          name="categoria"
          defaultValue={initialValues.categoria}
          required
          placeholder="Categoria *"
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
        />
        <input
          id="marca"
          name="marca"
          defaultValue={initialValues.marca}
          placeholder="Marca"
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
        />
      </div>

      {/* Prezzo + Quantità */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">&euro;</span>
          <input
            id="prezzo"
            name="prezzo"
            type="text"
            inputMode="decimal"
            defaultValue={initialValues.prezzo === 0 ? "" : String(initialValues.prezzo).replace(".", ",")}
            required
            readOnly={initialData?.ha_varianti === true}
            title={initialData?.ha_varianti === true ? "Calcolato automaticamente dalle varianti" : undefined}
            placeholder="0,00"
            className={`h-10 w-full rounded-lg border border-slate-200 pl-7 pr-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100 ${
              initialData?.ha_varianti === true ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""
            }`}
          />
        </div>
        <input
          id="quantitaDisponibile"
          name="quantitaDisponibile"
          type="number"
          min="0"
          defaultValue={initialValues.quantitaDisponibile ?? 1}
          readOnly={initialData?.ha_varianti === true}
          title={initialData?.ha_varianti === true ? "Calcolata automaticamente dalle varianti" : undefined}
          placeholder="Quantit&agrave;"
          className={`h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100 ${
            initialData?.ha_varianti === true ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""
          }`}
        />
      </div>
      {initialData?.ha_varianti === true ? (
        <p className="text-[10px] text-blue-500">
          Questo prodotto utilizza varianti già presenti nel sistema: prezzo e quantità restano calcolati automaticamente.
        </p>
      ) : null}

      {/* Descrizione */}
      <textarea
        id="descrizione"
        name="descrizione"
        rows={2}
        defaultValue={initialValues.descrizione}
        required
        placeholder="Descrizione breve *"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
      />

      {/* Immagine (URL) - hidden */}
      <input
        id="immaginePrincipale"
        name="immaginePrincipale"
        type="hidden"
        defaultValue={initialValues.immaginePrincipale}
      />

      {/* ─── Dettagli avanzati ──────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-500 transition hover:bg-yellow-50"
        >
          Dettagli avanzati
          {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showAdvanced && (
          <div className="space-y-3 border-t border-slate-200 p-4">
            <div className="grid grid-cols-2 gap-3">
              <input
                id="sottocategoria"
                name="sottocategoria"
                defaultValue={initialValues.sottocategoria}
                placeholder="Sottocategoria"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
              />
              <select
                id="statoCondizione"
                name="statoCondizione"
                defaultValue={initialValues.statoCondizione}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
              >
                <option value="nuovo">Nuovo</option>
                <option value="usato">Usato</option>
                <option value="ricondizionato">Ricondizionato</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                id="colore"
                name="colore"
                defaultValue={initialValues.colore}
                placeholder="Colore"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
              />
              <input
                id="materiale"
                name="materiale"
                defaultValue={initialValues.materiale}
                placeholder="Materiale"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
              />
            </div>
            <input
              id="peso_volume"
              name="peso_volume"
              defaultValue={initialValues.peso_volume}
              placeholder="Peso / Volume (es. 500g, 1.5L)"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
            />
            <textarea
              id="descrizione_completa"
              name="descrizione_completa"
              rows={2}
              defaultValue={initialValues.descrizione_completa}
              placeholder="Descrizione completa"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
            />
            <input
              id="caratteristiche"
              name="caratteristiche"
              defaultValue={initialValues.caratteristiche}
              placeholder="Caratteristiche (separate da virgola)"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
            />
            <input
              id="parole_chiave"
              name="parole_chiave"
              defaultValue={initialValues.parole_chiave}
              placeholder="Tag SEO (separati da virgola)"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
            />
            <input
              id="filtri_catalogo"
              name="filtri_catalogo"
              defaultValue={initialValues.filtri_catalogo}
              placeholder='Filtri (es. "taglia: M, stagione: estate")'
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                id="seo_title"
                name="seo_title"
                defaultValue={initialValues.seo_title}
                placeholder="SEO title"
                maxLength={60}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
              />
              <input
                id="alt_text_immagine"
                name="alt_text_immagine"
                defaultValue={initialValues.alt_text_immagine}
                placeholder="Alt text foto"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
              />
            </div>
            <textarea
              id="seo_description"
              name="seo_description"
              rows={2}
              defaultValue={initialValues.seo_description}
              maxLength={160}
              placeholder="Meta description SEO"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
            />
          </div>
        )}
      </div>

      <input type="hidden" name="originePubblicazione" value={initialValues.originePubblicazione} />
      <input type="hidden" name="prezzoSuggerito" value={initialValues.prezzoSuggerito ?? ""} />

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-500 hover:to-blue-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? "Pubblicazione in corso..." : submitLabel}
      </button>
    </form>
  );
}
