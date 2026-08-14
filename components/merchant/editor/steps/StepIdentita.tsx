"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Camera, Loader2, Check } from "lucide-react";
import { Field, TextArea, SaveBar } from "@/components/merchant/modules/ModuleFields";
import {
  CATEGORIE_NEGOZIO,
  CATEGORIA_PERSONALIZZATA_LABEL,
  isCategoriaPersonalizzata,
} from "@/lib/categorie-negozio";
import { uploadStoreImage } from "../lib/upload-image";
import type { StepProps } from "../editor-steps";

export default function StepIdentita({ storeId, store, onDataChanged }: StepProps) {
  const [form, setForm] = useState({
    nome: store?.nome ?? "",
    slug: store?.slug ?? "",
    categoria: store?.categoria ?? "",
    sottocategoria: store?.sottocategoria ?? "",
    descrizione: store?.descrizione ?? "",
  });
  const [logoUrl, setLogoUrl] = useState(store?.logo_url ?? "");
  const [copertinaUrl, setCopertinaUrl] = useState(store?.copertina_url ?? "");
  const [categoriaPersonalizzata, setCategoriaPersonalizzata] = useState(
    isCategoriaPersonalizzata(store?.categoria)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "copertina" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const copertinaInput = useRef<HTMLInputElement>(null);

  const [original, setOriginal] = useState(() =>
    JSON.stringify({
      nome: store?.nome ?? "",
      slug: store?.slug ?? "",
      categoria: store?.categoria ?? "",
      sottocategoria: store?.sottocategoria ?? "",
      descrizione: store?.descrizione ?? "",
      logo_url: store?.logo_url ?? "",
      copertina_url: store?.copertina_url ?? "",
    })
  );

  useEffect(() => {
    const s = store;
    const vals = {
      nome: s?.nome ?? "",
      slug: s?.slug ?? "",
      categoria: s?.categoria ?? "",
      sottocategoria: s?.sottocategoria ?? "",
      descrizione: s?.descrizione ?? "",
    };
    setForm(vals);
    setLogoUrl(s?.logo_url ?? "");
    setCopertinaUrl(s?.copertina_url ?? "");
    setCategoriaPersonalizzata(isCategoriaPersonalizzata(s?.categoria));
    setOriginal(
      JSON.stringify({
        ...vals,
        logo_url: s?.logo_url ?? "",
        copertina_url: s?.copertina_url ?? "",
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const dirty =
    JSON.stringify({ ...form, logo_url: logoUrl, copertina_url: copertinaUrl }) !== original;

  async function handleUpload(target: "logo" | "copertina", file: File | undefined) {
    if (!file) return;
    setUploading(target);
    setError(null);
    try {
      const url = await uploadStoreImage(storeId, file, target === "logo" ? "logo" : "copertina");
      if (target === "logo") setLogoUrl(url);
      else setCopertinaUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Caricamento non riuscito.");
    } finally {
      setUploading(null);
    }
  }

  async function handleSave() {
    if (!form.nome.trim()) {
      setError("Il nome del negozio è obbligatorio.");
      return;
    }
    if (!form.categoria.trim()) {
      setError("Scegli una categoria o inserisci una categoria personalizzata.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.trim(),
          slug: form.slug.trim() || undefined,
          categoria: form.categoria.trim(),
          sottocategoria: form.sottocategoria.trim(),
          descrizione: form.descrizione.trim(),
          logo_url: logoUrl || undefined,
          copertina_url: copertinaUrl || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Salvataggio non riuscito.");
        return;
      }
      setOriginal(
        JSON.stringify({ ...form, logo_url: logoUrl, copertina_url: copertinaUrl })
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onDataChanged();
    } catch {
      setError("Errore di connessione durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Logo + copertina */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageBox
          label="Logo"
          hint="Compare accanto al nome del negozio."
          value={logoUrl}
          busy={uploading === "logo"}
          onPick={() => logoInput.current?.click()}
          onRemove={() => setLogoUrl("")}
          inputRef={logoInput}
          onChange={(f) => handleUpload("logo", f)}
        />
        <ImageBox
          label="Immagine principale / copertina"
          hint="La grande foto in cima alla pagina del negozio."
          value={copertinaUrl}
          busy={uploading === "copertina"}
          onPick={() => copertinaInput.current?.click()}
          onRemove={() => setCopertinaUrl("")}
          inputRef={copertinaInput}
          onChange={(f) => handleUpload("copertina", f)}
        />
      </div>

      {/* Dati testuali */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-bold text-slate-900">Dati principali</h3>
        </div>
        <div className="space-y-4">
          <Field
            label="Nome negozio"
            value={form.nome}
            onChange={(v) => setForm((f) => ({ ...f, nome: v }))}
            required
            placeholder="es. Panificio Rossi"
          />

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              Categoria principale <span className="text-red-400">*</span>
            </label>
            {categoriaPersonalizzata ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                  placeholder="Scrivi la tua categoria (es. Noleggio attrezzature)"
                  className="h-10 w-full rounded-xl border border-blue-200 bg-blue-50/40 px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCategoriaPersonalizzata(false);
                    setForm((f) => ({ ...f, categoria: "" }));
                  }}
                  className="text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  ← Scegli dall&apos;elenco
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  value={form.categoria}
                  onChange={(e) => {
                    if (e.target.value === "__personalizzata__") {
                      setCategoriaPersonalizzata(true);
                      setForm((f) => ({ ...f, categoria: "" }));
                    } else {
                      setForm((f) => ({ ...f, categoria: e.target.value }));
                    }
                  }}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Seleziona una categoria</option>
                  {CATEGORIE_NEGOZIO.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__personalizzata__">{CATEGORIA_PERSONALIZZATA_LABEL}</option>
                </select>
              </div>
            )}
          </div>

          <Field
            label="Categoria secondaria (facoltativa)"
            value={form.sottocategoria}
            onChange={(v) => setForm((f) => ({ ...f, sottocategoria: v }))}
            placeholder="es. Pasticceria, Abbigliamento sportivo"
          />

          <TextArea
            label="Descrizione breve"
            value={form.descrizione}
            onChange={(v) => setForm((f) => ({ ...f, descrizione: v }))}
            rows={3}
          />

          <Field
            label="Indirizzo web (slug)"
            value={form.slug}
            onChange={(v) => setForm((f) => ({ ...f, slug: v }))}
            placeholder="nome-del-negozio (lasciato vuoto viene generato automaticamente)"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
      {saved && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
          <Check className="h-4 w-4" /> Identità salvata.
        </p>
      )}

      <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
    </div>
  );
}

function ImageBox({
  label,
  hint,
  value,
  busy,
  onPick,
  onRemove,
  inputRef,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  busy: boolean;
  onPick: () => void;
  onRemove: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (f: File | undefined) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-700">{label}</p>
      <div
        onClick={onPick}
        className="group relative flex h-40 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-blue-300"
      >
        {value ? (
          <>
            <img src={value} alt={label} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute right-1.5 top-1.5 rounded-lg bg-red-500/90 px-2 py-1 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100"
            >
              Elimina
            </button>
          </>
        ) : busy ? (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="text-[10px] font-medium">Caricamento…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-400">
            <Camera className="h-6 w-6" />
            <span className="text-[10px] font-medium">Carica immagine</span>
          </div>
        )}
      </div>
      <p className="mt-1 text-[10px] leading-4 text-slate-400">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0])}
      />
    </div>
  );
}
