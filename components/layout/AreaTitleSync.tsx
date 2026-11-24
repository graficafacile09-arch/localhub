"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const AREA_TITLES: Array<[string, string]> = [
  ["/amministratore", "Amministratore — Radici Calabria"],
  ["/cliente", "Area consumatori — Radici Calabria"],
  ["/merchant", "Area imprese e operatori — Radici Calabria"],
];

export default function AreaTitleSync() {
  const pathname = usePathname();

  useEffect(() => {
    const match = AREA_TITLES.find(
      ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    if (match) {
      document.title = match[1];
    }
  }, [pathname]);

  return null;
}
