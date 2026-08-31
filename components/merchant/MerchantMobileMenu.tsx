"use client";

import Link from "next/link";
import { LogOut, Store, X } from "lucide-react";
import type { MerchantStoreSummary } from "@/lib/merchant/types";
import AdminSidebar from "@/components/amministratore/AdminSidebar";
import AdminStoreNavAuto from "@/components/amministratore/AdminStoreNavAuto";
import MerchantSidebarNav from "./MerchantSidebarNav";

/**
 * Contenuto del drawer mobile (hamburger) condiviso tra Area Venditore e
 * Area Amministratore. È il menu "Altro": contiene ciò che NON è nella
 * bottom nav (Impostazioni negozio, Media, Guadagni, Pagamenti, i negozi,
 * ed Esci — mai nella bottom nav).
 */
export default function MerchantMobileMenu({
  area = "merchant",
  stores,
  storeId,
  storeName,
  ordiniNonLettiPerNegozio,
  reclamiApertiPerNegozio,
  onClose,
}: {
  area?: "merchant" | "admin";
  stores: MerchantStoreSummary[];
  storeId?: string | null;
  storeName?: string | null;
  ordiniNonLettiPerNegozio?: Record<string, number>;
  reclamiApertiPerNegozio?: Record<string, number>;
  onClose: () => void;
}) {
  const isAdmin = area === "admin";
  const baseHref = isAdmin ? "/amministratore" : "/merchant";

  return (
    <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-xs flex-col overflow-y-auto bg-[#eef3f8] p-4 shadow-2xl">
      {/* Intestazione drawer */}
      <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/70 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          {isAdmin ? "Area Amministratore" : "Area Venditore"}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition active:bg-slate-200"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Contenuto per area */}
      <div className="flex-1 space-y-3">
        {isAdmin ? (
          <>
            <AdminStoreNavAuto />
            <div className="card p-5">
              <AdminSidebar />
            </div>
          </>
        ) : (
          <>
            {storeId ? (
              <div className="card p-4">
                <MerchantSidebarNav
                  storeId={storeId}
                  storeName={storeName ?? "Il tuo negozio"}
                  reclamiAperti={reclamiApertiPerNegozio?.[storeId] ?? 0}
                />
              </div>
            ) : (
              <div className="card p-4">
                <p className="section-label">Il tuo negozio</p>
                <p className="mt-2 text-sm text-slate-500">
                  Scegli un negozio per iniziare.
                </p>
              </div>
            )}

            {/* I tuoi negozi — cambio negozio rapido anche su mobile */}
            {stores.length > 0 && (
              <div className="card p-4">
                <p className="section-label">I tuoi negozi</p>
                <div className="mt-3 space-y-2">
                  {stores.map((store) => {
                    const ordiniNonLetti = ordiniNonLettiPerNegozio?.[store.id] ?? 0;
                    const active = store.id === storeId;
                    return (
                      <Link
                        key={store.id}
                        href={baseHref === "/merchant" ? `/merchant/${store.id}` : `/amministratore/negozi/${store.id}`}
                        onClick={onClose}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                          active
                            ? "border-blue-300 bg-blue-50 text-blue-800"
                            : "border border-blue-300 bg-white text-blue-700 hover:border-yellow-300 hover:bg-yellow-50"
                        }`}
                      >
                        <Store className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-semibold">{store.nome}</span>
                        {ordiniNonLetti > 0 && (
                          <span
                            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-black leading-none text-blue-900"
                            title={`${ordiniNonLetti} ${ordiniNonLetti === 1 ? "ordine non letto" : "ordini non letti"}`}
                          >
                            {ordiniNonLetti > 9 ? "9+" : ordiniNonLetti}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Esci — nel drawer, MAI nella bottom nav */}
      <form action="/api/auth/signout" method="post" className="mt-4 border-t border-slate-100 pt-4">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-yellow-50 hover:text-yellow-800"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
          </span>
          Esci
        </button>
      </form>
    </div>
  );
}
