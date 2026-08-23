import Image from "next/image";
import Link from "next/link";
import AccountMenu from "./AccountMenu";
import HeaderNav from "./HeaderNav";
import { getDatiAccount } from "./get-account-data";

/**
 * Header pubblico: navigazione SEMPRE visibile, senza hamburger né su desktop
 * né su mobile (Home, Negozi, Categorie, Carrello, Account).
 * L'accesso amministratore avviene esclusivamente dall'ingresso dedicato /admin.
 *
 * - Desktop: logo a sinistra, navigazione al centro/destra nella stessa riga.
 * - Mobile: logo + Account nella prima riga; sotto, la riga delle quattro voci
 *   (icona sopra + testo sotto) compatta e responsive, senza overflow.
 *
 * Il menu Account riflette l'AREA ATTIVA della sessione (cookie httpOnly
 * lh_area): cliente, venditore o amministratore.
 */
export default async function Header() {
  const account = await getDatiAccount();

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-3 md:px-6 lg:flex-row lg:gap-3">
        {/* LOGO + azioni (carrello, account) — su mobile in riga con il logo */}
        <div className="flex w-full items-center justify-between gap-2 lg:w-auto">
          <Link href="/" aria-label="LocalHub — Home">
            <Image
              src="/logo-transparent.png"
              alt="LocalHub"
              width={170}
              height={55}
              priority
              className="h-auto w-[140px] sm:w-[195px] lg:w-[260px]"
            />
          </Link>
          <div className="flex items-center gap-2 lg:hidden">
            <AccountMenu account={account} />
          </div>
        </div>

        {/* NAV — visibile anche su mobile (nessun hamburger), compatta e senza overflow */}
        <HeaderNav />

        {/* Account: su desktop vive nella riga di navigazione; su mobile
            nella riga del logo (sopra). Mai duplicato. */}
        <div className="hidden lg:block">
          <AccountMenu account={account} />
        </div>
      </div>
    </header>
  );
}
