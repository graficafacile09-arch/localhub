"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Package, Settings, Sparkles } from "lucide-react";

export default function MerchantSidebarNav({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}) {
  const pathname = usePathname();

  const links = [
    {
      label: "Il mio negozio",
      href: `/merchant/${storeId}`,
      icon: LayoutGrid,
      exact: true,
    },
    {
      label: "I miei prodotti",
      href: `/merchant/${storeId}/prodotti`,
      icon: Package,
      exact: false,
    },
    {
      label: "Nuovo prodotto",
      href: `/merchant/${storeId}/prodotti/nuovo`,
      icon: Sparkles,
      exact: false,
    },
    {
      label: "Gestione negozio",
      href: `/merchant/${storeId}/impostazioni`,
      icon: Settings,
      exact: false,
    },
  ];

  function isActive(href: string, exact: boolean): boolean {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <div className="space-y-1.5 text-sm font-semibold text-slate-700">
      {links.map((link) => {
        const active = isActive(link.href, link.exact);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-150 ${
              active
                ? "bg-blue-50 text-blue-700 shadow-sm"
                : "hover:bg-slate-50"
            }`}
          >
            <Icon
              className={`h-4 w-4 ${
                active ? "text-blue-600" : "text-blue-600"
              }`}
            />
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
