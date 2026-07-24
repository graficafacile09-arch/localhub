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
              className="text-sm font-semibold text-blue-600 hover:underline"
            >
              Area Commercianti
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

          <Link href="/merchant" className="hidden md:inline-block text-blue-600 hover:text-blue-700 transition">
            Area Commercianti
          </Link>

        </nav>

      </div>
    </header>
  );
}
