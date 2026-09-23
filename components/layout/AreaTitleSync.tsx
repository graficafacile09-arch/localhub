"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const AREA_TITLES: Array<[string, string]> = [
  ["/amministratore", "Amministratore — InCittà"],
  ["/cliente", "Area Clienti — LocalHub"],
  ["/merchant", "Area Venditore — InCittà"],
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
