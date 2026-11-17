import Image from "next/image";
import Link from "next/link";
import AccountMenu from "./AccountMenu";
import LanguageToggle from "./LanguageToggle";
import StagionalitaWidget from "./StagionalitaWidget";
import HeaderCartIcon from "./HeaderCartIcon";
import HeaderNav from "./HeaderNav";
import HeaderCompatto from "./HeaderCompatto";
import HeroSearchBar from "@/components/home/HeroSearchBar";
import WeatherWidget from "./WeatherWidget";
import { getDatiAccount } from "./get-account-data";
import { getGuestMode } from "@/lib/auth/guest";

/**
 * Header pubblico condiviso.
 *
 * Struttura (allineata al mockup approvato):
 * - logo originale a sinistra;
 * - barra di ricerca bianca con dettagli oro al centro;
 * - carrello, account e selettore lingua impilati a destra;
 * - navigazione a pillole su una riga dedicata.
 *
 * Due modalità:
 * - HOMEPAGE (`homepage`): questa intestazione grande, identica al mockup;
 * - PAGINE INTERNE: `HeaderCompatto`, barra sticky da 56 px con logo, sezioni,
 *   Indietro, ricerca, stagionalità, carrello, account e lingua. Il contenuto
 *   della pagina parte subito sotto la barra, senza l'ingombro della hero.
 * Link, ricerca e voci di navigazione restano gli stessi.
 */
export default async function Header({ homepage = false }: { homepage?: boolean } = {}) {
  const account = await getDatiAccount();
  const guestMode = !account ? await getGuestMode() : false;

  // Pagine interne: barra compatta al posto dell'intestazione grande.
  if (!homepage) {
    return <HeaderCompatto account={account} guestMode={guestMode} />;
  }

  return (
    <header className="relative z-30 border-b border-[#e9dfc9] bg-white">
      <div className="mx-auto w-full max-w-[1500px] px-3 sm:px-5 lg:px-7">
        {/* Riga meteo + stagionalità: vive solo nell'intestazione grande,
            quindi soltanto in homepage. */}
        <div className="flex min-h-7 items-center justify-between gap-3 border-b border-slate-100 py-1.5">
          <div className="flex min-w-0 items-center">
            <WeatherWidget />
          </div>
          {/* Il widget resta ancorato a destra anche quando il meteo non ha
              ancora dati (prima scivolava a sinistra e sembrava che il widget
              del meteo fosse sparito). */}
          <div className="ml-auto flex min-w-0 shrink-0 items-center">
            <StagionalitaWidget />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 py-2 sm:gap-x-4 lg:flex-nowrap lg:gap-x-6 lg:pb-0 lg:pt-3">
          <Link href="/" aria-label="Radici Calabria — Home" className="min-w-0 shrink self-center lg:shrink-0">
            {/* L'asset del logo è già ritagliato sull'arte (nessun margine
                bianco), preparato a densità 2× (1120 px per 560 px mostrati) e
                nitidizzato alla dimensione finale: niente ricampionamento dal
                morbido 1536×1024 originale, quindi la scritta CALABRIA resta
                definita. `sizes` fa servire dal resize di Next la misura esatta
                dello schermo (640 px a 1x, 1120 px a 2x) invece di far
                rimpicciolire sempre il 2× nel browser. La finestra usa le
                proporzioni esatte dell'arte (1536:546), così il marchio non
                viene mai tagliato. */}
            <span className="flex h-[99px] w-[278px] max-w-full items-center overflow-hidden max-[389px]:h-[89px] max-[389px]:w-[250px] sm:h-[126px] sm:w-[355px] md:h-[180px] md:w-[507px] lg:h-[199px] lg:w-[560px]">
              <Image
                src="/logo-radici-header.png"
                alt="Radici Calabria"
                width={1120}
                height={398}
                preload
                quality={95}
                sizes="(max-width: 639px) 278px, (max-width: 1023px) 507px, 560px"
                className="h-auto w-full max-w-none"
              />
            </span>
          </Link>

          <div className="order-3 w-full min-w-0 lg:order-none lg:w-auto lg:max-w-[790px] lg:flex-1">
            <HeroSearchBar inHeader />
          </div>

          {/* Mobile/tablet: account col carrello di fianco e la bandiera sotto
              l'account, accanto al logo: niente fascia bianca sotto il marchio. */}
          <div className="ml-auto flex shrink-0 items-start gap-1 lg:hidden">
            <div className="flex flex-col items-center gap-1">
              <AccountMenu account={account} guestMode={guestMode} />
              <LanguageToggle />
            </div>
            <HeaderCartIcon />
          </div>

          {/* Desktop: carrello, account e lingua impilati a destra (invariato). */}
          <div className="ml-auto hidden shrink-0 items-center gap-1.5 lg:ml-0 lg:flex lg:flex-col">
            <HeaderCartIcon />
            <AccountMenu account={account} guestMode={guestMode} />
            <LanguageToggle />
          </div>
        </div>

        <div className="pb-3 pt-3 lg:pb-1 lg:pt-1.5">
          <HeaderNav />
        </div>
      </div>
    </header>
  );
}
