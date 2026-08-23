import Link from "next/link";
import { LogOut, ShoppingBasket } from "lucide-react";

/**
 * Menu utente dell'Area Clienti (visibile nell'header desktop).
 * Ridotto all'essenziale: "Area Clienti" ed "Esci". Profilo, Preferiti e
 * Ordini NON sono duplicati qui: sono già nella navigazione principale
 * (sidebar desktop / bottom nav mobile). Il ritorno al sito avviene dal
 * logo LocalHub (header) — nessun percorso duplicato.
 */
export default function ClienteUserMenu() {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/cliente"
        className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
      >
        <ShoppingBasket className="h-4 w-4" aria-hidden />
        Area Clienti
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
