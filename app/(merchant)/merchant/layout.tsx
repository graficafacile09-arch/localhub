import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import MerchantShell from "@/components/merchant/MerchantShell";
import { areaToPath } from "@/lib/auth/area";
import { getSessionArea } from "@/lib/auth/session-area";
import { getMerchantStoresForUser } from "@/lib/merchant/data";
import { getConteggiOrdiniNonLetti } from "@/lib/merchant/ordini";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function MerchantLayout({
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
  // lh_area), scelta al login e fissa per tutta la sessione: entra SOLO chi
  // ha una sessione "merchant". Gli altri vengono reindirizzati alla propria
  // area, mai a /login (se autenticati). Helper centrale: getSessionArea.
  const sessione = await getSessionArea();
  if (!sessione) redirect("/login?area=merchant");

  if (sessione.area !== "merchant") {
    redirect(areaToPath(sessione.area));
  }

  const storesResult = await getMerchantStoresForUser(sessione.user.id);

  // Badge "Ordini [N]" in sidebar e bottom nav: conteggio non letti per
  // negozio (best-effort, il sistema letto_at già esistente).
  const ordiniNonLettiPerNegozio = await getConteggiOrdiniNonLetti(
    storesResult.data.map((s) => s.id)
  );

  return (
    <MerchantShell
      user={sessione.user}
      stores={storesResult.data}
      banner={storesResult.setupRequired ? storesResult.errorMessage : storesResult.errorMessage}
      ordiniNonLettiPerNegozio={ordiniNonLettiPerNegozio}
    >
      {children}
    </MerchantShell>
  );
}
