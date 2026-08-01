"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Building2 } from "lucide-react";
import { getCategoriesConsigliate } from "./templates";

type StepDati = {
  nome: string;
  categoria: string;
  citta: string;
  logo: string;
};

type Props = {
  templateId: string;
  initial: StepDati;
  onBack: () => void;
  onComplete: () => void;
};

const categories = getCategoriesConsigliate();

export default function StepDatiIniziali({ templateId, initial, onBack, onComplete }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<StepDati>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function updateField(field: keyof StepDati, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.nome.trim()) { setError("Inserisci il nome del negozio."); return; }
    if (!form.categoria.trim()) { setError("Seleziona una categoria."); return; }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/merchant/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.trim(),
          categoria: form.categoria.trim(),
          citta: form.citta.trim(),
          logo_url: form.logo || undefined,
          template_id: templateId || "base",
        }),
      });
      const json = await res.json();
      if (json.success) {
        onComplete();
        router.push(`/merchant/${json.data.id}/edit`);
      } else {
        setError(json.error?.message ?? "Errore durante la creazione.");
      }
    } catch {
      setError("Errore di connessione.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === "string") {
        updateField("logo", ev.target.result);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-900">Dati iniziali del negozio</h2>
        <p className="mt-1 text-sm text-slate-500">
          Solo le informazioni indispensabili per creare il negozio. Il resto lo completerai nell&apos;Editor.
        </p>
      </div>

      <div className="space-y-4">
        {/* Logo upload */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-500">Logo (facoltativo)</p>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-blue-300 hover:bg-blue-50"
          >
            {form.logo ? (
              <div role="img" aria-label="Logo" className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${form.logo})` }} />
            ) : (
              <Camera className="h-6 w-6 text-slate-300" />
            )}
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          {form.logo && (
            <button type="button" onClick={() => updateField("logo", "")} className="mt-1 text-[11px] font-semibold text-red-500 hover:underline">
              Rimuovi logo
            </button>
          )}
        </div>

        {/* Nome */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Nome negozio *</label>
          <input
            type="text"
            value={form.nome}
            onChange={(e) => updateField("nome", e.target.value)}
            placeholder="es. Panificio Rossi"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Categoria */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Categoria *</label>
          <select
            value={form.categoria}
            onChange={(e) => updateField("categoria", e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Seleziona categoria</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Città */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Città</label>
          <input
            type="text"
            value={form.citta}
            onChange={(e) => updateField("citta", e.target.value)}
            placeholder="es. Castrovillari"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs font-semibold text-red-500">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
          Indietro
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Creazione..." : "Crea negozio"}
        </button>
      </div>
    </div>
  );
}
