import Image from "next/image";
import Link from "next/link";
import AccountMenu from "./AccountMenu";
import CartBadge from "../carrello/CartBadge";
import HeaderNav from "./HeaderNav";
import { getDatiAccount } from "./get-account-data";

/**
 * Header pubblico — barra marketplace blu profonda, pulita e sempre leggibile.
 *
 * - Desktop: un'unica riga [LOGO in box bianco] | [Home] [Negozi] [Categorie]
 *   [Amministrazione] (nav centrata) | [Carrello] [Account giallo].
 * - Mobile: prima riga logo + Carrello + Account; seconda riga con le 4 voci
 *   distribuite uniformemente. Nessun hamburger, nessun drawer.
 *
 * Il menu Account riflette l'AREA ATTIVA della sessione (cookie httpOnly
 * lh_area): cliente, venditore o amministratore.
 */
export default async function Header() {
  const account = await getDatiAccount();

  return (
    <header className="bg-blue-950 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.55)] sm:mx-3 sm:mt-3 sm:rounded-2xl md:mx-4 md:mt-4">
      <div className="mx-auto max-w-7xl px-2.5 py-2.5 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 md:flex-nowrap md:gap-x-4">
          {/* LOGO (box bianco) + azioni mobile: riga 1 su smartphone */}
          <div className="flex shrink-0 items-center justify-between gap-2 md:justify-start">
            <Link
              href="/"
              aria-label="LocalHub — Home"
              className="shrink-0 rounded-lg bg-white p-1 shadow-sm transition hover:shadow-md sm:rounded-xl sm:p-1.5"
            >
              <Image
                src="/logo.png"
                alt="LocalHub"
                width={1536}
                height={1024}
                priority
                className="h-8 w-auto sm:h-9 lg:h-10"
              />
            </Link>

            {/* Carrello + Account su mobile (in riga con il logo) */}
            <div className="flex shrink-0 items-center gap-2 md:hidden">
              <CartBadge />
              <AccountMenu account={account} />
            </div>
          </div>

          {/* Nav centrata (desktop) */}
          <HeaderNav account={account} layout="desktop" />

          {/* Carrello + Account (desktop) */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <CartBadge />
            <AccountMenu account={account} />
          </div>
        </div>

        {/* Nav mobile: seconda riga con le 4 voci sempre visibili */}
        <HeaderNav account={account} layout="mobile" />
      </div>
    </header>
  );
}
