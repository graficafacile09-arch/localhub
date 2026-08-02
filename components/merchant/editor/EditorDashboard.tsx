"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Store, Package, Camera, Check, X, FolderOpen } from "lucide-react";
import Link from "next/link";

type StoreData = Record<string, unknown>;
type ModuleStatus = {
  complete: boolean;
  count?: number;
};

type DashboardProps = {
  storeId: string;
  onModuleStatus?: (status: Record<string, ModuleStatus>) => void;
};

export default function EditorDashboard({ storeId, onModuleStatus }: DashboardProps) {
  const [store, setStore] = useState<StoreData | null>(null);
  const [prodottiCount, setProdottiCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nomeInput, setNomeInput] = useState("");
  const [savingNome, setSavingNome] = useState(false);
  const [savedNome, setSavedNome] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const [settingsRes, productsRes] = await Promise.all([
        fetch(`/api/merchant/stores/${storeId}/settings`),
        fetch(`/api/merchant/stores/${storeId}/products`),
      ]);
      const settingsJson = await settingsRes.json();
      const productsJson = await productsRes.json();

      if (settingsJson.success) {
        setStore(settingsJson.data.settings);
        setNomeInput(settingsJson.data.settings?.nome ?? "");
      }
      if (productsJson.success && Array.isArray(productsJson.data.products)) {
        setProdottiCount(productsJson.data.products.length);
      }
      setLoading(false);
     }
    load();
  }, [storeId]);

  useEffect(() => {
    async function loadTemplates() {
      const res = await fetch(`/api/merchant/templates`);
      const json = await res.json();
      if (json.success) setTemplates(json.data.templates ?? []);
    }
    loadTemplates();
  }, []);

  useEffect(() => {
    if (!store) return;
    const data = (store.data as Record<string, unknown>) ?? {};

    const srv = Array.isArray(store.servizi) ? store.servizi as string[] : [];
    const status: Record<string, ModuleStatus> = {
      informazioni: { complete: !!(store.nome && store.categoria) },
      immagini: { complete: !!(store.logo_url || store.copertina_url) },
      prodotti: { complete: prodottiCount > 0, count: prodottiCount },
      servizi: { complete: srv.length > 0, count: srv.length },
      offerte: { complete: Array.isArray(data.offerte) && (data.offerte as unknown[]).length > 0, count: Array.isArray(data.offerte) ? (data.offerte as unknown[]).length : 0 },
      eventi: { complete: Array.isArray(data.eventi) && (data.eventi as unknown[]).length > 0, count: Array.isArray(data.eventi) ? (data.eventi as unknown[]).length : 0 },
      contatti: { complete: !!(store.telefono || store.email_negozio || store.whatsapp) },
      posizione: { complete: !!(store.indirizzo && store.citta) },
      orari: { complete: !!store.orari },
      social: { complete: !!(store.facebook || store.instagram || store.whatsapp || store.tiktok || store.youtube) },
      seo: { complete: !!(store.seo_title || store.seo_description) },
      ai: { complete: !!(data as Record<string, unknown>)?.ai_data },
      impostazioni: { complete: true },
    };
    onModuleStatus?.(status);
  }, [store, prodottiCount]);

  const debouncedSaveNome = useCallback(
    debounce((value: string) => {
      if (value.trim() === (store?.nome ?? "")) return;
      setSavingNome(true);
      fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: value.trim() }),
      })
        .then((r) => r.json())
        .then((json) => {
          if (json.success) {
            setStore((prev) => prev ? { ...prev, nome: value.trim() } : prev);
            setSavedNome(true);
            setTimeout(() => setSavedNome(false), 2000);
          }
        })
        .finally(() => setSavingNome(false));
    }, 500),
    [storeId, store?.nome]
  );

  function handleNomeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setNomeInput(value);
    debouncedSaveNome(value);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/gallery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl, name: "logo" }),
        });
        const json = await res.json();
        if (json.success && json.data?.url) {
          await fetch(`/api/merchant/stores/${storeId}/settings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logo_url: json.data.url }),
          });
          setStore((prev) => prev ? { ...prev, logo_url: json.data.url } : prev);
        }
      } catch {
      } finally {
        setLogoUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-400">Caricamento dashboard...</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-red-500">Impossibile caricare i dati del negozio.</p>
      </div>
    );
  }

  const categoria = store.categoria as string ?? "";
  const logoUrl = store.logo_url as string | null;
  const attivo = store.attivo as boolean;
  const updatedAt = store.updated_at as string ?? "";
  const slugAnteprima = (store.slug as string) ?? storeId;

  const fieldsTotal = 13;
  const fieldsDone = [
    !!(store.nome && store.categoria),
    !!(logoUrl || store.copertina_url),
    prodottiCount > 0,
    Array.isArray(store.servizi) && (store.servizi as unknown[]).length > 0,
    Array.isArray((store.data as Record<string, unknown> | null)?.offerte) && ((store.data as Record<string, unknown>).offerte as unknown[]).length > 0,
    Array.isArray((store.data as Record<string, unknown> | null)?.eventi) && ((store.data as Record<string, unknown>).eventi as unknown[]).length > 0,
    !!(store.telefono || store.email_negozio || store.whatsapp),
    !!(store.indirizzo && store.citta),
    !!store.orari,
    !!(store.facebook || store.instagram || store.whatsapp),
    !!(store.seo_title || store.seo_description),
    !!((store.data as Record<string, unknown> | null)?.ai_data),
    true,
  ].filter(Boolean).length;
  const completezza = Math.round((fieldsDone / fieldsTotal) * 100);

  const statusLabel = attivo ? "Pubblicato" : "Bozza";
  const statusColor = attivo ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200";
  const statusDot = attivo ? "bg-emerald-500" : "bg-amber-500";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <Store className="h-7 w-7 text-blue-500" />
            )}
            {logoUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            )}
          </div>
          {logoUrl && (
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="absolute bottom-0 right-0 rounded-full bg-slate-100 p-1 text-slate-600 opacity-0 transition group-hover:opacity-100 hover:bg-slate-200"
              title="Cambia logo"
            >
              <Camera className="h-3 w-3" />
            </button>
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleLogoUpload}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={nomeInput}
                  onChange={handleNomeChange}
                  className="text-xl font-black tracking-tight text-slate-900 outline-none placeholder:text-slate-300"
                  placeholder="Nome negozio"
                />
                {savingNome && (
                  <div className="absolute -right-6 top-1/2 -translate-y-1/2">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  </div>
                )}
                {savedNome && (
                  <div className="absolute -right-6 top-1/2 -translate-y-1/2 text-emerald-500">
                    <Check className="h-4 w-4" />
                  </div>
                )}
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${statusColor}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                {statusLabel}
              </span>
            </div>
            {categoria && <p className="mt-0.5 text-xs font-semibold text-blue-600">{categoria}</p>}
            <p className="mt-1 text-[11px] text-slate-400">
              Ultimo aggiornamento: {updatedAt ? new Date(updatedAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
            </p>

          <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/negozio/${slugAnteprima}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700"
              >
                Anteprima negozio
              </Link>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Anteprima inline
              </button>
              <button
                type="button"
                onClick={() => setShowTemplatePicker(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Applica Template
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Completezza profilo</p>
            <p className="text-xs font-bold text-slate-700">{completezza}%</p>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${completezza}%` }} />
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold text-slate-800">Azioni rapide</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.hash = "?modulo=prodotti"}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700"
          >
            <Package className="h-4 w-4" />
            Aggiungi prodotto
          </button>
          <button
            type="button"
            onClick={() => window.location.hash = "?modulo=immagini"}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <Store className="h-4 w-4" />
            Modifica immagini
          </button>
        </div>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative h-[90vh] w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="absolute top-2 right-2 rounded-lg bg-slate-100 p-1 text-slate-600 hover:bg-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
            <iframe
              src={`/negozio/${slugAnteprima}`}
              className="h-full w-full rounded-xl border-0"
              title={`Anteprima ${store?.nome ?? "Negozio"}`}
            />
          </div>
        </div>
      )}

      {showTemplatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Applica Template</h3>
              <button
                type="button"
                onClick={() => setShowTemplatePicker(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">Sostituisce logo, layout, prodotti e impostazioni con quelli del template selezionato.</p>
            {templates.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Nessun template disponibile.</p>
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={applyingTemplate === t.id}
                    onClick={async () => {
                      setApplyingTemplate(t.id);
                      try {
                        const res = await fetch(`/api/merchant/stores/${storeId}/apply-template/${t.id}`, {
                          method: "POST",
                        });
                        const json = await res.json();
                        if (json.success) {
                          setShowTemplatePicker(false);
                          window.location.reload();
                        }
                      } finally {
                        setApplyingTemplate(null);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <div className="font-semibold text-sm text-slate-900">{t.nome}</div>
                    {t.descrizione && <p className="text-xs text-slate-500 mt-0.5">{t.descrizione}</p>}
                    {t.categoria && <span className="text-[10px] text-blue-600">{t.categoria}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function debounce<T extends (...args: any[]) => void>(fn: T, wait: number): T {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  }) as T;
}
