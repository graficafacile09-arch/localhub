import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import AccountMenu from "./AccountMenu";
import { getDatiAccount } from "./get-account-data";

/**
 * Header pubblico: mostra il menu Account che riflette l'AREA ATTIVA della
 * sessione (cookie httpOnly lh_area): cliente, venditore o amministratore.
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

        <nav className="flex flex-nowrap items-center justify-center gap-2 md:gap-3">

          <Link
            href="/"
            className="relative inline-flex items-center overflow-hidden rounded-full bg-gradient-to-b from-yellow-300 to-yellow-400 px-3.5 py-1.5 text-sm font-bold text-slate-800 shadow-md shadow-yellow-400/30 ring-1 ring-yellow-300 transition-all duration-200 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/25 before:to-transparent hover:-translate-y-0.5 hover:from-yellow-200 hover:to-yellow-300 hover:shadow-lg hover:shadow-yellow-400/40 active:translate-y-0 active:scale-95 active:shadow-sm"
          >
            <span className="relative">Home</span>
          </Link>

          <Link
            href="/negozi"
            className="relative inline-flex items-center overflow-hidden rounded-full bg-gradient-to-b from-yellow-300 to-yellow-400 px-3.5 py-1.5 text-sm font-bold text-slate-800 shadow-md shadow-yellow-400/30 ring-1 ring-yellow-300 transition-all duration-200 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/25 before:to-transparent hover:-translate-y-0.5 hover:from-yellow-200 hover:to-yellow-300 hover:shadow-lg hover:shadow-yellow-400/40 active:translate-y-0 active:scale-95 active:shadow-sm"
          >
            <span className="relative">Negozi</span>
          </Link>

          <Link
            href="/categorie"
            className="relative inline-flex items-center overflow-hidden rounded-full bg-gradient-to-b from-yellow-300 to-yellow-400 px-3.5 py-1.5 text-sm font-bold text-slate-800 shadow-md shadow-yellow-400/30 ring-1 ring-yellow-300 transition-all duration-200 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/25 before:to-transparent hover:-translate-y-0.5 hover:from-yellow-200 hover:to-yellow-300 hover:shadow-lg hover:shadow-yellow-400/40 active:translate-y-0 active:scale-95 active:shadow-sm"
          >
            <span className="relative">Categorie</span>
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
            className="relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-yellow-300 to-yellow-400 text-slate-800 shadow-md shadow-yellow-400/30 ring-1 ring-yellow-300 transition-all duration-200 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/25 before:to-transparent hover:-translate-y-0.5 hover:from-yellow-200 hover:to-yellow-300 hover:shadow-lg hover:shadow-yellow-400/40 active:translate-y-0 active:scale-95"
          >
            <ShieldCheck className="relative h-4 w-4" aria-hidden />
          </Link>

          <div className="hidden md:block">
            <AccountMenu account={account} />
          </div>

        </nav>

      </div>
    </header>
  );
}
