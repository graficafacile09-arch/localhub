import Image from "next/image";
import Link from "next/link";

export default function Header() {
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
            <Link
              href="/merchant"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <span className="text-base leading-none">+</span>
              Aggiungi Prodotto
            </Link>
          </div>
        </div>

        {/* MENU */}

        <nav className="flex flex-wrap items-center justify-center gap-4 md:gap-8 text-sm md:text-base text-gray-700 font-semibold">

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

          <Link href="/merchant" className="hidden md:inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
            <span className="text-base leading-none">+</span>
            Aggiungi Prodotto
          </Link>

        </nav>

      </div>
    </header>
  );
}
