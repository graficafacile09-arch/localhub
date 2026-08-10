"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import DuplicaNegozioWizard from "@/components/merchant/media/DuplicaNegozioWizard";
import { getMerchantStoreNavItems } from "./navigation";

/**
 * Navigazione del negozio selezionato (sidebar desktop, Area Venditore).
 *
 * Riga ricca con gerarchia chiara: [icona in chip] etichetta + descrizione.
 * Badge ROSSI per l'attenzione (mai blu):
 *   - Ordini [N]  → ordini NON LETTI (sistema letto_at, già esistente);
 *   - Reclami [N] → reclami APERTI/IN GESTIONE (badge rosso dedicato).
 * Le voci arrivano da navigation.ts (unica fonte), inclusa la voce
 * "Reclami" che apre la lista ordini filtrata (?filtro=reclami).
 */
export default function MerchantSidebarNav({
  storeId,
  storeName,
  ordiniNonLetti = 0,
  reclamiAperti = 0,
}: {
  storeId: string;
  storeName: string;
  /** Conteggio ordini non letti (badge \"Ordini [N]\", sistema letto_at). */
  ordiniNonLetti?: number;
  /** Conteggio reclami attivi (badge rosso sulla voce Reclami). */
  reclamiAperti?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showDuplica, setShowDuplica] = useState(false);
  const items = getMerchantStoreNavItems(storeId);
  const storePath = `/merchant/${storeId}`;

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

        // Voce standard (Link) — badge di attenzione per Ordini/Reclami.
        // La voce Reclami è ATTIVA solo sul filtro "?filtro=reclami" della
        // lista ordini (path + query): così Ordini e Reclami non risultano
        // mai entrambe attive sulla stessa pagina.
        const active = item.key === "reclami"
          ? pathname.startsWith(`${storePath}/ordini`) &&
            searchParams.get("filtro") === "reclami"
          : item.href
            ? isActive(item.href, item.exactActive)
            : false;
        const badge =
          item.key === "ordini"
            ? ordiniNonLetti
            : item.key === "reclami"
              ? reclamiAperti
              : 0;
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
                    className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-black leading-none text-white"
                    title={
                      item.key === "reclami"
                        ? `${badge} ${badge === 1 ? "reclamo aperto" : "reclami aperti"}`
                        : `${badge} ${badge === 1 ? "ordine non letto" : "ordini non letti"}`
                    }
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
