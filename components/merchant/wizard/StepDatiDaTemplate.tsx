"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getCategoriesConsigliate } from "./templates";

type Props = {
  templateId: string;
  onBack: () => void;
  onComplete: () => void;
};

function toSlug(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}

const categories = getCategoriesConsigliate();

export default function StepDatiDaTemplate({ templateId, onBack, onComplete }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const [form, setForm] = useState({ nome: "", slug: "", categoria: "", sottocategoria: "", citta: "" });

  function updateField(field: string, value: string) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "nome" && !slugManuallyEdited) {
        next.slug = toSlug(value);
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (!form.nome.trim()) { setError("Inserisci il nome del negozio."); return; }
    if (!form.slug.trim()) { setError("Inserisci lo slug."); return; }
    if (!form.categoria.trim()) { setError("Seleziona una categoria."); return; }
    if (!form.citta.trim()) { setError("Inserisci la città."); return; }

    setError("");
    setSaving(true);

    try {
      const res = await fetch(`/api/merchant/templates/${templateId}/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json();
      if (json.success) {
        onComplete();
        router.push(`/merchant/${json.data.storeId}/edit`);
      } else {
        setError(json.error?.message ?? "Errore durante la creazione.");
      }
    } catch {
      setError("Errore di connessione.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-900">Dati del nuovo negozio</h2>
        <p className="mt-1 text-sm text-slate-500">
          I dati del template verranno applicati automaticamente.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Nome negozio *</label>
          <input type="text" value={form.nome} onChange={(e) => updateField("nome", e.target.value)} placeholder="es. Panificio Rossi" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Slug *</label>
          <input type="text" value={form.slug} onChange={(e) => { setSlugManuallyEdited(true); updateField("slug", toSlug(e.target.value)); }} placeholder="es. panificio-rossi" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          <p className="mt-1 text-[10px] text-slate-400">localhub.it/negozio/{form.slug || "..."}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Categoria *</label>
          <select value={form.categoria} onChange={(e) => updateField("categoria", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            <option value="">Seleziona categoria</option>
            {categories.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Sottocategoria</label>
          <input type="text" value={form.sottocategoria} onChange={(e) => updateField("sottocategoria", e.target.value)} placeholder="es. Pane, Dolci" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Città *</label>
          <input type="text" value={form.citta} onChange={(e) => updateField("citta", e.target.value)} placeholder="es. Castrovillari" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-red-500">{error}</p>}

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">Indietro</button>
        <button type="button" onClick={handleSubmit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Creazione..." : "Crea negozio"}
        </button>
      </div>
    </div>
  );
}
