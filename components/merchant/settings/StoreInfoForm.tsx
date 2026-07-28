"use client";

import { useEffect, useRef } from "react";
import { Camera, Check, Loader2, MapPin, Mail, Phone, Globe, Tag, FileText, Building2 } from "lucide-react";
import { useSettingsForm } from "./useSettingsForm";
import { useSettingsContext } from "./SettingsShell";

type StoreInfo = {
  nome: string;
  descrizione: string;
  categoria: string;
  indirizzo: string;
  telefono: string;
  email_negozio: string;
  sito_web: string;
  logo_url: string;
  banner_url: string;
};

export default function StoreInfoForm({
  storeId,
  initial,
}: {
  storeId: string;
  initial: StoreInfo;
}) {
  const { setFormDirty } = useSettingsContext();
  const { data: form, updateField, saving, saved, error, isDirty, handleSubmit, setError } = useSettingsForm(initial);
  const logoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFormDirty("info", isDirty);
  }, [isDirty, setFormDirty]);

  async function handleUpload(file: File, folder: string): Promise<string | null> {
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    const res = await fetch(`/api/merchant/stores/${storeId}/gallery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, name: folder }),
    });

    const json = (await res.json()) as { success: boolean; data?: { url?: string }; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setError(json.error?.message ?? "Upload immagine fallito.");
      return null;
    }
    return json.data?.url ?? null;
  }

  async function handleImageField(file: File | undefined, field: "logo_url" | "banner_url") {
    if (!file) return;
    const url = await handleUpload(file, field === "logo_url" ? "logo" : "banner");
    if (url) updateField(field, url);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSubmit(async (data) => {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? "Errore nel salvataggio.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
          {error}
        </div>
      )}

      {/* Logo + Banner */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Logo</p>
          <div
            className="group relative flex h-28 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-blue-300"
            onClick={() => logoInput.current?.click()}
          >
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-slate-400">
                <Camera className="h-6 w-6" />
                <span className="text-[10px] font-medium">Carica logo</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
          </div>
          <input
            ref={logoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleImageField(e.target.files?.[0], "logo_url")}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Banner</p>
          <div
            className="group relative flex h-28 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-blue-300"
            onClick={() => bannerInput.current?.click()}
          >
            {form.banner_url ? (
              <img src={form.banner_url} alt="Banner" className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-slate-400">
                <Camera className="h-6 w-6" />
                <span className="text-[10px] font-medium">Carica banner</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
          </div>
          <input
            ref={bannerInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleImageField(e.target.files?.[0], "banner_url")}
          />
        </div>
      </div>

      {/* Campi testo */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field icon={<Building2 className="h-4 w-4" />} label="Nome negozio" value={form.nome} onChange={(v) => updateField("nome", v)} required />
        <Field icon={<Tag className="h-4 w-4" />} label="Categoria" value={form.categoria} onChange={(v) => updateField("categoria", v)} required />
      </div>

      <TextArea icon={<FileText className="h-4 w-4" />} label="Descrizione" value={form.descrizione} onChange={(v) => updateField("descrizione", v)} rows={3} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field icon={<MapPin className="h-4 w-4" />} label="Indirizzo" value={form.indirizzo} onChange={(v) => updateField("indirizzo", v)} />
        <Field icon={<Phone className="h-4 w-4" />} label="Telefono" value={form.telefono} onChange={(v) => updateField("telefono", v)} type="tel" maxLength={30} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field icon={<Mail className="h-4 w-4" />} label="Email" value={form.email_negozio} onChange={(v) => updateField("email_negozio", v)} type="email" />
        <Field icon={<Globe className="h-4 w-4" />} label="Sito web" value={form.sito_web} onChange={(v) => updateField("sito_web", v)} type="url" placeholder="https://..." />
      </div>

      {/* Salva */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving || !isDirty}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saving ? "Salvataggio..." : saved ? "Salvato!" : "Salva informazioni"}
        </button>
        {isDirty && !saving && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Non salvato
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  maxLength,
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {icon}
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function TextArea({
  icon,
  label,
  value,
  onChange,
  rows = 3,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {icon}
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}
