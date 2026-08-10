"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, ShoppingBasket, X } from "lucide-react";
import ClienteHeader from "./ClienteHeader";
import ClienteMobileTopBar from "./ClienteMobileTopBar";
import ClienteSidebar from "./ClienteSidebar";
import ClienteBreadcrumb from "./ClienteBreadcrumb";
import ClienteBottomNav from "./ClienteBottomNav";

/**
 * Struttura dell'Area Clienti.
 * - Desktop/tablet: sidebar collassabile (espansa o solo icone).
 * - Mobile: top bar con menu a drawer.
 * Non esegue alcuna logica: solo UI e navigazione.
 */
export default function ClienteShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Chiude il drawer a ogni cambio di route: dopo il click la destinazione
  // deve essere COMPLETAMENTE visibile (mai contenuto renderizzato sotto il
  // menu ancora aperto). Stesso pattern del drawer amministratore/venditore
  // (AdminMobileMenuButton): senza questo, la navigazione interna mantiene
  // il drawer aperto sopra la nuova pagina.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Blocca lo scroll quando il drawer mobile è aperto.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Chiude il drawer alla pressione di Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-900">
      <ClienteMobileTopBar
        menuOpen={mobileOpen}
        onOpenMenu={() => setMobileOpen(true)}
      />
      <ClienteHeader />

      {/* ── Layout principale ─────────────────────────────────────────────────── */}
      <div
        className={`mx-auto grid max-w-7xl gap-4 px-4 py-3 transition-[grid-template-columns] duration-300 md:px-6 md:py-5 ${
          collapsed
            ? "md:grid-cols-[84px_minmax(0,1fr)]"
            : "md:grid-cols-[280px_minmax(0,1fr)]"
        }`}
      >
        {/* Sidebar desktop ─────────────────────────────────────────────────── */}
        <aside className="hidden md:block">
          <div className="sticky top-5 space-y-3">
            <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm">
              {!collapsed && (
                <p className="mb-4 px-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Area Clienti
                </p>
              )}
              <ClienteSidebar collapsed={collapsed} />
            </div>

            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "Espandi il menu" : "Comprimi il menu"}
              className={`flex items-center gap-2 rounded-2xl border border-white/70 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-teal-50 hover:text-teal-700 ${
                collapsed ? "mx-auto justify-center" : ""
              }`}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" aria-hidden />
              ) : (
                <>
                  <PanelLeftClose className="h-4 w-4" aria-hidden />
                  Comprimi menu
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Contenuto principale ─────────────────────────────────────────────── */}
        <section className="min-w-0 space-y-3">
          <ClienteBreadcrumb />
          {children}
        </section>
      </div>

      {/* ── Bottom Navigation mobile (stessa struttura MerchanteBottomNav) ───── */}
      <ClienteBottomNav />

      {/* ── Drawer mobile ──────────── ─────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu Area Clienti"
        >
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-xs flex-col overflow-y-auto bg-[#eef3f8] p-4 shadow-2xl">
            {/* Intestazione drawer */}
            <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/70 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50"
                >
                  <ShoppingBasket className="h-4 w-4 text-teal-600" aria-hidden />
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-teal-700">
                  Area Clienti
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Chiudi il menu"
                autoFocus
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition active:bg-slate-200"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Navigazione — chiude il drawer al click di ogni voce */}
            <div className="flex-1">
              <ClienteSidebar onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
