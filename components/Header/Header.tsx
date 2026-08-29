import Image from "next/image";
import Link from "next/link";
import AccountMenu from "./AccountMenu";
import FarmacieTurnoWidget from "./FarmacieTurnoWidget";
import HeaderCartIcon from "./HeaderCartIcon";
import HeaderNav from "./HeaderNav";
import WeatherWidget from "./WeatherWidget";
import { getDatiAccount } from "./get-account-data";
import { getGuestMode } from "@/lib/auth/guest";

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
  // Modalità ospite: cookie httpOnly lh_guest letto SOLO lato server e
  // rilevante solo per l'utente anonimo (per l'autenticato il proxy la
  // cancella). L'AccountMenu mostra allora l'indicatore OSPITE.
  const guestMode = !account ? await getGuestMode() : false;

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-1.5 py-1.5 sm:px-4 md:px-6 lg:flex-row lg:items-start lg:gap-3">
        {/* Colonna sinistra: riga LOGO + METEO + CARRELLO + ACCOUNT sulla
            stessa fascia (compatta, senza wrap a 390px), widget farmacie sotto */}
        <div className="flex w-full flex-col lg:w-auto">
          <div className="flex w-full items-center gap-1.5 sm:gap-3">
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
            <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:gap-2">
              <WeatherWidget />
              {/* Icona Carrello compatta accanto al logo (stessa funzione e
                  stesso badge numerico del vecchio Carrello in nav). */}
              <HeaderCartIcon />
              <AccountMenu account={account} guestMode={guestMode} />
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
