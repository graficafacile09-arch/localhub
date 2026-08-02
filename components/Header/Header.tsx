import Image from "next/image";
import Link from "next/link";
import { getCurrentRole } from "@/lib/auth/session";
import { contaNegoziUtente } from "@/lib/auth/roles";
import { getMerchantStoresForUser } from "@/lib/merchant/data";
import AccountMenu, { type DatiAccount } from "./AccountMenu";

/**
 * Header pubblico: sostituisce "+ Aggiungi Prodotto" con il menu Account,
 * che cambia automaticamente in base al ruolo dell'utente loggato.
 */
export default async function Header() {
  const auth = await getCurrentRole();

  let account: DatiAccount | null = null;

  if (auth) {
    const { user, role } = auth;
    const nome =
      String(user.user_metadata?.full_name ?? "").trim() ||
      String(user.email ?? "");

    let hasStores = false;
    let firstStoreId: string | null = null;

    if (role === "admin") {
      hasStores = (await contaNegoziUtente(user.id)) > 0;
    } else if (role === "merchant") {
      const storesResult = await getMerchantStoresForUser(user.id);
      hasStores = storesResult.data.length > 0;
      firstStoreId = storesResult.data[0]?.id ?? null;
    }

    account = { nome, email: user.email ?? "", role, hasStores, firstStoreId };
  }

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

          <div className="hidden md:block">
            <AccountMenu account={account} />
          </div>

        </nav>

      </div>
    </header>
  );
}
