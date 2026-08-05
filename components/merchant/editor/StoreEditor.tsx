"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Menu, LayoutDashboard, AlertTriangle, RefreshCw } from "lucide-react";
import EditorSidebar from "./EditorSidebar";
import EditorDashboard from "./EditorDashboard";
import { getModuleComponent } from "@/lib/modules/registry";

export type ModuleStatus = {
  complete: boolean;
  count?: number;
};

type Props = {
  storeId: string;
  /**
   * Percorso base dell'editor (per la URL bar):
   * - venditore:  "/merchant"        → /merchant/{id}/edit
   * - amministratore: "/amministratore/negozi" → /amministratore/negozi/{id}/edit
   */
  basePath?: string;
};

export default function StoreEditor({ storeId, basePath = "/merchant" }: Props) {
  const searchParams = useSearchParams();
  const modulo = searchParams.get("modulo");

  const [activeSlug, setActiveSlug] = useState<string>(modulo ?? "dashboard");
  const [ModuleComponent, setModuleComponent] = useState<React.ComponentType<{ storeId: string }> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moduleStatus, setModuleStatus] = useState<Record<string, ModuleStatus>>({});
  const [storeName, setStoreName] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleModuleStatus = useCallback((status: Record<string, ModuleStatus>) => {
    setModuleStatus(status);
  }, []);

  // Sidebar click: ONLY update state. URL sync is done by the effect below.
  const handleSelect = useCallback((slug: string) => {
    setActiveSlug(slug);
  }, []);

  // Sync activeSlug → URL bar without triggering Next.js navigation/re-render
  useEffect(() => {
    const url =
      activeSlug === "dashboard"
        ? `${basePath}/${storeId}/edit`
        : `${basePath}/${storeId}/edit?modulo=${activeSlug}`;
    window.history.replaceState(null, "", url);
  }, [activeSlug, storeId, basePath]);

  useEffect(() => {
    async function loadName() {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/settings`);
        const json = await res.json();
        if (json.success && json.data?.settings?.nome) {
          setStoreName(json.data.settings.nome);
        }
      } catch { /* non-critical */ }
    }
    loadName();
  }, [storeId]);

  // Load the module component for the active slug
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadError(false);

      if (activeSlug === "dashboard") {
        if (!cancelled) setModuleComponent(null);
        return;
      }

      try {
        const Component = await getModuleComponent(activeSlug);
        if (!cancelled) {
          if (Component) {
            setModuleComponent(() => Component);
          } else {
            setLoadError(true);
          }
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [activeSlug, retryKey]);

  const isDashboard = activeSlug === "dashboard";

  const handleSidebarClose = useCallback(() => setSidebarOpen(false), []);

  const pageTitle = isDashboard ? "Dashboard" :
    activeSlug.charAt(0).toUpperCase() + activeSlug.slice(1);

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 shrink-0 border-r border-slate-100 bg-white pt-16 transition-transform duration-200 md:relative md:inset-auto md:z-auto md:translate-x-0 md:pt-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <EditorSidebar
          activeSlug={isDashboard ? "dashboard" : activeSlug}
          onSelect={handleSelect}
          onClose={handleSidebarClose}
          moduleStatus={moduleStatus}
          storeName={storeName}
          basePath={basePath}
        />
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1 overflow-auto px-4 py-4 sm:px-6 lg:px-8">
        {/* Mobile header */}
        <div className="mb-4 flex items-center gap-3 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            {isDashboard && <LayoutDashboard className="h-4 w-4 text-blue-500" />}
            <h2 className="text-sm font-bold text-slate-900">{pageTitle}</h2>
          </div>
        </div>

        {isDashboard ? (
          <EditorDashboard storeId={storeId} onModuleStatus={handleModuleStatus} />
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm text-slate-500">Impossibile caricare il modulo &ldquo;{pageTitle}&rdquo;.</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(false);
                setModuleComponent(null);
                setRetryKey((k) => k + 1);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              Riprova
            </button>
          </div>
        ) : ModuleComponent ? (
          <ModuleComponent storeId={storeId} />
        ) : (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-slate-400">
              Caricamento modulo...
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
