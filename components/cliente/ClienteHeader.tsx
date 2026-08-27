import Link from "next/link";
import Image from "next/image";
import { ShoppingBasket } from "lucide-react";
import ClienteUserMenu from "./ClienteUserMenu";

/**
 * Header desktop dell'Area Clienti (visibile su md+).
 * Brand LocalHub + titolo Area Clienti, menu utente in alto a destra.
 */
export default function ClienteHeader() {
  return (
    <div className="hidden border-b border-blue-800/20 bg-blue-700 text-white shadow-sm md:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-5">
          <Link
            href="/"
            aria-label="LocalHub — torna al sito"
            className="flex items-center rounded-2xl bg-white p-2 shadow-sm transition hover:bg-blue-50"
          >
            <Image
              src="/logo-transparent.png"
              alt="LocalHub"
              width={1536}
              height={1024}
              priority
              className="h-auto w-[140px]"
            />
          </Link>

          <span className="h-8 w-px bg-white/20" aria-hidden />

          <div>
            <div className="flex items-center gap-2.5">
              <ShoppingBasket className="h-5 w-5 text-blue-200" aria-hidden />
              <span className="text-2xl font-black tracking-tight text-white">
                Area Clienti
              </span>
            </div>
            <p className="mt-1 text-sm text-blue-100">
              La tua area personale su LocalHub
            </p>
          </div>
        </div>

        <ClienteUserMenu />
      </div>
    </div>
  );
}
