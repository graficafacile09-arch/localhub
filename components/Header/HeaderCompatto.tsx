import Image from "next/image";
import Link from "next/link";
import { Search, Sprout } from "lucide-react";
import AccountMenu, { type DatiAccount } from "./AccountMenu";
import HeaderCartIcon from "./HeaderCartIcon";
import LanguageToggle from "./LanguageToggle";
import MenuCompatto from "./MenuCompatto";
import NavCompatta from "./NavCompatta";
import PulsanteIndietro from "./PulsanteIndietro";

/**
 * Intestazione delle pagine interne: barra compatta e sticky.
 *
 * Sostituisce SOLO nelle pagine interne l'intestazione grande della homepage
 * (logo grande + meteo/stagionalità + barra di ricerca + pillole). Restano
 * raggiungibili da qui tutte le funzioni del sito: logo e Home tornano alla
 * homepage, le sezioni sono nello stesso elenco del menu, Indietro usa la
 * cronologia, e ci sono ricerca, stagionalità, carrello, account e lingua.
 *
 * L'altezza è fissa (68 px): essendo `sticky`, la barra resta in alto durante
 * lo scroll e occupa spazio nel flusso, quindi non copre mai il contenuto.
 */
export default function HeaderCompatto({
  account,
  guestMode,
}: {
  account: DatiAccount | null;
  guestMode: boolean;
}) {
  return (
    <header
      data-header-compatto="true"
      className="sticky top-0 z-40 border-b border-[#e9dfc9] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
    >
      <div className="mx-auto flex h-17 w-full max-w-[1500px] items-center gap-2 px-3 sm:px-5 lg:gap-3 lg:px-7">
        <PulsanteIndietro />

        <Link href="/" aria-label="Radici Calabria — Home" className="flex shrink-0 items-center">
          {/* Stesso asset ritagliato, nitidizzato e a densità 2× dell'header
              grande: qui è solo più piccolo, con le proporzioni esatte
              dell'arte (1536:546), quindi il marchio resta nitido e non
              deformato. */}
          <span className="flex h-[53px] w-[148px] items-center overflow-hidden sm:h-[61px] sm:w-[172px]">
            <Image
              src="/logo-radici-header.png"
              alt="Radici Calabria"
              width={1120}
              height={398}
              quality={95}
              sizes="172px"
              className="h-auto w-full max-w-none"
            />
          </span>
        </Link>

        <NavCompatta />

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5 lg:ml-2">
          <Link
            href="/ricerca"
            aria-label="Cerca prodotti e attività"
            title="Cerca"
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-gold-soft bg-white text-forest transition-colors hover:border-gold hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 lg:inline-flex"
          >
            <Search className="h-[18px] w-[18px]" aria-hidden />
          </Link>
          <Link
            href="/stagionalita"
            aria-label="Stagionalità in Calabria"
            title="Stagionalità"
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-gold-soft bg-white text-forest transition-colors hover:border-gold hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 lg:inline-flex"
          >
            <Sprout className="h-[18px] w-[18px]" aria-hidden />
          </Link>

          <HeaderCartIcon />
          <AccountMenu account={account} guestMode={guestMode} />

          <span className="hidden lg:inline-flex">
            <LanguageToggle />
          </span>

          <MenuCompatto />
        </div>
      </div>
    </header>
  );
}
