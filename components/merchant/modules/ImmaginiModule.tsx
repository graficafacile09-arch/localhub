"use client";

import { useState, useEffect, useRef } from "react";
import { Image, Camera, X } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { SaveBar, type StatoSalvataggio } from "./ModuleFields";
import { uploadStoreImage, type StoreImagePreset } from "@/components/merchant/editor/lib/upload-image";

type Props = { storeId: string };

export default function ImmaginiModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [copertinaUrl, setCopertinaUrl] = useState("");
  const [galleria, setGalleria] = useState<string[]>([]);
  const logoInput = useRef<HTMLInputElement>(null);
  const copertinaInput = useRef<HTMLInputElement>(null);
  const [originale, setOriginale] = useState("");
  const [message, setMessage] = useState<StatoSalvataggio>(null);

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const s = json.data.settings;
          const logo = s.logo_url ?? "";
          const copertina = s.copertina_url ?? "";
          const foto = Array.isArray(s.galleria) ? s.galleria : [];
          setLogoUrl(logo);
          setCopertinaUrl(copertina);
          setGalleria(foto);
          setOriginale(JSON.stringify({ logoUrl: logo, copertinaUrl: copertina, galleria: foto }));
        }
        setLoading(false);
      });
  }, [storeId]);

  async function handleUpload(file: File, preset: StoreImagePreset): Promise<string | null> {
    try {
      // Normalizzazione a risoluzione fissa prima dello storage:
      // logo 512x512, copertina 1600x900, galleria max 2000px.
      return await uploadStoreImage(storeId, file, preset);
    } catch (e) {
      setMessage({
        tipo: "errore",
        testo: e instanceof Error ? e.message : "Upload fallito",
      });
      return null;
    }
  }
  async function handleLogo(file: File | undefined) {
    if (!file) return;
    const url = await handleUpload(file, "logo");
    if (url) {
      setLogoUrl(url);
      setMessage(null);
    }
  }

  async function handleCopertina(file: File | undefined) {
    if (!file) return;
    const url = await handleUpload(file, "copertina");
    if (url) {
      setCopertinaUrl(url);
      setMessage(null);
    }
  }

  async function handleGalleria(file: File | undefined) {
    if (!file) return;
    const url = await handleUpload(file, "galleria");
    if (url) {
      setGalleria((precedenti) => [...precedenti, url]);
      setMessage(null);
    }
  }

  function removeGalleria(index: number) {
    setGalleria((precedenti) => precedenti.filter((_, i) => i !== index));
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logo_url: logoUrl,
          copertina_url: copertinaUrl,
          galleria,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setMessage({
          tipo: "errore",
          testo: json?.error?.message ?? "Salvataggio non riuscito. Riprova.",
        });
        return;
      }

      setOriginale(JSON.stringify({ logoUrl, copertinaUrl, galleria }));
      setMessage({ tipo: "ok", testo: "Modifiche salvate." });
    } catch {
      setMessage({ tipo: "errore", testo: "Errore di rete. Riprova." });
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    JSON.stringify({ logoUrl, copertinaUrl, galleria }) !== originale;

  if (loading) {
    return (
      <ModuleShell icon={<Image className="h-4 w-4" />} title="Immagini" subtitle="Caricamento..." id="immagini">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<Image className="h-4 w-4" />} title="Immagini" subtitle="Logo, copertina e galleria foto" id="immagini">
      {message && message.tipo === "errore" && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          {message.testo}
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <ImageUploadBox
          label="Logo"
          description="512 × 512 px · visualizzato in tondo accanto al nome"
          value={logoUrl}
          inputRef={logoInput}
          variant="logo"
          onChange={(f) => handleLogo(f)}
          onRemove={() => { setLogoUrl(""); setMessage(null); }}
        />
        <ImageUploadBox
          label="Copertina"
          description="1600 × 900 px · immagine grande del negozio"
          value={copertinaUrl}
          inputRef={copertinaInput}
          variant="cover"
          onChange={(f) => handleCopertina(f)}
          onRemove={() => { setCopertinaUrl(""); setMessage(null); }}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Galleria immagini</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {galleria.map((url, i) => (
            <div key={i} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeGalleria(i)}
                className="absolute right-1 top-1 hidden rounded-lg bg-blue-500/90 p-1 text-white group-hover:block"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <label className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition hover:border-blue-300 hover:text-blue-500">
            <Camera className="h-5 w-5" />
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleGalleria(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      <SaveBar
        saving={saving}
        onSave={handleSave}
        dirty={dirty}
        messaggio={message}
      />
    </ModuleShell>
  );
}

function ImageUploadBox({
  label,
  description,
  value,
  inputRef,
  variant,
  onChange,
  onRemove,
}: {
  label: string;
  description: string;
  value: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  variant: "logo" | "cover";
  onChange: (f: File | undefined) => void;
  onRemove: () => void;
}) {
  const isLogo = variant === "logo";
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mb-2 text-[10px] leading-4 text-slate-400">{description}</p>
      <div
        className={isLogo
          ? "group relative flex h-40 w-40 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-blue-300"
          : "group relative flex aspect-[16/9] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-blue-300"}
        onClick={() => inputRef.current?.click()}
      >
        {value ? (
          <>
            <img
              src={value}
              alt={label}
              className={isLogo ? "h-full w-full object-cover" : "h-full w-full object-cover"}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute right-2 top-2 hidden rounded-lg bg-blue-500/90 px-2 py-1 text-[10px] font-bold text-white group-hover:block"
            >
              Elimina
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-400">
            <Camera className={isLogo ? "h-7 w-7" : "h-6 w-6"} />
            <span className="text-[10px] font-medium">Carica {label.toLowerCase()}</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          onChange(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
