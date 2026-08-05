import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import AccountMenu from "./AccountMenu";
import { getDatiAccount } from "./get-account-data";

/**
 * Header pubblico: mostra il menu Account che cambia in base all'INSIEME
 * dei ruoli dell'utente (il webmaster vede Area Clienti, Area Commerciante
 * e Area Amministratore).
 */
export default async function Header() {
  const account = await getDatiAccount();

  return (
    <header className="bg-white shadow-md border-b">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between px-4 md:px-6 py-4 gap-4">

        {/* LOGO */}

        <div className="flex items-center justify-between w-full md:w-auto">
          <Link href="/">
            <Image
              src="/logo.png"
              alt="LocalHub"
              width={170}
              height={55}
              priority
              className="w-[170px] md:w-[220px] h-auto"
            />
          </Link>
          <div className="md:hidden">
            <AccountMenu account={account} />
          </div>
        </div>

        {/* MENU */}

        <nav className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-sm md:text-base text-gray-700 font-semibold">

          <Link href="/" className="hover:text-blue-600 transition">
            Home
          </Link>

          <Link href="/negozi" className="hover:text-blue-600 transition">
            Negozi
          </Link>

          <Link href="/ricerca" className="hover:text-blue-600 transition">
            Categorie
          </Link>

          <Link href="/assistant" className="hover:text-blue-600 transition">
            Assistente AI
          </Link>

          {/* Icona Amministrazione: visibile SOLO nelle sessioni con area
              attiva "admin" (concessa solo all'admin autorizzato al login) */}
          {account && account.area === "admin" ? (
            <Link
              href="/amministratore"
              title="Amministrazione"
              aria-label="Amministrazione"
              className="inline-flex items-center hover:text-blue-600 transition"
            >
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </Link>
          ) : null}

          <div className="hidden md:block">
            <AccountMenu account={account} />
          </div>

        </nav>

      </div>
    </header>
  );
}
