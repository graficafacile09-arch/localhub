"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, ShoppingBasket, X } from "lucide-react";
import ClienteHeader from "./ClienteHeader";
import ClienteMobileTopBar from "./ClienteMobileTopBar";
import ClienteSidebar from "./ClienteSidebar";
import ClienteBreadcrumb from "./ClienteBreadcrumb";

/**
 * Struttura dell'Area Clienti.
 * - Desktop/tablet: sidebar collassabile (espansa o solo icone).
 * - Mobile: top bar con menu a drawer.
 * Non esegue alcuna logica: solo UI e navigazione.
 */
export default function ClienteShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
            <div className="rounded-3xl border border-white/70 bg-white p-4 shadow-sm">
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
        <section className="min-w-0">
          <ClienteBreadcrumb />
          {children}
        </section>
      </div>

      {/* ── Drawer mobile ─────────────────────────────────────────────────────── */}
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

          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-[#eef3f8] shadow-2xl">
            {/* Intestazione drawer */}
            <div className="border-b border-teal-900/15 bg-[linear-gradient(180deg,#0f766e_0%,#0d9488_100%)] p-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-linear-to-br from-cyan-400 to-teal-600 text-base font-black text-white ring-2 ring-white/30"
                  >
                    C
                  </span>
                  <div>
                    <p className="flex items-center gap-1.5 text-base font-black tracking-tight">
                      <ShoppingBasket className="h-4 w-4 text-cyan-200" aria-hidden />
                      Area Clienti
                    </p>
                    <p className="text-xs text-teal-100">
                      La tua area personale
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Chiudi il menu"
                  autoFocus
                  className="flex h-9 w-9 items-center justify-center rounded-xl transition active:bg-white/20"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>

            {/* Navigazione */}
            <div className="flex-1 overflow-y-auto p-4">
              <ClienteSidebar />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
