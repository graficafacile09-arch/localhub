import Link from "next/link";
import { Globe, LogOut, UserRound } from "lucide-react";

/**
 * Menu utente dell'Area Clienti (visibile nell'header desktop).
 * Voci disponibili: torna al sito, profilo ed esci.
 */
export default function ClienteUserMenu() {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/cliente/profilo"
        className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
      >
        <UserRound className="h-4 w-4" aria-hidden />
        Il mio profilo
      </Link>
      <Link
        href="/"
        aria-label="Torna al sito"
        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
      >
        <Globe className="h-4 w-4" aria-hidden />
      </Link>
      <form action="/api/auth/signout" method="post">
        <button
          type="submit"
          aria-label="Esci"
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 text-sm font-semibold text-white transition hover:bg-white/15"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Esci
        </button>
      </form>
    </div>
  );
}
