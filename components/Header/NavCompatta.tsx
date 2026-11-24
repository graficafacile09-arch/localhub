"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { VOCI_NAV, voceAttiva } from "./voci-nav";

/**
 * Collegamenti alle sezioni principali dentro la barra compatta (desktop).
 * Stessi link e stesse etichette del menu pubblico; la voce corrente è una
 * pillola verde bosco, come nell'header della homepage.
 */
export default function NavCompatta() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigazione principale"
      className="hidden min-w-0 items-center gap-0.5 lg:flex lg:gap-1"
    >
      {VOCI_NAV.map((voce) => {
        const attiva = voceAttiva(pathname, voce.href);
        return (
          <Link
            key={voce.href}
            href={voce.href}
            aria-current={attiva ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 ${
              attiva
                ? "bg-forest text-white"
                : "text-forest hover:bg-cream hover:text-forest-deep"
            }`}
          >
            {voce.label}
          </Link>
        );
      })}
    </nav>
  );
}
