import Link from "next/link";
import { Home, ShieldCheck } from "lucide-react";
import AdminUserMenu from "./AdminUserMenu";

/**
 * Header desktop del pannello Amministratore (visibile su md+).
 * Riprende il linguaggio visivo dell'area commercianti di LocalHub.
 */
export default function AdminHeader() {
  return (
    <div className="hidden border-b border-blue-900/15 bg-[linear-gradient(180deg,#1d4ed8_0%,#2563eb_100%)] text-white shadow-lg md:block">
      <div className="h-1 bg-linear-to-r from-cyan-300 via-white to-yellow-300" />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/25"
          >
            <Home className="h-4 w-4" aria-hidden />
            Home
          </Link>
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

        <AdminUserMenu />
      </div>
    </div>
  );
}
