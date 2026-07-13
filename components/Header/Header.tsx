import Image from "next/image";

export default function Header() {
  return (
    <header className="bg-white shadow-md border-b">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between px-4 md:px-6 py-4 gap-4">

        {/* LOGO */}

        <div className="flex items-center justify-center md:justify-start w-full md:w-auto">

          <Image
            src="/logo.png"
            alt="LocalHub"
            width={170}
            height={55}
            priority
            className="w-[170px] md:w-[220px] h-auto"
          />

        </div>

        {/* MENU */}

        <nav className="flex flex-wrap justify-center gap-4 md:gap-8 text-sm md:text-base text-gray-700 font-semibold">

          <a href="#" className="hover:text-blue-600 transition">
            Home
          </a>

          <a href="#" className="hover:text-blue-600 transition">
            Negozi
          </a>

          <a href="#" className="hover:text-blue-600 transition">
            Categorie
          </a>

          <a href="#" className="hover:text-blue-600 transition">
            Contatti
          </a>

        </nav>

      </div>
    </header>
  );
}