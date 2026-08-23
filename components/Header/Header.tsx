import Image from "next/image";
import Link from "next/link";
import AccountMenu from "./AccountMenu";
import HeaderNav from "./HeaderNav";
import WeatherWidget from "./WeatherWidget";
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
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-3 py-3 sm:px-4 md:px-6 lg:flex-row lg:items-center lg:gap-3">
        {/* LOGO + METEO + ACCOUNT — stessa riga sia desktop sia mobile */}
        <div className="flex w-full items-center gap-1.5 sm:gap-2 lg:w-auto">
          <Link href="/" aria-label="LocalHub — Home" className="shrink-0">
            <Image
              src="/logo-transparent.png"
              alt="LocalHub"
              width={170}
              height={55}
              priority
              className="h-auto w-[130px] sm:w-[160px] lg:w-[220px]"
            />
          </Link>
          <WeatherWidget />
          <div className="ml-auto shrink-0 lg:ml-0">
            <AccountMenu account={account} />
          </div>
        </div>

        {/* NAV — visibile anche su mobile (nessun hamburger), compatta e senza overflow */}
        <HeaderNav />


      </div>
    </header>
  );
}
