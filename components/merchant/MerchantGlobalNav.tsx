"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trash2 } from "lucide-react";

export default function MerchantGlobalNav() {
  const pathname = usePathname();

  const laMiaAreaActive = pathname === "/merchant";
  const cestinoActive = pathname.startsWith("/merchant/trash");

  return (
    <div className="mt-4">
      <Link
        href="/merchant"
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-150 hover:bg-slate-50 ${
          laMiaAreaActive ? "bg-blue-50 text-blue-700 shadow-sm" : "text-slate-700"
        }`}
      >
        <Home className={`h-4 w-4 ${laMiaAreaActive ? "text-blue-600" : "text-slate-500"}`} />
        La mia area
      </Link>
      <Link
        href="/merchant/trash"
        className={`mt-1 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-150 hover:bg-slate-50 ${
          cestinoActive ? "bg-blue-50 text-blue-700 shadow-sm" : "text-slate-700"
        }`}
      >
        <Trash2 className={`h-4 w-4 ${cestinoActive ? "text-blue-600" : "text-slate-500"}`} />
        Cestino
      </Link>
    </div>
  );
}
