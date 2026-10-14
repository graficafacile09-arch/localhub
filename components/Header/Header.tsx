import Image from "next/image";
import AccountMenu from "./AccountMenu";
import FarmacieTurnoWidget from "./FarmacieTurnoWidget";
import HeaderCartIcon from "./HeaderCartIcon";
import HeaderNav from "./HeaderNav";
import HeroSearchBar from "@/components/home/HeroSearchBar";
import HomeResetLink from "@/components/home/HomeResetLink";
import WeatherWidget from "./WeatherWidget";
import { getDatiAccount } from "./get-account-data";
import { getGuestMode } from "@/lib/auth/guest";

/**
 * Header pubblico condiviso: stessa struttura su tutte le pagine pubbliche,
 * con logo/account, ricerca e navigazione sempre nello stesso ordine.
 * L'accesso amministratore avviene esclusivamente dall'ingresso dedicato /admin.
 */
export default async function Header(_props: { homepage?: boolean } = {}) {
  const account = await getDatiAccount();
  const guestMode = !account ? await getGuestMode() : false;

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto_auto] items-center gap-x-2 gap-y-0 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-4 md:grid-cols-[260px_minmax(0,1fr)_auto] md:gap-x-3 md:px-4 md:py-0">
        <div className="col-span-2 row-start-1 flex w-full min-w-0 items-center justify-between gap-2 border-b border-slate-100 px-1 pb-1 md:col-span-3 md:justify-between md:gap-4 md:border-0 md:px-0 md:pb-0 md:pt-2">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <WeatherWidget />
          </div>
          <div className="flex min-w-0 shrink-0 items-center">
            <FarmacieTurnoWidget />
          </div>
        </div>

        <div className="col-span-2 row-start-2 flex w-full min-w-0 items-center gap-1 md:contents">
          <HomeResetLink className="min-w-0 shrink-0 md:col-start-1 md:row-start-2">
            <Image
              src="/logo-transparent.png"
              alt="InCittà"
              width={1536}
              height={1024}
              priority
              sizes="(max-width: 374px) min(48vw, 154px), (max-width: 639px) min(56vw, 216px), (max-width: 1279px) min(56vw, 240px), 300px"
              className="-my-2 h-auto max-sm:w-[min(64vw,246px)] max-[374px]:w-[min(58vw,185px)] sm:w-[min(56vw,240px)] md:w-[260px] xl:w-[320px]"
            />
          </HomeResetLink>
          <div className="ml-auto mr-1 flex shrink-0 items-center gap-1 md:col-start-3 md:row-start-2">
            <div className="flex flex-col items-center gap-1 max-sm:flex-row">
              <HeaderCartIcon />
              <AccountMenu account={account} guestMode={guestMode} />
            </div>
          </div>
        </div>

        <div className="col-span-2 row-start-3 w-full min-w-0 py-1 md:col-span-1 md:col-start-2 md:row-start-2 md:py-2">
          <HeroSearchBar inHeader />
        </div>

        <div className="col-span-2 row-start-4 mt-3 w-full min-w-0 md:col-span-3 md:row-start-3 md:mt-0 md:pt-4">
          <HeaderNav />
        </div>
      </div>
    </header>
  );
}
