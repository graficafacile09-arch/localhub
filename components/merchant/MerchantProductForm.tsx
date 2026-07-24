"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { MerchantProduct } from "@/lib/merchant/types";

type MerchantProductFormProps = {
  negozioId: string;
  productId?: string;
  initialData?: Partial<MerchantProduct>;
  submitLabel?: string;
  onSuccessRedirect?: string;
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
}: MerchantProductFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    const payload = {
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
      immaginePrincipale: String(formData.get("immaginePrincipale") ?? "").trim(),
      seoTitle: String(formData.get("seo_title") ?? "").trim() || undefined,
      seoDescription: String(formData.get("seo_description") ?? "").trim() || undefined,
      altTextImmagine: String(formData.get("alt_text_immagine") ?? "").trim() || undefined,
      attivo: formData.get("attivo") === "on",
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
    };

    if (!response.ok || !result.success) {
      setError(result.error?.message ?? "Impossibile salvare il prodotto.");
      setSubmitting(false);
      return;
    }

    router.push(onSuccessRedirect ?? `/merchant/${negozioId}/prodotti`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Errore */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      ) : null}

      {/* Anteprima immagine */}
      {initialValues.immaginePrincipale ? (
        <div className="flex justify-center">
          <img
            src={initialValues.immaginePrincipale}
            alt="Anteprima"
            className="h-32 w-32 rounded-xl object-cover shadow-xs"
          />
        </div>
      ) : (
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
          </div>
        </div>
      )}

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
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
            placeholder="0,00"
            className="h-10 w-full rounded-lg border border-slate-200 pl-7 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <input
          id="quantitaDisponibile"
          name="quantitaDisponibile"
          type="number"
          min="0"
          defaultValue={initialValues.quantitaDisponibile ?? 1}
          placeholder="Quantit&agrave;"
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
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
