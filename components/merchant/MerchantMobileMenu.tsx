"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, LogOut, Store, X } from "lucide-react";
import type { MerchantStoreSummary } from "@/lib/merchant/types";
import AdminSidebar from "@/components/amministratore/AdminSidebar";
import AdminStoreNavAuto from "@/components/amministratore/AdminStoreNavAuto";
import DuplicaNegozioWizard from "@/components/merchant/media/DuplicaNegozioWizard";
import { getMerchantSecondaryNavItems } from "./navigation";

/**
 * Drawer mobile condiviso tra Area Venditore e Area Amministratore.
 *
 * Nell'Area Venditore mostra SOLO le funzioni secondarie: le funzioni
 * principali (Negozio, Prodotti, Ordini, Guadagni) sono già sempre visibili
 * nella bottom navigation e non vengono duplicate qui.
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
  const [showDuplica, setShowDuplica] = useState(false);

  return (
    <div className="absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col overflow-y-auto bg-[#eef3f8] p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-blue-700 px-4 py-3 text-white shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-100">
            {isAdmin ? "Area Amministratore" : "Area Venditore"}
          </p>
          {!isAdmin && storeName ? (
            <p className="mt-1 truncate text-sm font-black text-white">{storeName}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-blue-950 transition active:bg-yellow-300"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

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
              <>
                <div className="card p-4">
                  <p className="section-label">Altre funzioni</p>
                  <div className="mt-3 space-y-1.5">
                    {getMerchantSecondaryNavItems(storeId).map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.key}
                          href={item.href ?? "#"}
                          onClick={onClose}
                          className="group flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-blue-200 hover:bg-blue-50 active:scale-[0.99]"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100">
                            <Icon className="h-[18px] w-[18px]" aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-slate-900">{item.label}</span>
                            {item.description ? (
                              <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                                {item.description}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        // Il wizard viene aperto nello stesso drawer senza
                        // creare una seconda voce di navigazione.
                        setShowDuplica(true);
                      }}
                      className="group flex min-h-14 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-blue-200 hover:bg-blue-50 active:scale-[0.99]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100">
                        <Copy className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900">Duplica negozio</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                          Crea un nuovo negozio partendo da questo.
                        </span>
                      </span>
                    </button>
                  </div>
                </div>

                {showDuplica ? (
                  <DuplicaNegozioWizard
                    storeId={storeId}
                    storeName={storeName ?? "Il tuo negozio"}
                    onClose={() => setShowDuplica(false)}
                  />
                ) : null}
              </>
            ) : (
              <div className="card p-4">
                <p className="section-label">Il tuo negozio</p>
                <p className="mt-2 text-sm text-slate-500">
                  Scegli un negozio per iniziare.
                </p>
              </div>
            )}

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
                        className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                          active
                            ? "border-yellow-300 bg-yellow-50 text-yellow-800"
                            : "border-blue-200 bg-blue-50/60 text-blue-700 hover:border-blue-300 hover:bg-blue-100"
                        }`}
                      >
                        <Store className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-semibold">{store.nome}</span>
                        {ordiniNonLetti > 0 ? (
                          <span
                            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-yellow-400 px-1.5 text-[10px] font-black leading-none text-blue-900"
                            title={`${ordiniNonLetti} ${ordiniNonLetti === 1 ? "ordine non letto" : "ordini non letti"}`}
                          >
                            {ordiniNonLetti > 9 ? "9+" : ordiniNonLetti}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <form action="/api/auth/signout" method="post" className="mt-4 border-t border-slate-200 pt-4">
        <button
          type="submit"
          className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
          </span>
          Esci
        </button>
      </form>
    </div>
  );
}
