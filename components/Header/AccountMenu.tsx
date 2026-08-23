"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  ChevronDown,
  LogOut,
  ShieldCheck,
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
          aria-label="Account"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-yellow-400 px-3 text-sm font-bold text-blue-950 shadow-[0_4px_14px_-4px_rgba(202,138,4,0.55)] transition hover:bg-yellow-300 active:scale-95"
        >
          <UserRound className="h-4 w-4" aria-hidden />
          Account
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
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
  // "Area Venditore" apre SEMPRE l'elenco negozi (/merchant): nessun negozio
  // viene aperto automaticamente. Si entra nel singolo negozio solo cliccando
  // una riga dell'elenco (il badge ordini vive lì, accanto al nome).
  const storeBase = "/merchant";

  /**
   * Il menu mostra ESCLUSIVAMENTE l'area attiva della sessione (cookie
   * httpOnly lh_area), scelta al login e fissa per tutta la sessione:
   * - sessione admin → solo Area Amministratore
   * - sessione merchant → solo Area Venditore
   * - sessione cliente → solo Area Clienti
   * Le altre aree sono INVISIBILI anche se l'account possiede altri ruoli:
   * per cambiarle serve logout e rientro dall'ingresso corretto.
   *
   * UNA FUNZIONE = UNA VOCE: Profilo, Preferiti e Ordini NON sono duplicati
   * qui (sono nella navigazione dell'area); il ritorno al sito avviene dal
   * logo e dal pulsante Home, non da una voce del menu account.
   */
  const voci: VoceMenu[] = [];

  if (area === "admin") {
    voci.push({ label: "Area Amministratore", href: "/amministratore", icon: ShieldCheck });
  } else if (area === "merchant") {
    voci.push({ label: "Area Venditore", href: storeBase, icon: Store });
  } else if (area === "cliente") {
    voci.push({ label: "Area Clienti", href: "/cliente", icon: ShoppingBasket });
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Menu account di ${nome || email}`}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-yellow-400 px-3 text-sm font-bold text-blue-950 shadow-[0_4px_14px_-4px_rgba(202,138,4,0.55)] transition hover:bg-yellow-300 active:scale-95"
      >
        <UserRound className="h-4 w-4" aria-hidden />
        Account
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
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
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
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
