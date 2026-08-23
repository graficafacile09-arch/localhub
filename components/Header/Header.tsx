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
 * - Riga superiore (bianca): logo a sinistra, Account a destra.
 * - Fascia blu FULL-WIDTH sotto l'header: le quattro voci (icona sopra +
 *   testo sotto), rettangolo dritto senza angoli arrotondati, separata
 *   visivamente dall'header superiore.
 *
 * Il menu Account riflette l'AREA ATTIVA della sessione (cookie httpOnly
 * lh_area): cliente, venditore o amministratore.
 */
export default async function Header() {
  const account = await getDatiAccount();

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 md:px-6 lg:flex-row lg:gap-4">
        {/* LOGO + azioni (carrello, account) — su mobile in riga con il logo */}
        <div className="flex w-full items-center justify-between gap-2 lg:w-auto">
          <Link href="/" aria-label="LocalHub — Home">
            <Image
              src="/logo.png"
              alt="LocalHub"
              width={170}
              height={55}
              priority
              className="h-auto w-[120px] sm:w-[170px] lg:w-[220px]"
            />
          </Link>
          <div className="flex items-center gap-2 lg:hidden">
            <AccountMenu account={account} />
          </div>
        </div>

        {/* Account: su desktop vive nella riga del logo (a destra). */}
        <div className="hidden lg:block">
          <AccountMenu account={account} />
        </div>
      </div>

      {/* FASCIA BLU FULL-WIDTH — navigazione pubblica sotto l'header.
          Rettangolo dritto (nessun angolo arrotondato), da bordo a bordo,
          separata visivamente dall'header superiore. */}
      <div className="w-full border-t border-white/10 bg-brand">
        <div className="mx-auto w-full max-w-7xl px-4 py-2.5 md:px-6 sm:py-3 lg:py-3.5">
          <HeaderNav />
        </div>
      </div>
    </header>
  );
}
