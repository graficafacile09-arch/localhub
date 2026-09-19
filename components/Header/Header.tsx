import Image from "next/image";
import Link from "next/link";
import AccountMenu from "./AccountMenu";
import FarmacieTurnoWidget from "./FarmacieTurnoWidget";
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
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-1.5 py-3 sm:px-4 md:px-6 lg:flex-row lg:items-start lg:gap-3">
        {/* Colonna sinistra: riga LOGO + (METEO sopra ACCEDI) sopra, widget farmacie sotto */}
        <div className="flex w-full flex-col lg:w-auto">
          {/*
            Mobile: logo grande a sinistra, METEO in alto a destra e ACCEDI
            sotto (allineati a destra, senza wrap né sovrapposizioni).
            Desktop: logo + meteo + account in un'unica riga (layout invariato).
          */}
          <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3">
            <Link href="/" aria-label="LocalHub — Home" className="shrink-0">
              <Image
                src="/logo-transparent.png"
                alt="LocalHub"
                width={1536}
                height={1024}
                priority
                className="h-auto w-[min(56vw,240px)] lg:w-[300px]"
              />
            </Link>
            <div className="ml-auto flex shrink-0 flex-col items-end gap-1.5 lg:ml-0 lg:flex-row lg:items-center lg:gap-2">
              <WeatherWidget />
              <AccountMenu account={account} />
            </div>
          </div>
          <FarmacieTurnoWidget />
        </div>

        {/* NAV — visibile anche su mobile (nessun hamburger), compatta e senza overflow */}
        <HeaderNav />


      </div>
    </header>
  );
}
