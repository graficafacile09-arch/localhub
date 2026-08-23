"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store } from "lucide-react";
import DuplicaNegozioWizard from "@/components/merchant/media/DuplicaNegozioWizard";
import { getMerchantStoreNavItems } from "./navigation";

/**
 * Navigazione del negozio selezionato (sidebar desktop + drawer mobile,
 * Area Venditore).
 *
 * Riga ricca con gerarchia chiara: [icona in chip] etichetta + descrizione.
 * I RECLAMI APERTI non sono una voce autonoma: il badge giallo vive sulla
 * voce ORDINI (il filtro resta su /ordini?filtro=reclami). Il conteggio
 * degli ordini NON LETTI compare accanto al NOME del negozio nell'elenco
 * "I tuoi negozi" (MerchantStoreSwitcher).
 */
export default function MerchantSidebarNav({
  storeId,
  storeName,
  reclamiAperti = 0,
}: {
  storeId: string;
  storeName: string;
  /** Conteggio reclami attivi (badge rosso sulla voce Reclami). */
  reclamiAperti?: number;
}) {
  const pathname = usePathname();
  const [showDuplica, setShowDuplica] = useState(false);
  const items = getMerchantStoreNavItems(storeId);

  function isActive(href: string | null, exactActive = false): boolean {
    if (!href) return false;
    // Il pathname NON contiene mai la query string (es. la voce Reclami usa
    // "…/ordini?filtro=reclami"): confrontiamo solo il percorso reale.
    const target = href.split("?")[0];
    if (exactActive) return target === pathname;
    if (target === pathname) return true;
    return pathname.startsWith(target.endsWith("/") ? target : `${target}/`);
  }

  return (
    <nav aria-label="Menu negozio" className="space-y-1.5 text-sm font-semibold">
      {/* ── Blocco identità negozio (sidebar desktop) ─────────────────────── */}
      <div className="mb-2 flex items-center gap-3 rounded-2xl border border-slate-100 bg-linear-to-br from-blue-50 to-blue-100/60 p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
          <Store className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black tracking-tight text-slate-900">
            {storeName}
          </span>
          <span className="block truncate text-[11px] font-medium text-slate-500">
            Pannello venditore
          </span>
        </span>
      </div>

      {showDuplica && (
        <DuplicaNegozioWizard
          storeId={storeId}
          storeName={storeName}
          onClose={() => setShowDuplica(false)}
        />
      )}

      {items.map((item) => {
        const Icon = item.icon;

        // Voce di sola intestazione (es. \"Editor\")
        if (item.section) {
          return (
            <div key={item.key}>
              <div className="my-2 border-t border-slate-100" />
              <p className="px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                {item.label}
              </p>
            </div>
          );
        }

        // Voce azione (es. \"Duplica negozio\" → apre il wizard)
        if (item.action) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setShowDuplica(true)}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-slate-600 transition-all duration-150 hover:bg-blue-50 hover:text-blue-700"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {item.label}
            </button>
          );
        }

        // Voce standard (Link). I reclami APERTI sono segnalati con un badge
        // sulla voce ORDINI: una sola voce, filtro dedicato dentro la pagina.
        const active = item.href
          ? isActive(item.href, item.exactActive)
          : false;
        const badge = item.key === "ordini" ? reclamiAperti : 0;
        const mostraBadge = badge > 0;

        return (
          <Link
            key={item.key}
            href={item.href ?? "#"}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-150 ${
              active
                ? "bg-blue-50 text-blue-800 ring-1 ring-blue-100"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {active && (
              <span
                className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-blue-600"
                aria-hidden
              />
            )}
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-bold">{item.label}</span>
                {mostraBadge && (
                  <span
                    className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-yellow-400 px-1.5 text-[10px] font-black leading-none text-blue-900"
                    title={`${badge} ${badge === 1 ? "reclamo aperto" : "reclami aperti"}`}
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              {item.description && (
                <span className="mt-0.5 block truncate text-[11px] font-medium leading-4 text-slate-400">
                  {item.description}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
