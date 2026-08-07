"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DuplicaNegozioWizard from "@/components/merchant/media/DuplicaNegozioWizard";
import { getMerchantStoreNavItems } from "./navigation";

export default function MerchantSidebarNav({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}) {
  const pathname = usePathname();
  const [showDuplica, setShowDuplica] = useState(false);
  const items = getMerchantStoreNavItems(storeId);

  function isActive(href: string | null, exactActive = false): boolean {
    if (!href) return false;
    if (exactActive) return href === pathname;
    if (href === pathname) return true;
    return pathname.startsWith(href);
  }

  return (
    <div className="space-y-1.5 text-sm font-semibold text-slate-700">
      {showDuplica && (
        <DuplicaNegozioWizard
          storeId={storeId}
          storeName={storeName}
          onClose={() => setShowDuplica(false)}
        />
      )}

      {items.map((item) => {
        const Icon = item.icon;

        // Voce di sola intestazione (es. "Editor")
        if (item.section) {
          return (
            <div key={item.key}>
              <div className="my-2 border-t border-slate-100" />
              <p className="px-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {item.label}
              </p>
            </div>
          );
        }

        // Voce azione (es. "Duplica negozio" → apre il wizard)
        if (item.action) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setShowDuplica(true)}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-blue-50 hover:text-blue-700"
            >
              <Icon className="h-4 w-4 text-blue-500" />
              {item.label}
            </button>
          );
        }

        // Voce standard (Link) — le icone/etichette/path arrivano da navigation.ts
        const active = item.href ? isActive(item.href, item.exactActive) : false;
        return (
          <Link
            key={item.key}
            href={item.href ?? "#"}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-150 ${
              active ? "bg-blue-50 text-blue-700 shadow-sm" : "hover:bg-slate-50"
            }`}
          >
            <Icon className="h-4 w-4 text-blue-600" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}