"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen, ShoppingBasket, X } from "lucide-react";
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
export default function ClienteShell({
  children,
  ordiniInCorso = 0,
}: {
  children: ReactNode;
  /** Conteggio ordini in corso (badge sulla voce Ordini del menu). */
  ordiniInCorso?: number;
}) {
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
        className={`mx-auto grid grid-cols-1 max-w-7xl gap-4 px-4 py-3 transition-[grid-template-columns] duration-300 md:px-6 md:py-5 ${
          collapsed
            ? "md:grid-cols-[84px_minmax(0,1fr)]"
            : "md:grid-cols-[280px_minmax(0,1fr)]"
        }`}
      >
        {/* Sidebar desktop ─────────────────────────────────────────────────── */}
        <aside className="hidden md:block">
          <div className="sticky top-5 space-y-3">
            <div className="card p-5">
              <ClienteSidebar
                collapsed={collapsed}
                ordiniInCorso={ordiniInCorso}
                withHeader
              />
            </div>

            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "Espandi il menu" : "Comprimi il menu"}
              className={`flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 ${
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
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50"
                >
                  <ShoppingBasket className="h-4 w-4 text-blue-600" aria-hidden />
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-700">
                  Area Clienti
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Chiudi il menu"
                autoFocus
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition active:bg-blue-100"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Navigazione — chiude il drawer al click di ogni voce */}
            <div className="flex-1">
              <ClienteSidebar
                onNavigate={() => setMobileOpen(false)}
                ordiniInCorso={ordiniInCorso}
              />

              {/* Esci — nel drawer, MAI nella bottom nav */}
              <form action="/api/auth/signout" method="post" className="mt-4 border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-yellow-50 hover:text-yellow-800"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <LogOut className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  Esci
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
