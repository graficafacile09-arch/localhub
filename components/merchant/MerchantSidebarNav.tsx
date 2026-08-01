"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, Package, Copy, Edit3, FolderOpen, LayoutTemplate,
} from "lucide-react";
import DuplicaNegozioWizard from "@/components/merchant/media/DuplicaNegozioWizard";

export default function MerchantSidebarNav({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}) {
  const pathname = usePathname();
  const [showDuplica, setShowDuplica] = useState(false);

  function isActive(href: string): boolean {
    if (href === pathname) return true;
    if (href !== "#" && pathname.startsWith(href)) return true;
    return false;
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

      {/* Dashboard */}
      <Link
        href={`/merchant/${storeId}`}
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-150 ${
          isActive(`/merchant/${storeId}`) && !isActive(`/merchant/${storeId}/`)
            ? pathname === `/merchant/${storeId}` ? "bg-blue-50 text-blue-700 shadow-sm" : "hover:bg-slate-50"
            : "hover:bg-slate-50"
        } ${pathname === `/merchant/${storeId}` ? "bg-blue-50 text-blue-700 shadow-sm" : ""}`}
      >
        <LayoutGrid className="h-4 w-4 text-blue-600" />
        Dashboard
      </Link>

      {/* Prodotti */}
      <Link
        href={`/merchant/${storeId}/prodotti`}
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-150 ${
          pathname.startsWith(`/merchant/${storeId}/prodotti`)
            ? "bg-blue-50 text-blue-700 shadow-sm"
            : "hover:bg-slate-50"
        }`}
      >
        <Package className="h-4 w-4 text-blue-600" />
        Prodotti
      </Link>

      {/* Separator */}
      <div className="my-2 border-t border-slate-100" />

      {/* Editor */}
      <div className="my-2 border-t border-slate-100" />
      <p className="px-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Editor
      </p>

      <Link
        href={`/merchant/${storeId}/edit`}
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-150 ${
          pathname.startsWith(`/merchant/${storeId}/edit`)
            ? "bg-blue-50 text-blue-700 shadow-sm"
            : "hover:bg-slate-50"
        }`}
      >
        <Edit3 className="h-4 w-4 text-blue-600" />
        Gestione negozio
      </Link>

      <Link
        href={`/merchant/${storeId}/media`}
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-150 ${
          pathname.startsWith(`/merchant/${storeId}/media`)
            ? "bg-blue-50 text-blue-700 shadow-sm"
            : "hover:bg-slate-50"
        }`}
      >
        <FolderOpen className="h-4 w-4 text-blue-600" />
        Libreria Media
      </Link>

      {/* Template */}
      <Link
        href={`/merchant/template`}
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-150 ${
          pathname.startsWith(`/merchant/template`)
            ? "bg-blue-50 text-blue-700 shadow-sm"
            : "hover:bg-slate-50"
        }`}
      >
        <LayoutTemplate className="h-4 w-4 text-blue-600" />
        Template
      </Link>

      {/* Duplica */}
      <button
        type="button"
        onClick={() => setShowDuplica(true)}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-blue-50 hover:text-blue-700"
      >
        <Copy className="h-4 w-4 text-blue-500" />
        Duplica negozio
      </button>
    </div>
  );
}
