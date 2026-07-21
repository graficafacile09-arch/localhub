"use client";

import Image from "next/image";
import Link from "next/link";
import { Home, LayoutGrid, Search, Store, UserRound } from "lucide-react";

const navLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/negozi", label: "Negozi", icon: Store },
  { href: "/#categorie", label: "Categorie", icon: LayoutGrid },
  { href: "/ricerca", label: "Cerca", icon: Search, featured: true },
  { href: "/merchant", label: "Area negozianti", icon: UserRound },
];

// Voci mostrate nella bottom navigation su mobile (max 5)
const bottomNavLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/negozi", label: "Negozi", icon: Store },
  { href: "/#categorie", label: "Categorie", icon: LayoutGrid },
  { href: "/merchant", label: "Negozianti", icon: UserRound },
];

export default function Header() {
  return (
    <>
      {/* ── Header desktop + tablet ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-blue-800/20 bg-[linear-gradient(180deg,#1d4ed8_0%,#2563eb_100%)] text-white shadow-lg">
        <div className="h-1 bg-linear-to-r from-cyan-300 via-white to-yellow-300" />

        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:px-6">
          {/* Logo + tagline */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/"
              className="flex items-center justify-center rounded-2xl bg-white px-3 py-2 shadow-[0_12px_34px_-20px_rgba(15,23,42,0.28)] ring-1 ring-white/70 sm:justify-start"
            >
              <Image
                src="/logo.png"
                alt="LocalHub"
                width={170}
                height={55}
                priority
                className="h-auto w-36 sm:w-40 md:w-44"
              />
            </Link>

            <div className="hidden rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium text-blue-50 md:inline-flex">
              Portale locale per negozi, servizi e professionisti
            </div>
          </div>

          {/* Navbar orizzontale — tutte le voci, scroll su schermi piccoli */}
          <nav
            className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-white/15 bg-white/10 px-2 py-2 backdrop-blur-sm"
            style={{ scrollbarWidth: "none" }}
            aria-label="Navigazione principale"
          >
            {navLinks.map((link) => {
              const Icon = link.icon;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-200 ${
                    link.featured
                      ? "bg-linear-to-r from-amber-400 via-yellow-400 to-amber-500 text-gray-900 shadow-lg shadow-amber-500/40 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400"
                      : "bg-transparent text-white hover:bg-white/15 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* ── Bottom navigation — solo mobile (sm e sotto) ─────────────────────── */}
      {/*
        Visibile solo su schermi < sm (640px).
        Posizionata fixed in basso, sopra il contenuto.
        Il padding-bottom nel body compensa l'altezza della barra.
      */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t border-blue-800/30 bg-[linear-gradient(180deg,#1e40af_0%,#1d4ed8_100%)] shadow-[0_-4px_24px_rgba(15,23,42,0.18)] sm:hidden"
        aria-label="Navigazione mobile"
      >
        {bottomNavLinks.map((link) => {
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 text-center transition-all duration-150
                ${
                  link.featured
                    ? "text-amber-300 active:text-amber-200"
                    : "text-blue-100 active:text-white"
                }
              `}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="text-[10px] font-semibold leading-none tracking-wide">
                {link.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Spacer mobile: evita che il contenuto finisca sotto la bottom nav */}
      <div className="h-16 sm:hidden" aria-hidden />
    </>
  );
}
