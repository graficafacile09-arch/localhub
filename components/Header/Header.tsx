"use client";

import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Home, LayoutGrid, Search, Store, UserRound } from "lucide-react";

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  featured?: boolean;
  ai?: boolean;
};

const navLinks: NavLink[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/negozi", label: "Negozi", icon: Store },
  { href: "/#categorie", label: "Categorie", icon: LayoutGrid },
  { href: "/ricerca", label: "Cerca", icon: Search, featured: true },
  { href: "/assistant", label: "Assistente AI", icon: Bot, ai: true },
  { href: "/merchant", label: "Negozianti", icon: UserRound },
];

// Bottom nav: 5 tab essenziali — AI al centro
const bottomNavLinks: NavLink[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/negozi", label: "Negozi", icon: Store },
  { href: "/assistant", label: "AI", icon: Bot, ai: true },
  { href: "/#categorie", label: "Categorie", icon: LayoutGrid },
  { href: "/merchant", label: "Account", icon: UserRound },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────────────
          TOP BAR — slim, identità + nav desktop
          Mobile: solo logo + tasto cerca
          Desktop (md+): logo + nav completa
      ───────────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#1d4ed8] shadow-md">
        {/* Accent stripe */}
        <div className="h-0.5 bg-gradient-to-r from-cyan-400 via-white to-yellow-300" />

        <div className="mx-auto flex h-11 max-w-7xl items-center gap-3 px-3 sm:px-4 md:px-5">

          {/* Logo — testo inline, nessun box bianco, occupa poco spazio */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2"
            aria-label="LocalHub — torna alla home"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/30">
              <Image
                src="/logo.png"
                alt=""
                width={24}
                height={24}
                priority
                className="h-5 w-5 object-contain"
              />
            </div>
            <span className="hidden text-sm font-black tracking-tight text-white sm:block">
              InCittà
            </span>
          </Link>

          {/* Spacer */}
          <div className="flex-1" />

          {/* ── Nav desktop (md+) — scrollabile orizzontalmente ── */}
          <nav
            className="hidden items-center gap-1 overflow-x-auto md:flex"
            style={{ scrollbarWidth: "none" }}
            aria-label="Navigazione principale"
          >
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;

              if (link.ai) {
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className={[
                      "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition",
                      isActive
                        ? "bg-white text-violet-700"
                        : "bg-violet-600 text-white hover:bg-violet-500",
                    ].join(" ")}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    AI
                  </Link>
                );
              }

              if (link.featured) {
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className={[
                      "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition",
                      isActive
                        ? "bg-white text-amber-700"
                        : "bg-amber-400 text-gray-900 hover:bg-amber-300",
                    ].join(" ")}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {link.label}
                  </Link>
                );
              }

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={[
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition",
                    isActive
                      ? "bg-white/20 text-white"
                      : "text-blue-100 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* ── Cerca rapido su mobile — solo icona ── */}
          <Link
            href="/ricerca"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-gray-900 shadow-sm transition hover:bg-amber-300 md:hidden"
            aria-label="Cerca"
          >
            <Search className="h-4 w-4" aria-hidden />
          </Link>

        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────────
          BOTTOM NAV — solo mobile (< md)
          Design moderno: pill indicator sull'active, icone compatte
      ───────────────────────────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        aria-label="Navigazione mobile"
      >
        {/* Frosted glass background */}
        <div className="border-t border-white/10 bg-[#1e3a8a]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
          <div className="flex items-center">
            {bottomNavLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;

              /* ── Tab AI (centrale, pill viola) ── */
              if (link.ai) {
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className="flex flex-1 flex-col items-center justify-center py-2 gap-0.5"
                  >
                    <span
                      className={[
                        "flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200",
                        isActive
                          ? "bg-violet-500 shadow-lg shadow-violet-500/40"
                          : "bg-violet-600/70",
                      ].join(" ")}
                    >
                      <Icon className="h-4 w-4 text-white" aria-hidden />
                    </span>
                    <span
                      className={[
                        "text-[9px] font-bold tracking-wider",
                        isActive ? "text-violet-300" : "text-blue-300/70",
                      ].join(" ")}
                    >
                      AI
                    </span>
                  </Link>
                );
              }

              /* ── Tab standard ── */
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className="flex flex-1 flex-col items-center justify-center py-2 gap-0.5"
                >
                  {/* Pill indicator */}
                  <span
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200",
                      isActive ? "bg-white/15" : "bg-transparent",
                    ].join(" ")}
                  >
                    <Icon
                      className={[
                        "h-4 w-4 transition-colors",
                        isActive ? "text-white" : "text-blue-300/70",
                      ].join(" ")}
                      aria-hidden
                    />
                  </span>
                  <span
                    className={[
                      "text-[9px] font-semibold tracking-wide",
                      isActive ? "text-white" : "text-blue-300/60",
                    ].join(" ")}
                  >
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Spacer per la bottom nav */}
      <div
        className="md:hidden"
        style={{ height: `calc(52px + env(safe-area-inset-bottom))` }}
        aria-hidden
      />
    </>
  );
}
