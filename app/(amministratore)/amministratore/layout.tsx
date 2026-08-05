import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import MerchantShell from "@/components/merchant/MerchantShell";
import { areaToPath } from "@/lib/auth/area";
import { getSessionArea } from "@/lib/auth/session-area";
import { getMerchantStoresForUser } from "@/lib/merchant/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = {
  title: "Amministratore — InCittà",
  description:
    "Pannello di amministrazione di LocalHub: gestione di attività, prodotti, contenuti e piattaforma.",
};

/**
 * Layout dell'Area Amministratore.
 * Accessibile SOLO alle sessioni con area attiva "admin" — che al login
 * vengono concesse ESCLUSIVAMENTE a graficafacile09@gmail.com con ruolo
 * admin (verifica email + ruolo nel risolutore dell'area). Qualsiasi altra
 * sessione viene reindirizzata alla propria area.
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

  // L'accesso è determinato dall'AREA ATTIVA della sessione (cookie httpOnly
  // lh_area). L'helper centrale garantisce che l'area "admin" venga concessa
  // solo all'admin autorizzato (email + ruolo): un cookie admin non valido
  // viene risolto automaticamente alla propria area.
  const sessione = await getSessionArea();
  if (!sessione) redirect("/login?area=admin");

  if (sessione.area !== "admin") {
    redirect(areaToPath(sessione.area));
  }

  const storesResult = await getMerchantStoresForUser(sessione.user.id);

  return (
    <MerchantShell
      area="admin"
      user={sessione.user}
      stores={storesResult.data}
      banner={storesResult.errorMessage}
    >
      {children}
    </MerchantShell>
  );
}
