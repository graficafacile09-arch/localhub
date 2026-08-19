import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import AccountMenu from "./AccountMenu";
import CartBadge from "../carrello/CartBadge";
import { getDatiAccount } from "./get-account-data";

/**
 * Header pubblico: mostra il menu Account che riflette l'AREA ATTIVA della
 * sessione (cookie httpOnly lh_area): cliente, venditore o amministratore.
 */
export default async function Header() {
  const account = await getDatiAccount();

  return (
    <header className="bg-white border-b border-slate-200 shadow-sm">
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

        <nav className="flex flex-wrap items-center justify-center gap-1.5 md:gap-3">

          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-yellow-400 px-3.5 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95"
          >
            Home
          </Link>

          <Link
            href="/negozi"
            className="inline-flex items-center rounded-full bg-yellow-400 px-3.5 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95"
          >
            Negozi
          </Link>

          <Link
            href="/categorie"
            className="inline-flex items-center rounded-full bg-yellow-400 px-3.5 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95"
          >
            Categorie
          </Link>

          {/* Icona Amministrazione (scudetto) — SEMPRE visibile accanto ad
              Assistente AI. Click:
              - non autenticato  → /login?area=admin
              - autenticato come admin → /amministratore
              L'area di sessione resta protetta da proxy + layout: qualunque
              altro utente viene reindirizzato alla propria area. */}
          <Link
            href={account && account.area === "admin" ? "/amministratore" : "/login?area=admin"}
            title="Amministrazione"
            aria-label="Amministrazione"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </Link>

          <CartBadge />

          <div className="hidden md:block">
            <AccountMenu account={account} />
          </div>

        </nav>

      </div>
    </header>
  );
}
