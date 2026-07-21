import type { ReactNode } from "react";
import Link from "next/link";
import { LayoutGrid, LogOut, Package, Settings, Sparkles } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { MerchantStoreSummary } from "@/lib/merchant/types";
import MerchantStoreSwitcher from "./MerchantStoreSwitcher";
import MerchantBottomNav from "./MerchantBottomNav";

export default function MerchantShell({
  user,
  stores,
  currentStoreId,
  banner,
  children,
}: {
  user: User;
  stores: MerchantStoreSummary[];
  currentStoreId?: string;
  banner?: string | null;
  children: ReactNode;
}) {
  const currentStore = stores.find((store) => store.id === currentStoreId) ?? null;

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-900">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="border-b border-blue-900/15 bg-[linear-gradient(180deg,#1d4ed8_0%,#2563eb_100%)] text-white shadow-lg">
        <div className="h-1 bg-linear-to-r from-cyan-300 via-white to-yellow-300" />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div>
            <Link href="/merchant" className="text-2xl font-black tracking-tight text-white">
              LocalHub Merchant
            </Link>
            <p className="mt-1 text-sm text-blue-100">
              {currentStore
                ? `${currentStore.nome} · ${currentStore.role}`
                : "Dashboard negozianti"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Email visibile solo su desktop */}
            <div className="hidden rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-blue-50 sm:block">
              {user.email}
            </div>

            {/* Pulsante Esci — visibile solo su desktop (su mobile c'è nella bottom nav) */}
            <form action="/api/auth/signout" method="post" className="hidden md:block">
              <button
                type="submit"
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                <LogOut className="h-4 w-4" />
                Esci
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Layout principale ─────────────────────────────────────────────────── */}
      {/*
        Desktop/tablet (md+): griglia 2 colonne con sidebar
        Mobile (< md):        colonna singola, sidebar nascosta
      */}
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[280px_minmax(0,1fr)] md:px-6">

        {/* Sidebar — visibile solo su desktop/tablet */}
        <aside className="hidden space-y-5 md:block">
          <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Navigazione
            </p>
            <div className="mt-4 space-y-2 text-sm font-semibold text-slate-700">
              <Link
                href="/merchant"
                className="flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-slate-50"
              >
                <LayoutGrid className="h-4 w-4 text-blue-600" />
                I tuoi negozi
              </Link>
              {currentStore ? (
                <>
                  <Link
                    href={`/merchant/${currentStore.id}/prodotti`}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-slate-50"
                  >
                    <Package className="h-4 w-4 text-blue-600" />
                    Prodotti
                  </Link>
                  <Link
                    href={`/merchant/${currentStore.id}/prodotti/nuovo`}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-slate-50"
                  >
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    Nuovo prodotto
                  </Link>
                  <Link
                    href={`/merchant/${currentStore.id}/impostazioni`}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-slate-50"
                  >
                    <Settings className="h-4 w-4 text-blue-600" />
                    Impostazioni
                  </Link>
                </>
              ) : null}
            </div>
          </div>

          <MerchantStoreSwitcher stores={stores} currentStoreId={currentStoreId} />
        </aside>

        {/* Contenuto principale */}
        <section className="min-w-0 space-y-6">
          {banner ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              {banner}
            </div>
          ) : null}
          {children}
        </section>
      </div>

      {/* ── Bottom Navigation mobile (< md) ──────────────────────────────────── */}
      <MerchantBottomNav storeId={currentStore?.id ?? null} />
    </main>
  );
}
