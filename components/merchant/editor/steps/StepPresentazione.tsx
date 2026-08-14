"use client";

import { useEffect, useRef, useState } from "react";
import { Images, Camera, X, Loader2, Check, Sparkles, ListChecks } from "lucide-react";
import { TextArea, TagsInput, SaveBar } from "@/components/merchant/modules/ModuleFields";
import { uploadStoreImage } from "../lib/upload-image";
import type { StepProps } from "../editor-steps";

export default function StepPresentazione({ storeId, store, onDataChanged }: StepProps) {
  const [descrizioneCompleta, setDescrizioneCompleta] = useState(store?.descrizione_completa ?? "");
  const [galleria, setGalleria] = useState<string[]>(
    Array.isArray(store?.galleria) ? [...(store.galleria as string[])] : []
  );
  const [servizi, setServizi] = useState<string[]>(
    Array.isArray(store?.servizi) ? [...(store.servizi as string[])] : []
  );
  const [caratteristiche, setCaratteristiche] = useState<string[]>(
    Array.isArray(store?.parole_chiave) ? [...(store.parole_chiave as string[])] : []
  );
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = store;
    setDescrizioneCompleta(s?.descrizione_completa ?? "");
    setGalleria(Array.isArray(s?.galleria) ? [...(s.galleria as string[])] : []);
    setServizi(Array.isArray(s?.servizi) ? [...(s.servizi as string[])] : []);
    setCaratteristiche(Array.isArray(s?.parole_chiave) ? [...(s.parole_chiave as string[])] : []);
    setOriginal(
      JSON.stringify({
        descrizioneCompleta: s?.descrizione_completa ?? "",
        galleria: Array.isArray(s?.galleria) ? s.galleria : [],
        servizi: Array.isArray(s?.servizi) ? s.servizi : [],
        caratteristiche: Array.isArray(s?.parole_chiave) ? s.parole_chiave : [],
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const dirty =
    JSON.stringify({ descrizioneCompleta, galleria, servizi, caratteristiche }) !== original;

  async function handleAddImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadStoreImage(storeId, file);
      setGalleria((prev) => [...prev, url]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Caricamento non riuscito.");
    } finally {
      setUploading(false);
    }
  }

  function removeImage(index: number) {
    setGalleria((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descrizione_completa: descrizioneCompleta.trim(),
          galleria,
          servizi,
          parole_chiave: caratteristiche,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Salvataggio non riuscito.");
        return;
      }
      setOriginal(JSON.stringify({ descrizioneCompleta, galleria, servizi, caratteristiche }));
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
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Images className="h-4 w-4 text-blue-500" /> Galleria immagini
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Aggiungi foto del negozio, dei prodotti o del tuo lavoro: i clienti le vedono nella
          tua pagina.
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {galleria.map((url, i) => (
            <div key={i} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute right-1 top-1 hidden rounded-lg bg-blue-500/90 p-1 text-white group-hover:block"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => galleryInput.current?.click()}
            disabled={uploading}
            className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition hover:border-blue-300 hover:text-blue-500 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          </button>
        </div>
        <input
          ref={galleryInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleAddImage(e.target.files?.[0])}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Sparkles className="h-4 w-4 text-blue-500" /> Descrizione estesa
        </h3>
        <TextArea
          label="Racconta il tuo negozio"
          value={descrizioneCompleta}
          onChange={setDescrizioneCompleta}
          rows={5}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Check className="h-4 w-4 text-blue-500" /> Servizi offerti
        </h3>
        <TagsInput
          value={servizi}
          onChange={setServizi}
          placeholder="es. Consegna a domicilio, Parcheggio, Wi-Fi… (premi Invio)"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <ListChecks className="h-4 w-4 text-blue-500" /> Caratteristiche del negozio
        </h3>
        <TagsInput
          value={caratteristiche}
          onChange={setCaratteristiche}
          placeholder="es. Artigianale, Bio, Aperto la domenica… (premi Invio)"
        />
      </section>

      {error && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
          Presentazione salvata.
        </p>
      )}

      <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
    </div>
  );
}
