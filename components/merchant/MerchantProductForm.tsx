"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  categoria: "",
  sottocategoria: "",
  marca: "",
  colore: "",
  materiale: "",
  parole_chiave: "",
  prezzo: 0,
  prezzoSuggerito: null as number | null,
  quantitaDisponibile: 1 as number | null,
  statoCondizione: "nuovo" as "nuovo" | "usato" | "ricondizionato",
  immaginePrincipale: "",
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

  const initialValues = initialData
    ? {
        nome: initialData.nome ?? "",
        descrizione: initialData.descrizione ?? "",
        categoria: initialData.categoria ?? "",
        sottocategoria: initialData.sottocategoria ?? "",
        marca: initialData.marca ?? "",
        colore: initialData.colore ?? "",
        materiale: initialData.materiale ?? "",
        parole_chiave:
          Array.isArray(initialData.parole_chiave) && initialData.parole_chiave.length > 0
            ? initialData.parole_chiave.join(", ")
            : (initialData.parole_chiave as string | null | undefined) ?? "",
        prezzo: initialData.prezzo ?? 0,
        prezzoSuggerito: initialData.prezzo_suggerito ?? null,
        quantitaDisponibile: initialData.quantita_disponibile ?? 1,
        statoCondizione: (initialData.stato_condizione ?? "nuovo") as "nuovo" | "usato" | "ricondizionato",
        immaginePrincipale: initialData.immagine_principale ?? "",
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
      categoria: String(formData.get("categoria") ?? "").trim(),
      sottocategoria: String(formData.get("sottocategoria") ?? "").trim() || null,
      marca: String(formData.get("marca") ?? "").trim() || undefined,
      colore: String(formData.get("colore") ?? "").trim() || undefined,
      materiale: String(formData.get("materiale") ?? "").trim() || undefined,
      paroleChiave: String(formData.get("parole_chiave") ?? "")
        .split(/[,;]\s*/)
        .map((item) => item.trim())
        .filter(Boolean),
      prezzo: Number(formData.get("prezzo") ?? 0),
      prezzoSuggerito: formData.get("prezzoSuggerito")
        ? Number(formData.get("prezzoSuggerito"))
        : null,
      quantitaDisponibile: formData.get("quantitaDisponibile")
        ? Number(formData.get("quantitaDisponibile"))
        : 1,
      statoCondizione: String(formData.get("statoCondizione") ?? "nuovo") as "nuovo" | "usato" | "ricondizionato",
      immaginePrincipale: String(formData.get("immaginePrincipale") ?? "").trim(),
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
    <form onSubmit={handleSubmit} className="space-y-5 rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          {productId ? "Modifica prodotto" : "Nuovo prodotto"}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
          {productId ? "Aggiorna i dettagli del prodotto" : "Aggiungi un prodotto al catalogo"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Usa il modulo per completare i campi e gestire la disponibilità a magazzino.
        </p>
      </div>

      {/* Banner prezzo suggerito dall'AI */}
      {initialValues.prezzoSuggerito !== null ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          Prezzo suggerito dall&apos;AI: <strong>€ {initialValues.prezzoSuggerito.toFixed(2)}</strong>
        </div>
      ) : null}

      {/* Errore di salvataggio */}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">

        {/* Nome */}
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="nome" className="text-sm font-semibold text-slate-700">
            Nome prodotto <span className="text-red-500">*</span>
          </label>
          <input
            id="nome"
            name="nome"
            defaultValue={initialValues.nome}
            required
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* Categoria */}
        <div className="space-y-2">
          <label htmlFor="categoria" className="text-sm font-semibold text-slate-700">
            Categoria <span className="text-red-500">*</span>
          </label>
          <input
            id="categoria"
            name="categoria"
            defaultValue={initialValues.categoria}
            required
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* Sottocategoria */}
        <div className="space-y-2">
          <label htmlFor="sottocategoria" className="text-sm font-semibold text-slate-700">
            Sottocategoria
          </label>
          <input
            id="sottocategoria"
            name="sottocategoria"
            defaultValue={initialValues.sottocategoria}
            placeholder="es. Running, Skincare, Divani…"
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* Marca */}
        <div className="space-y-2">
          <label htmlFor="marca" className="text-sm font-semibold text-slate-700">
            Marca
          </label>
          <input
            id="marca"
            name="marca"
            defaultValue={initialValues.marca}
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* Colore */}
        <div className="space-y-2">
          <label htmlFor="colore" className="text-sm font-semibold text-slate-700">
            Colore
          </label>
          <input
            id="colore"
            name="colore"
            defaultValue={initialValues.colore}
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* Materiale */}
        <div className="space-y-2">
          <label htmlFor="materiale" className="text-sm font-semibold text-slate-700">
            Materiale
          </label>
          <input
            id="materiale"
            name="materiale"
            defaultValue={initialValues.materiale}
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* Stato / condizione */}
        <div className="space-y-2">
          <label htmlFor="statoCondizione" className="text-sm font-semibold text-slate-700">
            Stato / condizione
          </label>
          <select
            id="statoCondizione"
            name="statoCondizione"
            defaultValue={initialValues.statoCondizione}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            <option value="nuovo">Nuovo</option>
            <option value="usato">Usato</option>
            <option value="ricondizionato">Ricondizionato</option>
          </select>
        </div>

        {/* Prezzo */}
        <div className="space-y-2">
          <label htmlFor="prezzo" className="text-sm font-semibold text-slate-700">
            Prezzo (€) <span className="text-red-500">*</span>
          </label>
          <input
            id="prezzo"
            name="prezzo"
            type="number"
            min="0"
            step="0.01"
            defaultValue={initialValues.prezzo}
            required
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* Quantità disponibile */}
        <div className="space-y-2">
          <label htmlFor="quantitaDisponibile" className="text-sm font-semibold text-slate-700">
            Quantità disponibile
          </label>
          <input
            id="quantitaDisponibile"
            name="quantitaDisponibile"
            type="number"
            min="0"
            defaultValue={initialValues.quantitaDisponibile ?? 1}
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* Tag SEO / parole chiave */}
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="parole_chiave" className="text-sm font-semibold text-slate-700">
            Tag SEO / parole chiave
          </label>
          <input
            id="parole_chiave"
            name="parole_chiave"
            defaultValue={initialValues.parole_chiave}
            placeholder="es. maglietta, cotone, sport, running (separati da virgola)"
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* Immagine principale */}
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="immaginePrincipale" className="text-sm font-semibold text-slate-700">
            Immagine principale (URL)
          </label>
          <input
            id="immaginePrincipale"
            name="immaginePrincipale"
            type="url"
            defaultValue={initialValues.immaginePrincipale}
            placeholder="https://..."
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* Descrizione */}
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="descrizione" className="text-sm font-semibold text-slate-700">
            Descrizione <span className="text-red-500">*</span>
          </label>
          <textarea
            id="descrizione"
            name="descrizione"
            rows={5}
            defaultValue={initialValues.descrizione}
            required
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>
      </div>

      {/* Checkbox attivo + campi hidden */}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="attivo"
            defaultChecked={initialValues.attivo}
            className="h-4 w-4 rounded border-slate-300 text-blue-600"
          />
          Prodotto attivo e disponibile nel catalogo
        </label>

        <input type="hidden" name="originePubblicazione" value={initialValues.originePubblicazione} />
        <input type="hidden" name="prezzoSuggerito" value={initialValues.prezzoSuggerito ?? ""} />
      </div>

      {/* Submit */}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-linear-to-r from-amber-400 via-yellow-400 to-amber-500 px-6 text-sm font-bold text-slate-900 shadow-lg shadow-amber-400/40 transition hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? "Salvataggio in corso..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
