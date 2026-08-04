"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { clienteNavItems } from "./navigation";

/**
 * Breadcrumb dell'Area Clienti: Home / Area Clienti / [sezione attiva].
 * Risolve l'etichetta della sezione dalla navigazione dell'area.
 */
export default function ClienteBreadcrumb() {
  const pathname = usePathname();

  const sezione = clienteNavItems.find(
    (item) => item.href === pathname || pathname.startsWith(`${item.href}/`)
  );

  return (
    <nav
      aria-label="Percorso di navigazione"
      className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-500"
    >
      <Link
        href="/"
        className="inline-flex items-center gap-1 transition hover:text-teal-700"
      >
        <Home className="h-3.5 w-3.5" aria-hidden />
        Home
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden />
      <Link
        href="/cliente"
        aria-current={!sezione || sezione.href === "/cliente" ? "page" : undefined}
        className={`transition hover:text-teal-700 ${
          !sezione || sezione.href === "/cliente" ? "text-slate-800" : ""
        }`}
      >
        Area Clienti
      </Link>
      {sezione && sezione.href !== "/cliente" && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden />
          <span aria-current="page" className="text-slate-800">
            {sezione.label}
          </span>
        </>
      )}
    </nav>
  );
}
