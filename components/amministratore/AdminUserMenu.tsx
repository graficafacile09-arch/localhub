"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";

/** Dati utente placeholder: il pannello non tocca ancora l'autenticazione. */
const ADMIN_USER = {
  name: "Amministratore",
  role: "Amministratore",
};

/**
 * Riquadro utente in alto a destra con menu a tendina.
 * Voci: Il mio profilo, Impostazioni (punta al modulo esistente), Esci.
 * Il logout NON è ancora implementato.
 */
export default function AdminUserMenu() {
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

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-white transition hover:bg-white/15"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-cyan-400 to-blue-600 text-sm font-black text-white ring-2 ring-white/30"
        >
          {ADMIN_USER.name.charAt(0)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-bold leading-tight">
            {ADMIN_USER.name}
          </span>
          <span className="block text-[11px] text-blue-100">
            Ruolo: {ADMIN_USER.role}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-blue-100 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-100 bg-white p-2 text-slate-700 shadow-xl"
        >
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {ADMIN_USER.name} · {ADMIN_USER.role}
          </p>

          <Link
            href="/profilo"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-slate-50 hover:text-blue-700"
          >
            <UserRound className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
            Il mio profilo
          </Link>

          <Link
            href="/amministratore/impostazioni"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-slate-50 hover:text-blue-700"
          >
            <Settings className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
            Impostazioni
          </Link>

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
      )}
    </div>
  );
}
