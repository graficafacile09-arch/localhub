import Image from "next/image";
import Link from "next/link";
import AccountMenu from "./AccountMenu";
import FarmacieTurnoWidget from "./FarmacieTurnoWidget";
import HeaderCartIcon from "./HeaderCartIcon";
import HeaderNav from "./HeaderNav";
import HeroSearchBar from "@/components/home/HeroSearchBar";
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
export default async function Header({ homepage = false }: { homepage?: boolean } = {}) {
  const account = await getDatiAccount();
  // Modalità ospite: cookie httpOnly lh_guest letto SOLO lato server e
  // rilevante solo per l'utente anonimo (per l'autenticato il proxy la
  // cancella). L'AccountMenu mostra allora l'indicatore OSPITE.
  const guestMode = !account ? await getGuestMode() : false;

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className={`mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-1.5 py-1.5 ${homepage ? "max-sm:gap-0" : "max-sm:gap-2"} max-sm:px-2 max-sm:py-2 max-[374px]:gap-1 max-[374px]:px-1 max-[374px]:py-1 sm:px-4 md:px-4 md:py-0 xl:gap-x-4 xl:gap-y-0 xl:py-0 ${homepage ? "xl:grid xl:grid-cols-[320px_minmax(0,1fr)_auto] xl:grid-rows-[auto_auto] xl:items-center" : "xl:flex-row xl:items-start xl:gap-4"}`}>
        <div className={homepage ? "contents" : "flex w-full flex-col xl:w-auto"}>
          {homepage && (
            <div className="order-0 flex w-full min-w-0 items-center justify-between gap-2 border-b border-slate-100 px-1 pb-1 xl:col-span-3 xl:row-start-1 xl:justify-end xl:gap-4 xl:border-0 xl:px-0 xl:pb-0 xl:pt-2">
              <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                <FarmacieTurnoWidget />
              </div>
              <div className="flex shrink-0 items-center">
                <WeatherWidget />
              </div>
            </div>
          )}
          <div className={`flex w-full min-w-0 items-center gap-1 max-[374px]:gap-1 ${homepage ? "order-1 xl:order-none xl:contents" : ""}`}>
            <Link
              href="/"
              aria-label="InCittà — Home"
              className={`min-w-0 shrink-0 ${homepage ? "xl:col-start-1 xl:row-start-2" : ""}`}
            >
              <Image
                src="/logo-transparent.png"
                alt="InCittà"
                width={1536}
                height={1024}
                priority
                sizes="(max-width: 374px) min(48vw, 154px), (max-width: 639px) min(56vw, 216px), (max-width: 1279px) min(56vw, 240px), 300px"
                className="-my-2 h-auto max-sm:w-[min(64vw,246px)] max-[374px]:w-[min(58vw,185px)] sm:w-[min(56vw,240px)] md:w-[260px] xl:w-[320px]"
              />
            </Link>
            <div className={`ml-auto mr-2 flex shrink-0 items-center gap-1 max-sm:mr-0 xl:mr-1 ${homepage ? "xl:col-start-3 xl:row-start-2" : ""}`}>
              {!homepage && (
                <div className="xl:-ml-2 max-sm:hidden">
                  <WeatherWidget />
                </div>
              )}
              <div className="flex flex-col items-center gap-1 max-sm:flex-row">
                <HeaderCartIcon />
                <AccountMenu account={account} guestMode={guestMode} />
              </div>
            </div>
          </div>
          {!homepage && (
            <div className="max-sm:mt-1">
              <FarmacieTurnoWidget />
            </div>
          )}
        </div>

        {homepage ? (
          <>
            <div className="order-2 w-full min-w-0 flex-1 py-1 max-sm:py-0 xl:order-none xl:col-start-2 xl:row-start-2 xl:py-2">
              <HeroSearchBar inHeader />
            </div>
            <div className="hidden w-full lg:block lg:col-start-2 lg:col-span-2 lg:row-start-3 xl:justify-self-end">
              <HeaderNav />
            </div>
          </>
        ) : (
          <HeaderNav />
        )}
  );
}
