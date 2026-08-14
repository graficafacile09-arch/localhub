"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Store, LayoutTemplate, Copy, Loader2, Camera } from "lucide-react";
import { getTemplates } from "./templates";
import { CATEGORIE_NEGOZIO, CATEGORIA_PERSONALIZZATA_LABEL } from "@/lib/categorie-negozio";
import { uploadStoreImage } from "@/components/merchant/editor/lib/upload-image";

type UserTemplate = {
  id: string;
  nome: string;
  descrizione: string;
  categoria: string | null;
  is_system: boolean;
  created_at: string;
};

type StoreSummary = {
  id: string;
  nome: string;
  categoria: string | null;
};

type SystemTemplate = {
  id: string;
  nome: string;
  descrizione: string;
  icone: string[];
  moduli_attivi: string[];
  defaultColor?: { primary: string; secondary: string; accent: string };
};

type AnyTemplate = SystemTemplate | UserTemplate;

type Mode = "blank" | "template" | "duplica";

export default function WizardShell() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Preselezione dal query param ?template=…: letta UNA volta all'avvio
  // (lazy initializer), senza effetti che settano stato. I template di
  // sistema (TemplateNegozio) non espongono una categoria: il campo parte
  // vuoto e quella di un template personale arriva quando i template
  // vengono caricati (loadTemplates).
  const templateParam = searchParams?.get("template") ?? null;
  const systemTemplates = getTemplates();
  const categoriaTemplateIniziale: string = "";

  const [mode, setMode] = useState<Mode>(() =>
    templateParam ? "template" : "blank"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    nome: "",
    categoria: categoriaTemplateIniziale,
    citta: "",
    logo: "",
  });
  const [categoriaPersonalizzata, setCategoriaPersonalizzata] = useState(false);
  /** File del logo selezionato (upload persistente dopo la creazione del negozio). */
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [duplicaStoreId, setDuplicaStoreId] = useState("");
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);

  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    () => templateParam
  );

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const allTemplates: AnyTemplate[] = [...systemTemplates, ...userTemplates];
    const selected = allTemplates.find((t) => t.id === id);
    if (selected && "categoria" in selected && selected.categoria) {
      setForm((prev) => ({ ...prev, categoria: selected.categoria ?? "" }));
    }
  };

  useEffect(() => {
    async function loadStores() {
      setStoresLoading(true);
      try {
        const res = await fetch("/api/merchant/stores");
        const json = await res.json();
        if (json.success) {
          setStores(json.data.stores ?? []);
        }
      } catch {
      } finally {
        setStoresLoading(false);
      }
    }

    async function loadTemplates() {
      setTemplatesLoading(true);
      try {
        const res = await fetch("/api/merchant/templates");
        const json = await res.json();
        if (json.success) {
          const utentiTemplates = (json.data?.templates ?? []).filter(
            (t: UserTemplate) => !t.is_system
          );
          setUserTemplates(utentiTemplates);
          // Categoria del template personale preselezionato (?template=…).
          if (templateParam) {
            const selezionato = [...systemTemplates, ...utentiTemplates].find(
              (t) => t.id === templateParam
            );
            if (selezionato && "categoria" in selezionato && selezionato.categoria) {
              setForm((prev) => ({
                ...prev,
                categoria: selezionato.categoria ?? "",
              }));
            }
          }
        }
      } catch {
      } finally {
        setTemplatesLoading(false);
      }
    }

    loadStores();
    loadTemplates();
  }, [searchParams, systemTemplates, templateParam]);

  const allTemplatesCombined: AnyTemplate[] = [...systemTemplates, ...userTemplates];

  function toSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((f) => {
      return { ...f, [field]: value };
    });
  }

  async function handleSubmit() {
    if (!form.nome.trim()) { setError("Inserisci il nome del negozio."); return; }

    if (mode !== "duplica") {
      if (!form.categoria.trim()) { setError("Seleziona una categoria."); return; }
      if (!form.citta.trim()) { setError("Inserisci la città."); return; }
    }

    if (mode === "duplica" && !duplicaStoreId) {
      setError("Seleziona un negozio da duplicare.");
      return;
    }

    if (mode === "template" && !selectedTemplateId) {
      setError("Seleziona un template.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      if (mode === "blank") {
        // 1) Crea il negozio (SENZA logo: il logo viene caricato dopo, in
        //    modo persistente, appena si dispone dell'ID reale).
        const createRes = await fetch("/api/merchant/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: form.nome.trim(),
            categoria: form.categoria.trim(),
            citta: form.citta.trim(),
          }),
        });
        const createJson = await createRes.json();
        if (!createJson.success || !createJson.data?.storeId) {
          setError(createJson.error?.message ?? "Errore durante la creazione del negozio.");
          return;
        }
        const storeId = createJson.data.storeId as string;

        // 2) Logo persistente: upload reale nello Storage (multipart /media,
        //    lo stesso meccanismo dell'editor) + salvataggio di logo_url.
        if (logoFile) {
          try {
            const logoUrl = await uploadStoreImage(storeId, logoFile);
            await fetch(`/api/merchant/stores/${storeId}/settings`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ logo_url: logoUrl }),
            });
          } catch {
            // Best-effort: il negozio è già stato creato; il logo si può
            // ricaricare dall'editor se l'upload fallisce.
          }
        }

        router.push(`/merchant/${storeId}/edit`);
        return;
      }

      let response: Response;
      if (mode === "template") {
        const slug = toSlug(form.nome);
        response = await fetch(`/api/merchant/templates/${selectedTemplateId}/use`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: form.nome.trim(),
            slug,
            categoria: form.categoria.trim(),
            citta: form.citta.trim(),
          }),
        });
      } else {
        const slug = toSlug(form.nome);
        const allOptions = {
          informazioni: true,
          logo: true,
          copertina: true,
          galleria: true,
          prodotti: true,
          servizi: true,
          offerte: true,
          eventi: true,
          orari: true,
          contatti: true,
          social: true,
          seo: true,
          ai: true,
        };
        response = await fetch(`/api/merchant/stores/${duplicaStoreId}/duplicate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newStore: {
              nome: form.nome.trim(),
              slug,
              categoria: form.categoria.trim() || undefined,
              citta: form.citta.trim() || undefined,
            },
            options: allOptions,
          }),
        });
      }

      const json = await response.json();
      if (json.success) {
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    // Preview locale (data URL) solo per la visualizzazione immediata:
    // il salvataggio persistente avviene via /media dopo la creazione.
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === "string") {
        updateField("logo", ev.target.result);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="mx-auto max-w-2xl px-3 py-6 sm:px-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">Nuovo negozio</h1>
            <p className="text-xs text-slate-400">Crea una nuova attività in pochi secondi</p>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setMode("blank")}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
              mode === "blank"
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 bg-white hover:border-blue-200"
            }`}
          >
            <Store className="h-6 w-6 text-slate-600" />
            <span className="text-xs font-semibold">Da zero</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("template")}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
              mode === "template"
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 bg-white hover:border-blue-200"
            }`}
          >
            <LayoutTemplate className="h-6 w-6 text-slate-600" />
            <span className="text-xs font-semibold">Da Template</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("duplica")}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
              mode === "duplica"
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 bg-white hover:border-blue-200"
            }`}
          >
            <Copy className="h-6 w-6 text-slate-600" />
            <span className="text-xs font-semibold">Duplica negozio</span>
          </button>
        </div>

        {mode === "template" && (
          <div className="mb-6">
            <h3 className="mb-2 text-xs font-semibold text-slate-500">Scegli un template</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {allTemplatesCombined.map((t) => {
                const isSelected = selectedTemplateId === t.id;
                const isSystem = "icone" in t;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTemplate(t.id)}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-blue-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-lg">
                        {"icone" in t ? (t.icone?.[0] ?? "🏪") : "🏪"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">{t.nome}</p>
                        <p className="text-xs text-slate-500 line-clamp-1">{t.descrizione}</p>
                      </div>
                    </div>
                    {isSystem && (
                      <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-600">
                        Predefinito
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mode === "duplica" && (
          <div className="mb-6">
            <h3 className="mb-2 text-xs font-semibold text-slate-500">Negozio da duplicare</h3>
            {storesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : stores.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-4">
                Nessun negozio disponibile. Creane prima uno da zero.
              </p>
            ) : (
              <select
                value={duplicaStoreId}
                onChange={(e) => setDuplicaStoreId(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Seleziona un negozio</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome} {s.categoria ? `(${s.categoria})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="mb-6">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
              {form.logo ? (
                <div
                  role="img"
                  aria-label="Logo"
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${form.logo})` }}
                />
              ) : (
                <Camera className="h-6 w-6 text-slate-300" />
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Carica logo
              </button>
              {form.logo && (
                <button
                  type="button"
                  onClick={() => updateField("logo", "")}
                  className="ml-2 text-[10px] font-semibold text-red-500 hover:underline"
                >
                  Rimuovi
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Nome negozio *</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => updateField("nome", e.target.value)}
                placeholder="es. Panificio Rossi"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Categoria *</label>
              {categoriaPersonalizzata ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={form.categoria}
                    onChange={(e) => updateField("categoria", e.target.value)}
                    placeholder="Scrivi la tua categoria"
                    className="h-11 w-full rounded-xl border border-blue-200 bg-blue-50/40 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCategoriaPersonalizzata(false);
                      updateField("categoria", "");
                    }}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    ← Scegli dall&apos;elenco
                  </button>
                </div>
              ) : (
                <select
                  value={form.categoria}
                  onChange={(e) => {
                    if (e.target.value === "__personalizzata__") {
                      setCategoriaPersonalizzata(true);
                      updateField("categoria", "");
                    } else {
                      updateField("categoria", e.target.value);
                    }
                  }}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Seleziona categoria</option>
                  {CATEGORIE_NEGOZIO.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__personalizzata__">{CATEGORIA_PERSONALIZZATA_LABEL}</option>
                </select>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Città *</label>
              <input
                type="text"
                value={form.citta}
                onChange={(e) => updateField("citta", e.target.value)}
                placeholder="es. Castrovillari"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-xs font-semibold text-red-500">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creazione...
            </div>
          ) : (
            "Crea negozio"
          )}
        </button>
      </div>
    </div>
  );
}
