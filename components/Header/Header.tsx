import Image from "next/image";
import Link from "next/link";
import AccountMenu from "./AccountMenu";
import FarmacieTurnoWidget from "./FarmacieTurnoWidget";
import HeaderCartIcon from "./HeaderCartIcon";
import HeaderNav from "./HeaderNav";
import WeatherWidget from "./WeatherWidget";
import { getDatiAccount } from "./get-account-data";
import { getGuestMode } from "@/lib/auth/guest";

export default async function Header() {
  const account = await getDatiAccount();
  const guestMode = !account ? await getGuestMode() : false;

  return (
    <header className="relative z-30 border-b border-blue-950/40 bg-[#071f49] text-white shadow-[0_14px_35px_-18px_rgba(3,20,52,.75)]">
      <div className="mx-auto flex max-w-[96rem] flex-col items-center justify-between gap-2 px-2 py-2.5 sm:px-4 md:py-3 xl:flex-row xl:items-center xl:gap-6">
        <div className="flex w-full flex-col xl:w-auto xl:flex-1">
          <div className="flex w-full min-w-0 items-center gap-2">
            <Link href="/" aria-label="InCittà — Home" className="min-w-0 shrink-0 rounded-xl px-1 py-0.5 transition hover:bg-white/5">
              <Image
                src="/logo-transparent.png"
                alt="InCittà"
                width={1536}
                height={1024}
                priority
                sizes="(max-width: 374px) min(48vw, 154px), (max-width: 639px) min(56vw, 216px), (max-width: 1279px) min(56vw, 240px), 300px"
                className="-my-2 h-auto max-sm:w-[min(64vw,246px)] max-[374px]:w-[min(58vw,185px)] sm:w-[min(56vw,240px)] md:w-[260px] xl:w-[300px] drop-shadow-[0_6px_12px_rgba(0,0,0,.25)]"
              />
            </Link>
            <div className="ml-auto mr-0 flex shrink-0 items-center gap-1.5 sm:gap-2">
              <div className="xl:-ml-2 max-sm:hidden"><WeatherWidget /></div>
              <div className="flex flex-col items-center gap-1 max-sm:flex-row">
                <HeaderCartIcon />
                <AccountMenu account={account} guestMode={guestMode} />
              </div>
            </div>
          </div>
          <div className="max-sm:mt-1">
            <div className="mb-1 hidden px-1 max-sm:block"><WeatherWidget mobileExtended /></div>
            <FarmacieTurnoWidget />
          </div>
        </div>
        <HeaderNav />
      </div>
    </header>
  );
}
