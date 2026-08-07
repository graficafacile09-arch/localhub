"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { ADMIN_BASE } from "@/components/amministratore/navigation";
import { MERCHANT_BASE } from "./navigation";

/**
 * Navigazione globale condivisa tra Area Venditore e Area Amministratore.
 * - merchant (default): "La mia area" → /merchant
 * - admin:              "La mia area" → /amministratore
 * Il Cestino NON è qui: è una funzione di piattaforma gestita
 * esclusivamente dall'amministratore (card "Amministrazione" in sidebar).
 */
export default function MerchantGlobalNav({
  area = "merchant",
}: {
  area?: "merchant" | "admin";
}) {
  const pathname = usePathname();
  const href = area === "admin" ? ADMIN_BASE : MERCHANT_BASE;
  const laMiaAreaActive = pathname === href;

  return (
    <div className="mt-4">
      <Link
        href={href}
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-150 hover:bg-slate-50 ${
          laMiaAreaActive ? "bg-blue-50 text-blue-700 shadow-sm" : "text-slate-700"
        }`}
      >
        <Home className={`h-4 w-4 ${laMiaAreaActive ? "text-blue-600" : "text-slate-500"}`} />
        La mia area
      </Link>
    </div>
  );
}
