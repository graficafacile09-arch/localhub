"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Store, Camera, Check, X, FolderOpen, Plus, Bot, Image as ImageIcon, PenSquare, Eye, ArrowUpRight } from "lucide-react";
import Link from "next/link";

type StoreData = Record<string, unknown>;
type ModuleStatus = {
  complete: boolean;
  count?: number;
};

type DashboardProps = {
  storeId: string;
  /** Percorso base dell'editor: "/merchant" (venditore) o "/amministratore/negozi" (admin). */
  basePath?: string;
  onModuleStatus?: (status: Record<string, ModuleStatus>) => void;
  /** Apre un modulo esistente dello StoreEditor (es. "informazioni"). */
  onSelectModule?: (slug: string) => void;
};

type TemplateData = {
  id: string;
  nome: string;
  descrizione?: string;
  categoria?: string | null;
};

export default function EditorDashboard({ storeId, basePath = "/merchant", onModuleStatus, onSelectModule }: DashboardProps) {
  const [store, setStore] = useState<StoreData | null>(null);
  const [prodottiCount, setProdottiCount] = useState(0);
  const [offerteCount, setOfferteCount] = useState(0);
  const [eventiCount, setEventiCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nomeInput, setNomeInput] = useState("");
  const [savingNome, setSavingNome] = useState(false);
  const [savedNome, setSavedNome] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const [settingsRes, productsRes, offerteRes, eventiRes] = await Promise.all([
        fetch(`/api/merchant/stores/${storeId}/settings`),
        fetch(`/api/merchant/stores/${storeId}/products`),
        fetch(`/api/merchant/stores/${storeId}/offerte`),
        fetch(`/api/merchant/stores/${storeId}/eventi`),
      ]);
      const settingsJson = await settingsRes.json();
      const productsJson = await productsRes.json();
      const offerteJson = await offerteRes.json();
      const eventiJson = await eventiRes.json();

      if (settingsJson.success) {
        setStore(settingsJson.data.settings);
        setNomeInput(settingsJson.data.settings?.nome ?? "");
      }
      if (productsJson.success && Array.isArray(productsJson.data.products)) {
        setProdottiCount(productsJson.data.products.length);
      }
      if (offerteJson.success && Array.isArray(offerteJson.data.offerte)) {
        setOfferteCount(offerteJson.data.offerte.length);
      }
      if (eventiJson.success && Array.isArray(eventiJson.data.eventi)) {
        setEventiCount(eventiJson.data.eventi.length);
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
      offerte: { complete: offerteCount > 0, count: offerteCount },
      eventi: { complete: eventiCount > 0, count: eventiCount },
      contatti: { complete: !!(store.telefono || store.email_negozio || store.whatsapp) },
      posizione: { complete: !!(store.indirizzo && store.citta) },
      orari: { complete: !!store.orari },
      social: { complete: !!(store.facebook || store.instagram || store.whatsapp || store.tiktok || store.youtube) },
      seo: { complete: !!(store.seo_title || store.seo_description) },
      ai: { complete: !!(data as Record<string, unknown>)?.ai_data },
      impostazioni: { complete: true },
    };
    onModuleStatus?.(status);
  }, [store, prodottiCount, offerteCount, eventiCount]);

  const nomeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveNome = useCallback(
    (value: string) => {
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
            setStore((prev) => (prev ? { ...prev, nome: value.trim() } : prev));
            setSavedNome(true);
            setTimeout(() => setSavedNome(false), 2000);
          }
        })
        .finally(() => setSavingNome(false));
    },
    [storeId, store?.nome]
  );

  function handleNomeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setNomeInput(value);
    if (nomeTimer.current) clearTimeout(nomeTimer.current);
    nomeTimer.current = setTimeout(() => saveNome(value), 500);
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
    offerteCount > 0,
    eventiCount > 0,
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

      {/* AZIONI RAPIDE */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
            Azioni rapide
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Link
            href={`${basePath}/${storeId}/prodotti/nuovo`}
            className="group rounded-2xl bg-linear-to-br from-blue-600 to-blue-500 p-4 text-white shadow-md shadow-blue-500/20 transition hover:shadow-lg hover:shadow-blue-500/30 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <Plus className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-white/60 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <p className="mt-3 text-sm font-black leading-tight">Aggiungi prodotto</p>
            <p className="mt-1 text-[11px] leading-4 text-blue-100">
              Crea un nuovo prodotto, con o senza AI
            </p>
          </Link>

          <Link
            href={`${basePath}/${storeId}/prodotti/ai`}
            className="group rounded-2xl bg-linear-to-br from-violet-600 to-fuchsia-500 p-4 text-white shadow-sm shadow-violet-500/20 transition hover:shadow-lg hover:shadow-violet-500/30 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <Bot className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-white/60 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <p className="mt-3 text-sm font-black leading-tight">Scansiona con AI</p>
            <p className="mt-1 text-[11px] leading-snug text-fuchsia-100">
              Fotocamera e riconoscimento automatico
            </p>
          </Link>

          <Link
            href={`${basePath}/${storeId}/media`}
            className="group rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm transition hover:border-blue-300 hover:shadow-md active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <ImageIcon className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-blue-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <p className="mt-3 text-sm font-black leading-tight text-slate-900">Gestisci immagini</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Logo, copertina, galleria e media
            </p>
          </Link>

          <button
            type="button"
            onClick={() => onSelectModule?.("informazioni")}
            className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <PenSquare className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-blue-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <p className="mt-3 text-sm font-black leading-tight text-slate-900">Modifica informazioni</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Dati principali del negozio
            </p>
          </button>

          <Link
            href={`/negozio/${slugAnteprima}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm transition hover:border-emerald-300 hover:shadow-md active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Eye className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-emerald-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <p className="mt-3 text-sm font-black leading-tight text-slate-900">Visualizza negozio</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Apri la pagina pubblica reale
            </p>
          </Link>
        </div>
      </section>
      {/* FINE AZIONI RAPIDE */}

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
