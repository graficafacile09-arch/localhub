"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home as HomeIcon, LayoutGrid, ShieldCheck, Store } from "lucide-react";
import type { ComponentType } from "react";
import type { DatiAccount } from "./AccountMenu";

type VoceNav = {
  key: string;
  label: string;
  href: string;
  icona: ComponentType<{ className?: string }>;
  attiva: boolean;
};

/**
 * Navigazione principale dell'header pubblico (client: usa usePathname per lo
 * stato attivo). Nessun hamburger: le voci sono SEMPRE visibili, in due
 * layout dello stesso elenco:
 * - desktop: riga centrata (Home, Negozi, Categorie, Amministrazione);
 * - mobile: seconda riga a 4 colonne uniformi, compatta fino a 320px.
 *
 * Lo stato attivo segue la route corrente (giallo LocalHub + indicatore).
 */
export default function HeaderNav({
  account,
  layout,
}: {
  account: DatiAccount | null;
  layout: "desktop" | "mobile";
}) {
  const pathname = usePathname();

  const voci: VoceNav[] = [
    { key: "home", label: "Home", href: "/", icona: HomeIcon, attiva: pathname === "/" },
    {
      key: "negozi",
      label: "Negozi",
      href: "/negozi",
      icona: Store,
      attiva: pathname === "/negozi" || pathname.startsWith("/negozio"),
    },
    {
      key: "categorie",
      label: "Categorie",
      href: "/categorie",
      icona: LayoutGrid,
      attiva: pathname.startsWith("/categorie"),
    },
    {
      // Stessa logica attuale: admin autenticato → /amministratore, altrimenti login admin.
      key: "admin",
      label: "Amministrazione",
      href: account && account.area === "admin" ? "/amministratore" : "/login?area=admin",
      icona: ShieldCheck,
      attiva: pathname.startsWith("/amministratore"),
    },
  ];

  if (layout === "desktop") {
    return (
      <nav
        aria-label="Navigazione principale"
        className="hidden flex-1 items-center justify-center gap-1 md:flex lg:gap-2"
      >
        {voci.map((voce) => (
          <Link
            key={voce.key}
            href={voce.href}
            title={voce.label}
            className={`relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition active:scale-95 ${
              voce.attiva
                ? "text-yellow-300 hover:bg-white/10 hover:text-yellow-200"
                : "text-white/85 hover:bg-white/10 hover:text-white"
            }`}
          >
            <voce.icona className="h-4 w-4" aria-hidden />
            <span>{voce.label}</span>
            {voce.attiva && (
              <span
                aria-hidden
                className="absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-yellow-400"
              />
            )}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Navigazione principale"
      className="grid grid-cols-4 gap-1 md:hidden"
    >
      {voci.map((voce) => (
        <Link
          key={voce.key}
          href={voce.href}
          title={voce.label}
          className={`relative flex flex-col items-center justify-center gap-1 rounded-lg px-0.5 pb-1.5 pt-2 text-[10px] font-semibold leading-tight tracking-tight transition active:scale-95 [overflow-wrap:anywhere] ${
            voce.attiva
              ? "text-yellow-300 hover:bg-white/10 hover:text-yellow-200"
              : "text-white/85 hover:bg-white/10 hover:text-white"
          }`}
        >
          <voce.icona className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="text-center">{voce.label}</span>
          {voce.attiva && (
            <span
              aria-hidden
              className="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-yellow-400"
            />
          )}
        </Link>
      ))}
    </nav>
  );
}
