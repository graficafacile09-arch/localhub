import Image from "next/image";
import Link from "next/link";
import AccountMenu from "./AccountMenu";
import CartBadge from "../carrello/CartBadge";
import { getDatiAccount } from "./get-account-data";

/**
 * Header pubblico: navigazione SEMPRE visibile, senza hamburger né su desktop
 * né su mobile (Home, Negozi, Categorie, Carrello, Account).
 * L'accesso amministratore avviene esclusivamente dall'ingresso dedicato /admin.
 *
 * - Desktop: logo a sinistra, tasti di navigazione a destra nella stessa riga.
 * - Mobile: logo + Account nella prima riga; sotto, la riga dei tasti
 *   principali (Home, Negozi, Categorie, Carrello) compatta e responsive,
 *   senza overflow orizzontale.
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
            <AccountMenu account={account} />
          </div>
        </div>

        {/* NAV — visibile anche su mobile (nessun hamburger), compatta e senza overflow */}
        <nav
          aria-label="Navigazione principale"
          className="flex w-full flex-nowrap items-center justify-center gap-1 sm:gap-2 md:gap-3 lg:w-auto"
        >
          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95 max-sm:px-2 max-sm:text-xs"
          >
            Home
          </Link>

          <Link
            href="/negozi"
            className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95 max-sm:px-2 max-sm:text-xs"
          >
            Negozi
          </Link>

          <Link
            href="/categorie"
            className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95 max-sm:px-2 max-sm:text-xs"
          >
            Categorie
          </Link>

          {/* Carrello — nella posizione dell'ex voce Amministrazione/Cestino,
              sia desktop sia mobile (riga di navigazione). */}
          <CartBadge pill />

          {/* Account: su desktop vive nella riga di navigazione; su mobile
              nella riga del logo (sopra). Mai duplicato. */}
          <div className="hidden lg:block">
            <AccountMenu account={account} />
          </div>
        </nav>
      </div>
    </header>
  );
}
