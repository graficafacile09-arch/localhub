"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronDown, ChevronUp, ImagePlus, Layers, Truck } from "lucide-react";
import ProductGalleryManager from "@/components/merchant/products/ProductGalleryManager";
import VariantiManager from "@/components/merchant/products/VariantiManager";
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
};

export default function MerchantProductForm({
  negozioId,
  productId,
  initialData,
  submitLabel = "Salva prodotto",
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
      }
    : DEFAULT_PRODUCT_FORM;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload: MerchantProductPayload = {
      nome: String(formData.get("nome") ?? "").trim(),
      descrizione: String(formData.get("descrizione") ?? "").trim(),
      descrizioneCompleta: String(formData.get("descrizione_completa") ?? "").trim() || undefined,
      categoria: String(formData.get("categoria") ?? "").trim(),
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
      prezzo: Number(formData.get("prezzo") ?? 0),
      prezzoSuggerito: formData.get("prezzoSuggerito")
        ? Number(formData.get("prezzoSuggerito"))
        : null,
      quantitaDisponibile: formData.get("quantitaDisponibile")
        ? Number(formData.get("quantitaDisponibile"))
        : 1,
      statoCondizione: String(formData.get("statoCondizione") ?? "nuovo") as "nuovo" | "usato" | "ricondizionato",
      immaginePrincipale: newImageDataUrl ?? String(formData.get("immaginePrincipale") ?? "").trim(),
      seoTitle: String(formData.get("seo_title") ?? "").trim() || undefined,
      seoDescription: String(formData.get("seo_description") ?? "").trim() || undefined,
      altTextImmagine: String(formData.get("alt_text_immagine") ?? "").trim() || undefined,
      attivo: true,
      originePubblicazione: String(formData.get("originePubblicazione") ?? initialValues.originePubblicazione),
    };

    const route = productId
      ? `/api/merchant/stores/${negozioId}/products/${productId}`
      : `/api/merchant/stores/${negozioId}/products`;

    const method = productId ? "PUT" : "POST";

    const response = await fetch(route, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as {
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
    <form onSubmit={handleSubmit} onChange={handleFormChange} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Errore */}
      {error ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">{error}</div>
      ) : null}

      {/* Anteprima immagine + upload */}
      <div className="flex flex-col items-center gap-3">
        {newImageDataUrl || initialValues.immaginePrincipale ? (
          <div className="relative">
            <img
              src={newImageDataUrl || initialValues.immaginePrincipale}
              alt="Anteprima"
              className="h-40 w-40 rounded-2xl object-cover shadow-md"
            />
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md">
              <Camera className="h-3 w-3 text-slate-600" />
            </div>
          </div>
        ) : (
          <div className="flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition hover:border-blue-300 hover:bg-blue-50/50">
            <Camera className="h-8 w-8" />
            <span className="text-[10px] font-medium">Nessuna foto</span>
          </div>
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
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

      {/* Varianti (solo per prodotti già salvati, come la galleria) */}
      {productId ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            <div>
              <p className="text-xs font-bold text-slate-800">Varianti</p>
              <p className="text-[10px] text-slate-500">
                Crea combinazioni (taglia, colore, materiale…) con prezzo e quantità propri. Con varianti attive, prezzo e stock
                del prodotto vengono calcolati automaticamente dal sistema.
              </p>
            </div>
          </div>
          <VariantiManager
            negozioId={negozioId}
            productId={productId}
            prodotto={{
              prezzo: initialData?.prezzo ?? null,
              quantitaDisponibile: initialData?.quantita_disponibile ?? null,
              quantitaRiservata: initialData?.quantita_riservata ?? null,
              haVarianti: initialData?.ha_varianti ?? false,
            }}
          />
        </div>
      ) : null}

      {/* Banner prezzo AI */}
      {initialValues.prezzoSuggerito !== null ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          AI suggerisce €{initialValues.prezzoSuggerito.toFixed(2)}
        </div>
      ) : null}

      {/* Nome */}
      <div>
        <input
          id="nome"
          name="nome"
          defaultValue={initialValues.nome}
          required
          placeholder="Nome prodotto *"
          className="h-10 min-w-0 w-full max-w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <input
          id="marca"
          name="marca"
          defaultValue={initialValues.marca}
          placeholder="Marca"
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Prezzo + Quantità */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">&euro;</span>
          <input
            id="prezzo"
            name="prezzo"
            type="number"
            min="0"
            step="0.01"
            defaultValue={initialValues.prezzo}
            required
            readOnly={initialData?.ha_varianti === true}
            title={initialData?.ha_varianti === true ? "Calcolato automaticamente dalle varianti" : undefined}
            placeholder="0,00"
            className={`h-10 w-full rounded-lg border border-slate-200 pl-7 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${
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
          className={`h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${
            initialData?.ha_varianti === true ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""
          }`}
        />
      </div>
      {initialData?.ha_varianti === true ? (
        <p className="text-[10px] text-blue-500">
          Prezzo e quantità sono calcolati automaticamente dalle varianti: modificali nella sezione Varianti qui sotto.
        </p>
      ) : null}

      {/* Spedizione — motore tariffario InCittà (il peso abilita Poste/BRT) */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Truck className="h-4 w-4 text-blue-600" />
          <div>
            <p className="text-xs font-bold text-slate-800">Spedizione</p>
            <p className="text-[10px] leading-4 text-slate-500">
              Le tariffe Poste Italiane e BRT sono determinate automaticamente da InCittà in base al
              pacco configurato nelle impostazioni del negozio.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <input
              id="peso_grammi"
              name="peso_grammi"
              type="number"
              min="0"
              step="1"
              defaultValue={initialValues.peso_grammi ?? ""}
              placeholder="Peso (grammi)"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">g</span>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">&euro;</span>
            <input
              id="costo_spedizione_locale"
              name="costo_spedizione_locale"
              type="number"
              min="0"
              step="0.01"
              defaultValue={initialValues.costo_spedizione_locale ?? ""}
              placeholder="Corriere locale (€)"
              className="h-10 w-full rounded-lg border border-slate-200 pl-7 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">
          Peso indicativo del prodotto (facoltativo). Poste Italiane e BRT usano il pacco configurato
          nelle impostazioni del negozio; il corriere locale usa invece il costo qui indicato.
        </p>
      </div>

      {/* Descrizione */}
      <textarea
        id="descrizione"
        name="descrizione"
        rows={2}
        defaultValue={initialValues.descrizione}
        required
        placeholder="Descrizione breve *"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
          className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
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
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <select
                id="statoCondizione"
                name="statoCondizione"
                defaultValue={initialValues.statoCondizione}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <input
                id="materiale"
                name="materiale"
                defaultValue={initialValues.materiale}
                placeholder="Materiale"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <input
              id="peso_volume"
              name="peso_volume"
              defaultValue={initialValues.peso_volume}
              placeholder="Peso / Volume (es. 500g, 1.5L)"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <textarea
              id="descrizione_completa"
              name="descrizione_completa"
              rows={2}
              defaultValue={initialValues.descrizione_completa}
              placeholder="Descrizione completa"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <input
              id="caratteristiche"
              name="caratteristiche"
              defaultValue={initialValues.caratteristiche}
              placeholder="Caratteristiche (separate da virgola)"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <input
              id="parole_chiave"
              name="parole_chiave"
              defaultValue={initialValues.parole_chiave}
              placeholder="Tag SEO (separati da virgola)"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <input
              id="filtri_catalogo"
              name="filtri_catalogo"
              defaultValue={initialValues.filtri_catalogo}
              placeholder='Filtri (es. "taglia: M, stagione: estate")'
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                id="seo_title"
                name="seo_title"
                defaultValue={initialValues.seo_title}
                placeholder="SEO title"
                maxLength={60}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <input
                id="alt_text_immagine"
                name="alt_text_immagine"
                defaultValue={initialValues.alt_text_immagine}
                placeholder="Alt text foto"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <textarea
              id="seo_description"
              name="seo_description"
              rows={2}
              defaultValue={initialValues.seo_description}
              maxLength={160}
              placeholder="Meta description SEO"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
