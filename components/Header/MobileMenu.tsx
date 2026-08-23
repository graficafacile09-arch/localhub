"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ChevronRight,
  Home,
  LayoutGrid,
  LogIn,
  Menu,
  ShieldCheck,
  ShoppingBasket,
  Store,
  X,
} from "lucide-react";
import type { DatiAccount } from "./AccountMenu";

/**
 * Menu hamburger mobile dell'header pubblico.
 * Contiene le voci di navigazione principali (Home, Negozi, Categorie,
 * Assistente AI) e l'accesso alle aree (account): il sito resta leggibile
 * su mobile senza comprimere 6 elementi in una riga.
 */
export default function MobileMenu({ account }: { account: DatiAccount | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Chiude il menu a ogni cambio di route.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function apriAssistente() {
    setOpen(false);
    window.dispatchEvent(new Event("assistant:open"));
  }

  const areaVoce = account
    ? account.area === "admin"
      ? { label: "Area Amministratore", href: "/amministratore", icon: ShieldCheck }
      : account.area === "merchant"
        ? { label: "Area Venditore", href: "/merchant", icon: Store }
        : { label: "Area Clienti", href: "/cliente", icon: ShoppingBasket }
    : null;

  const voci = [
    { label: "Home", href: "/", icon: Home },
    { label: "Negozi", href: "/negozi", icon: Store },
    { label: "Categorie", href: "/categorie", icon: LayoutGrid },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Apri il menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-blue-900 transition hover:bg-yellow-300 active:scale-95"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            aria-label="Chiudi il menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-900/50"
          />
          <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-xs flex-col overflow-y-auto bg-[#eef3f8] p-4 shadow-2xl">
            {/* Intestazione */}
            <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/70 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                Menu
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition active:bg-slate-200"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Navigazione principale */}
            <nav aria-label="Navigazione principale" className="space-y-1">
              {voci.map((voce) => {
                const Icon = voce.icon;
                return (
                  <Link
                    key={voce.label}
                    href={voce.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-blue-700"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <Icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    {voce.label}
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-300" aria-hidden />
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={apriAssistente}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-blue-700"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <Bot className="h-[18px] w-[18px]" aria-hidden />
                </span>
                Assistente AI
                <ChevronRight className="ml-auto h-4 w-4 text-slate-300" aria-hidden />
              </button>
            </nav>

            {/* Accesso alle aree */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Il tuo account
              </p>
              {areaVoce ? (
                <Link
                  href={areaVoce.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-blue-700"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <areaVoce.icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  {areaVoce.label}
                  <ChevronRight className="ml-auto h-4 w-4 text-slate-300" aria-hidden />
                </Link>
              ) : (
                <div className="space-y-1">
                  <Link
                    href="/login?area=cliente"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-blue-700"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <LogIn className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    Accedi
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-300" aria-hidden />
                  </Link>
                  <Link
                    href="/login?area=merchant"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-blue-700"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <Store className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    Entra come Venditore
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-300" aria-hidden />
                  </Link>
                  <Link
                    href="/login?area=admin"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-blue-700"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    Amministrazione
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-300" aria-hidden />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
