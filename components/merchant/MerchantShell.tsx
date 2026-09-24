import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Home, LogOut, Store } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { MerchantStoreSummary } from "@/lib/merchant/types";
import MerchantStoreSwitcher from "./MerchantStoreSwitcher";
import MerchantStoreNavAuto from "./MerchantStoreNavAuto";
import MerchantBottomNav from "./MerchantBottomNav";
import MerchantTopBar from "./MerchantTopBar";
import AdminSidebar from "@/components/amministratore/AdminSidebar";
import AdminStoreNavAuto from "@/components/amministratore/AdminStoreNavAuto";

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
  adminNotificheNonLette,
  children,
}: {
  user: User;
  stores: MerchantStoreSummary[];
  currentStoreId?: string;
  banner?: string | null;
  area?: "merchant" | "admin";
  /** Badge notifiche admin non lette (SOLO area admin, calcolato server-side). */
  adminNotificheNonLette?: number;
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
    <main className="min-h-screen bg-[#eef2f7] text-slate-950">

      {/* ── Top App Bar mobile — sticky, visibile solo su mobile ─────────────── */}
      <MerchantTopBar
        storeName={currentStore?.nome ?? null}
        area={area}
        stores={stores}
        ordiniNonLettiPerNegozio={ordiniNonLettiPerNegozio}
        reclamiApertiPerNegozio={reclamiApertiPerNegozio}
      />

      {/* ── Header desktop — visibile solo su md+ ────────────────────────────── */}
      <header className="hidden border-b border-slate-800 bg-slate-950 text-white md:block">
        <div className="mx-auto flex h-[82px] max-w-[1480px] items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-5">
            <Link href="/" className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-slate-200 transition hover:bg-white/10">
              <Home className="h-4 w-4" /> Sito pubblico
            </Link>
            <div className="h-9 w-px bg-white/10" />
            <Link href={areaHref} className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-950"><Store className="h-5 w-5" /></span>
              <span>
                <span className="block text-base font-black tracking-tight">{areaTitle}</span>
                <span className="block text-xs font-medium text-slate-400">{currentStore?.nome ?? "Gestione attività"}</span>
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-right">
              <p className="max-w-[260px] truncate text-xs font-semibold text-white">{user.email}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{isAdmin ? "amministratore" : "venditore"}</p>
            </div>
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-950 transition hover:bg-slate-200"><LogOut className="h-4 w-4" /> Esci</button>
            </form>
          </div>
        </div>
      </header>

      {/* ── Layout principale ─────────────────────────────────────────────────── */}
      <div className="mx-auto grid max-w-[1480px] gap-6 px-4 py-5 pb-28 md:grid-cols-[292px_minmax(0,1fr)] md:px-6 md:py-7 md:pb-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8">

        {/* Sidebar — visibile solo su desktop/tablet ─────────────────────────── */}
        <aside className="hidden md:block">
          <div className="sticky top-6 space-y-4">
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_45px_-28px_rgba(15,23,42,.45)]">
              <div className="bg-slate-950 px-5 py-5 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{isAdmin ? "Console" : "Merchant Console"}</p>
                <p className="mt-1 text-lg font-black tracking-tight">{currentStore?.nome ?? "I tuoi negozi"}</p>
                <p className="mt-1 text-xs text-slate-400">{isAdmin ? "Amministrazione" : "Gestione completa del negozio"}</p>
              </div>
              <div className="p-3">
                {isAdmin ? <><AdminStoreNavAuto /><div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-2"><AdminSidebar nonLetteNotifiche={adminNotificheNonLette ?? 0} /></div></> : <MerchantStoreNavAuto stores={stores} reclamiApertiPerNegozio={reclamiApertiPerNegozio} />}
              </div>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
              <MerchantStoreSwitcher stores={stores} currentStoreId={currentStoreId} ordiniNonLettiPerNegozio={ordiniNonLettiPerNegozio} baseHref={isAdmin ? "/amministratore/negozi" : "/merchant"} label={isAdmin ? "Negozi gestiti" : "Cambia negozio"} />
            </div>
            {!isAdmin && <Link href="/" className="flex items-center justify-between rounded-[20px] border border-dashed border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"><span>Apri il sito pubblico</span><ArrowUpRight className="h-4 w-4" /></Link>}
          </div>
        </aside>

        {/* Contenuto principale ──────────────────────────────────────────────── */}
        <section className="min-w-0">
          {banner ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-950">
              {banner}
            </div>
          ) : null}
          {children}
        </section>
      </div>

      {/* ── Bottom Navigation mobile ──────────────────────────────────────────── */}
      <MerchantBottomNav storeId={currentStore?.id ?? null} area={area} />
    </main>
  );
}
