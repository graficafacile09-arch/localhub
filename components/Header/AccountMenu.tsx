"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Globe,
  Heart,
  LogIn,
  LogOut,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Store,
  UserRound,
} from "lucide-react";
import type { RuoloUtente } from "@/lib/auth/roles";
import type { AreaAttiva } from "@/lib/auth/area";

export type DatiAccount = {
  nome: string;
  email: string;
  /** Ruolo a priorità maggiore (solo informativo, non determina l'accesso). */
  role: RuoloUtente;
  /** TUTTI i ruoli posseduti (solo informativo, non determina l'accesso). */
  ruoli: RuoloUtente[];
  /**
   * Area ATTIVA della sessione (cookie httpOnly lh_area): è lei che determina
   * le voci del menu. Fissa per tutta la sessione, scelta al login.
   */
  area: AreaAttiva | null;
  /** True se l'utente possiede almeno un negozio. */
  hasStores: boolean;
  /** Id del primo negozio (per i link diretti dell'area venditore). */
  firstStoreId: string | null;
};

type VoceMenu = {
  label: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
};

/** Etichette italiane dei ruoli mostrate all'utente (mai i valori tecnici). */
const ETICHETTE_RUOLO: Record<RuoloUtente, string> = {
  customer: "Acquirente",
  merchant: "Venditore",
  admin: "Amministratore",
};

/** Etichetta dell'area ATTIVA: è la sessione, non il ruolo, a qualificare l'utente. */
const ETICHETTE_AREA: Record<AreaAttiva, string> = {
  cliente: "Acquirente",
  merchant: "Venditore",
  admin: "Amministratore",
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

  // ── Non loggato: pulsante Accedi con menu a tendina ─────────────────────
  // Il menu offre ESCLUSIVAMENTE l'ingresso Cliente e Venditore (flussi di
  // login esistenti). L'accesso Amministratore resta solo dallo scudetto
  // nella barra di navigazione.
  if (!account) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          <LogIn className="h-4 w-4" aria-hidden />
          Accedi
        </button>

        {open && (
          <div
            role="menu"
            aria-label="Accedi"
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-100 bg-white p-2 text-slate-700 shadow-xl"
          >
            <Link
              href="/login?area=cliente"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-slate-50 hover:text-blue-700"
            >
              <ShoppingBasket className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              Entra come Cliente
            </Link>
            <Link
              href="/login?area=merchant"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-slate-50 hover:text-blue-700"
            >
              <Store className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              Entra come Venditore
            </Link>
          </div>
        )}
      </div>
    );
  }

  const { nome, email, area } = account;
  const iniziale = (nome || email).charAt(0).toUpperCase();
  const storeBase = account.firstStoreId
    ? `/merchant/${account.firstStoreId}`
    : "/merchant";

  /**
   * Il menu mostra ESCLUSIVAMENTE l'area attiva della sessione (cookie
   * httpOnly lh_area), scelta al login e fissa per tutta la sessione:
   * - sessione admin → solo Area Amministratore (+ Impostazioni)
   * - sessione merchant → solo Area Venditore
   * - sessione cliente → solo Area Clienti (Profilo, Preferiti, Ordini)
   * Le altre aree sono INVISIBILI anche se l'account possiede altri ruoli:
   * per cambiarle serve logout e rientro dall'ingresso corretto.
   */
  const voci: VoceMenu[] = [];

  if (area === "admin") {
    voci.push({ label: "Area Amministratore", href: "/amministratore", icon: ShieldCheck });
  } else if (area === "merchant") {
    voci.push({ label: "Area Venditore", href: storeBase, icon: Store });
  } else if (area === "cliente") {
    voci.push({ label: "Area Clienti", href: "/cliente", icon: ShoppingBasket });
    voci.push({ label: "Profilo", href: "/cliente/profilo", icon: UserRound });
    voci.push({ label: "Preferiti", href: "/cliente/preferiti", icon: Heart });
    voci.push({ label: "Ordini", href: "/cliente/ordini", icon: ShoppingBag });
  }

  voci.push({ label: "Vai al sito", href: "/", icon: Globe });

  if (area === "admin") {
    voci.push({ label: "Impostazioni", href: "/amministratore/impostazioni", icon: Settings });
  }

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
          <span className="block text-[11px] text-slate-500">
            {area ? ETICHETTE_AREA[area] : ETICHETTE_RUOLO[account.role]}
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
            {nome || email} · {area ? ETICHETTE_AREA[area] : ETICHETTE_RUOLO[account.role]}
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
