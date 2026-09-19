import Image from "next/image";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import AccountMenu from "./AccountMenu";
import CartBadge from "../carrello/CartBadge";
import WeatherWidget from "./WeatherWidget";
import { getDatiAccount } from "./get-account-data";

export default async function Header() {
  const account = await getDatiAccount();

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 md:px-6 lg:flex-row lg:gap-4">
        <div className="flex w-full items-center justify-between gap-2 lg:w-auto">
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
          <div className="flex items-center gap-2">
            <WeatherWidget />
            <div className="lg:hidden"><CartBadge /></div>
            <div className="lg:hidden"><AccountMenu account={account} /></div>
          </div>
        </div>

        <nav
          aria-label="Navigazione principale"
          className="flex w-full flex-nowrap items-center justify-center gap-1 sm:gap-2 md:gap-3 lg:w-auto"
        >
          <Link href="/" className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95 max-sm:px-2 max-sm:text-xs">Home</Link>
          <Link href="/negozi" className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95 max-sm:px-2 max-sm:text-xs">Negozi</Link>
          <Link href="/categorie" className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95 max-sm:px-2 max-sm:text-xs">Categorie</Link>
          <Link href="/amministratore/cestino" className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95 max-sm:px-2 max-sm:text-xs">
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden /> Cestino
          </Link>
          <div className="hidden lg:block"><CartBadge /></div>
          <div className="hidden lg:block"><AccountMenu account={account} /></div>
        </nav>
      </div>
    </header>
  );
}
