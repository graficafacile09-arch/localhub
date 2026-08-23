import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import AccountMenu from "./AccountMenu";
import CartBadge from "../carrello/CartBadge";
import { getDatiAccount } from "./get-account-data";

/**
 * Header pubblico: navigazione SEMPRE visibile, senza hamburger né su desktop
 * né su mobile (Home, Negozi, Categorie, Amministrazione, Carrello, Account).
 *
 * - Desktop: logo a sinistra, tasti di navigazione a destra nella stessa riga.
 * - Mobile: logo + Carrello + Account nella prima riga; sotto, la riga dei
 *   tasti principali (Home, Negozi, Categorie, Amministrazione) compatta e
 *   responsive, senza overflow orizzontale.
 *
 * Il menu Account riflette l'AREA ATTIVA della sessione (cookie httpOnly
 * lh_area): cliente, venditore o amministratore.
 */
export default async function Header() {
  const account = await getDatiAccount();

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 md:px-6 lg:flex-row lg:gap-4">
        {/* LOGO + azioni (carrello, account) — su mobile in riga con il logo */}
        <div className="flex w-full items-center justify-between gap-2 lg:w-auto">
          <Link href="/" aria-label="LocalHub — Home">
            <Image
              src="/logo.png"
              alt="LocalHub"
              width={170}
              height={55}
              priority
              className="h-auto w-[120px] sm:w-[170px] lg:w-[220px]"
            />
          </Link>
          <div className="flex items-center gap-2 lg:hidden">
            <CartBadge />
            <AccountMenu account={account} />
          </div>
        </div>

        {/* NAV — visibile anche su mobile (nessun hamburger), compatta e senza overflow */}
        <nav
          aria-label="Navigazione principale"
          className="flex w-full flex-nowrap items-center justify-center gap-1.5 sm:gap-2 md:gap-3 lg:w-auto"
        >
          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95 max-sm:px-2.5 max-sm:text-[13px]"
          >
            Home
          </Link>

          <Link
            href="/negozi"
            className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95 max-sm:px-2.5 max-sm:text-[13px]"
          >
            Negozi
          </Link>

          <Link
            href="/categorie"
            className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95 max-sm:px-2.5 max-sm:text-[13px]"
          >
            Categorie
          </Link>

          {/* Icona Amministrazione (scudetto) — visibile accanto alle voci
              principali. Click:
              - non autenticato  → /login?area=admin
              - autenticato come admin → /amministratore
              L'area di sessione resta protetta da proxy + layout: qualunque
              altro utente viene reindirizzato alla propria area. */}
          <Link
            href={account && account.area === "admin" ? "/amministratore" : "/login?area=admin"}
            title="Amministrazione"
            aria-label="Amministrazione"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </Link>

          {/* Carrello + Account: su desktop vivono nella riga di navigazione;
              su mobile nella riga del logo (sopra). Mai duplicati. */}
          <div className="hidden lg:block">
            <CartBadge />
          </div>
          <div className="hidden lg:block">
            <AccountMenu account={account} />
          </div>
        </nav>
      </div>
    </header>
  );
}
