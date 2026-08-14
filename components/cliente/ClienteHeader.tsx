import Link from "next/link";
import { ShoppingBasket } from "lucide-react";
import ClienteUserMenu from "./ClienteUserMenu";

/**
 * Header desktop dell'Area Clienti (visibile su md+).
 * Brand LocalHub + titolo Area Clienti, menu utente in alto a destra.
 */
export default function ClienteHeader() {
  return (
    <div className="hidden border-b border-blue-900/15 bg-[linear-gradient(180deg,#1d4ed8_0%,#2563eb_100%)] text-white shadow-lg md:block">
      <div className="h-1 bg-linear-to-r from-cyan-300 via-white to-yellow-300" />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-5">
          <Link
            href="/"
            aria-label="LocalHub — torna al sito"
            className="flex items-center gap-2 rounded-2xl px-2 py-1.5 transition hover:bg-white/10"
          >
            <ShoppingBasket className="h-6 w-6 text-cyan-200" aria-hidden />
            <span className="text-lg font-black tracking-tight text-white">
              LocalHub
            </span>
          </Link>

          <span className="h-8 w-px bg-white/20" aria-hidden />

          <div>
            <div className="flex items-center gap-2.5">
              <ShoppingBasket className="h-5 w-5 text-cyan-200" aria-hidden />
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
