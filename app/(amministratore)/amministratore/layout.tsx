import type { ReactNode } from "react";
import MerchantShell from "@/components/merchant/MerchantShell";
import { requireRuoli } from "@/lib/auth/session";
import { getMerchantStoresForUser } from "@/lib/merchant/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = {
  title: "Amministratore — InCittà",
  description:
    "Pannello di amministrazione di LocalHub: gestione di attività, prodotti, contenuti e piattaforma.",
};

/**
 * Layout dell'area Amministratore.
 * Accessibile SOLO agli utenti che possiedono il ruolo admin (multi-role).
 *
 * Riutilizza la STESSA shell dell'Area Commerciante (MerchantShell): stessa
 * grafica, stesso header, stessa sidebar e stessi moduli. La differenza è
 * che l'amministratore vede tutti i negozi della piattaforma e, in sidebar,
 * la card "Amministrazione" con gli strumenti di piattaforma (Cestino,
 * Utenti, Template, Scansioni AI, …).
 */
export default async function AmministratoreLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="min-h-screen bg-[#eef3f8] px-4 py-10 text-slate-900 md:px-6">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-amber-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
            Configurazione richiesta
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            Attiva Supabase per usare l&apos;area amministratore
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Aggiungi `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` all&apos;ambiente.
          </p>
        </div>
      </main>
    );
  }

  const { user } = await requireRuoli(["admin"], "/login?area=admin");
  const storesResult = await getMerchantStoresForUser(user.id);

  return (
    <MerchantShell
      area="admin"
      user={user}
      stores={storesResult.data}
      banner={storesResult.errorMessage}
    >
      {children}
    </MerchantShell>
  );
}
