import type { ReactNode } from "react";
import Link from "next/link";
import { Home, LogOut } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { MerchantStoreSummary } from "@/lib/merchant/types";
import MerchantStoreSwitcher from "./MerchantStoreSwitcher";
import MerchantSidebarNav from "./MerchantSidebarNav";
import MerchantBottomNav from "./MerchantBottomNav";
import MerchantTopBar from "./MerchantTopBar";
import MerchantGlobalNav from "./MerchantGlobalNav";
import AdminSidebar from "@/components/amministratore/AdminSidebar";

/**
 * Shell condivisa tra Area Venditore e Area Amministratore.
 *
 * `area="merchant"` (default) → identica alla vecchia Area Venditore.
 * `area="admin"` → stessa grafica, stessi moduli, stessa esperienza d'uso:
 * la differenza è solo il titolo dell'header ("Area Amministratore") e una
 * card extra in sidebar con gli strumenti di piattaforma (AdminSidebar
 * riusato: Cestino, Utenti, Template, Scansioni AI, …).
 */
export default function MerchantShell({
  user,
  stores,
  currentStoreId,
  banner,
  area = "merchant",
  ordiniNonLettiPerNegozio,
  reclamiApertiPerNegozio,
  children,
}: {
  user: User;
  stores: MerchantStoreSummary[];
  currentStoreId?: string;
  banner?: string | null;
  area?: "merchant" | "admin";
  /** Conteggio ordini non letti per negozio (badge "Ordini [N]"). */
  ordiniNonLettiPerNegozio?: Record<string, number>;
  /** Conteggio reclami ATTIVI per negozio (badge rosso "Reclami [N]"). */
  reclamiApertiPerNegozio?: Record<string, number>;
  children: ReactNode;
}) {
  const currentStore = stores.find((store) => store.id === currentStoreId) ?? null;
  const isAdmin = area === "admin";
  const areaTitle = isAdmin ? "Area Amministratore" : "Area Venditore";
  const areaHref = isAdmin ? "/amministratore" : "/merchant";

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-900">

      {/* ── Top App Bar mobile — sticky, visibile solo su mobile ─────────────── */}
      <MerchantTopBar storeName={currentStore?.nome ?? null} area={area} />

      {/* ── Header desktop — visibile solo su md+ ────────────────────────────── */}
      <div className="hidden border-b border-blue-900/15 bg-[linear-gradient(180deg,#1d4ed8_0%,#2563eb_100%)] text-white shadow-lg md:block">
        <div className="h-1 bg-linear-to-r from-cyan-300 via-white to-yellow-300" />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/25"
            >
              <Home className="h-4 w-4" />
              Home
            </Link>
            <div>
              <Link href={areaHref} className="text-2xl font-black tracking-tight text-white">
                {areaTitle}
              </Link>
              <p className="mt-1 text-sm text-blue-100">
                {currentStore?.nome ?? areaTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-blue-50">
              {user.email}
            </div>
            <form action="/api/auth/signout" method="post">
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
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-3 md:grid-cols-[280px_minmax(0,1fr)] md:px-6 md:py-5">

        {/* Sidebar — visibile solo su desktop/tablet ─────────────────────────── */}
        <aside className="hidden space-y-5 md:block">
          {/* Amministrazione — SOLO nell'Area Amministratore. PRIMA card della
              sidebar: il menu admin (Strumenti di piattaforma → Negozi → …) è la
              prima cosa che l'amministratore vede entrando in /amministratore. */}
          {isAdmin ? (
            <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm">
              <AdminSidebar />
            </div>
          ) : null}

          <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Navigazione
            </p>
            <MerchantGlobalNav area={area} />
            {currentStore ? (
              <div className="mt-2">
                <MerchantSidebarNav
                  storeId={currentStore.id}
                  storeName={currentStore.nome}
                  reclamiAperti={reclamiApertiPerNegozio?.[currentStore.id] ?? 0}
                />
              </div>
            ) : null}
          </div>

          <MerchantStoreSwitcher
            stores={stores}
            currentStoreId={currentStoreId}
            ordiniNonLettiPerNegozio={ordiniNonLettiPerNegozio}
          />
        </aside>

        {/* Contenuto principale ──────────────────────────────────────────────── */}
        <section className="min-w-0 space-y-3">
          {banner ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              {banner}
            </div>
          ) : null}
          {children}
        </section>
      </div>

      {/* ── Bottom Navigation mobile ──────────────────────────────────────────── */}
      <MerchantBottomNav
        storeId={currentStore?.id ?? null}
        area={area}
        ordiniNonLettiPerNegozio={ordiniNonLettiPerNegozio}
      />
    </main>
  );
}
