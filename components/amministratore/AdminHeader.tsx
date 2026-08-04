import Link from "next/link";
import { ShieldCheck, Store } from "lucide-react";
import AccountMenu, { type DatiAccount } from "@/components/Header/AccountMenu";

/**
 * Header desktop del pannello Amministratore (visibile su md+).
 * `account` arriva dal layout (server): il webmaster (admin+merchant+
 * customer) vede nel menu utente tutte e tre le voci di area.
 */
export default function AdminHeader({ account }: { account: DatiAccount | null }) {
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
            <Store className="h-6 w-6 text-cyan-200" aria-hidden />
            <span className="text-lg font-black tracking-tight text-white">
              LocalHub
            </span>
          </Link>

          <span className="h-8 w-px bg-white/20" aria-hidden />

          <div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-cyan-200" aria-hidden />
              <span className="text-2xl font-black tracking-tight text-white">
                Amministratore
              </span>
            </div>
            <p className="mt-1 text-sm text-blue-100">
              Pannello di amministrazione LocalHub
            </p>
          </div>
        </div>

        <AccountMenu account={account} />
      </div>
    </div>
  );
}
