"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Globe,
  Heart,
  LogIn,
  LogOut,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  UserRound,
} from "lucide-react";
import type { RuoloUtente } from "@/lib/auth/roles";

export type DatiAccount = {
  nome: string;
  email: string;
  role: RuoloUtente;
  /** Solo per admin: possiede almeno un negozio? */
  hasStores: boolean;
  /** Solo per merchant: id del primo negozio (per i link diretti). */
  firstStoreId: string | null;
};

type VoceMenu = {
  label: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
};

export default function AccountMenu({ account }: { account: DatiAccount | null }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // ── Non loggato: pulsante Accedi ────────────────────────────────────────
  if (!account) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
      >
        <LogIn className="h-4 w-4" aria-hidden />
        Accedi
      </Link>
    );
  }

  const { nome, email, role, hasStores, firstStoreId } = account;
  const iniziale = (nome || email).charAt(0).toUpperCase();
  const storeBase = firstStoreId ? `/merchant/${firstStoreId}` : "/merchant";

  const voci: VoceMenu[] =
    role === "admin"
      ? [
          { label: "Pannello Amministratore", href: "/amministratore", icon: ShieldCheck },
          ...(hasStores
            ? [{ label: "Area Commerciante", href: "/merchant", icon: Store }]
            : []),
          { label: "Vai al sito", href: "/", icon: Globe },
          { label: "Impostazioni", href: "/amministratore/impostazioni", icon: Settings },
          { label: "Profilo", href: "/profilo", icon: UserRound },
        ]
      : role === "merchant"
        ? [
            { label: "Il mio negozio", href: "/merchant", icon: Store },
            { label: "Prodotti", href: storeBase, icon: Package },
            { label: "Offerte", href: "/merchant", icon: Tag },
            { label: "Eventi", href: "/merchant", icon: CalendarDays },
            { label: "Statistiche", href: "/merchant", icon: BarChart3 },
            { label: "Profilo", href: "/profilo", icon: UserRound },
          ]
        : [
            { label: "Profilo", href: "/profilo", icon: UserRound },
            { label: "Preferiti", href: "/preferiti", icon: Heart },
            { label: "Ordini", href: "/ordini", icon: ShoppingBag },
          ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Menu utente di ${nome || email}`}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm transition hover:border-blue-300 hover:shadow"
      >
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-cyan-400 to-blue-600 text-sm font-black text-white ring-2 ring-blue-100"
        >
          {iniziale}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-sm font-bold leading-tight text-slate-900">
            {nome || email}
          </span>
          <span className="block text-[11px] capitalize text-slate-500">
            {role}
          </span>
        </span>
        <ChevronDown
          className={`hidden h-4 w-4 text-slate-400 transition-transform duration-200 sm:block ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu utente"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-100 bg-white p-2 text-slate-700 shadow-xl"
        >
          <p className="border-b border-slate-100 px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {nome || email} · {role}
          </p>

          <div className="py-1">
            {voci.map((voce) =>
              voce.href ? (
                <Link
                  key={voce.label}
                  href={voce.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-slate-50 hover:text-blue-700"
                >
                  <voce.icon className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                  {voce.label}
                </Link>
              ) : null
            )}
          </div>

          <div className="mt-1 border-t border-slate-100 pt-1">
            <form action="/api/auth/signout" method="post">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                Esci
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
