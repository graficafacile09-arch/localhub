import type { ReactNode } from "react";
import MerchantShell from "@/components/merchant/MerchantShell";
import { requireRuoli } from "@/lib/auth/session";
import { getMerchantStoresForUser } from "@/lib/merchant/data";
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

  // Accesso SOLO a chi possiede il ruolo merchant o admin (multi-role).
  // I customer vengono reindirizzati alla home del loro ruolo.
  const { user } = await requireRuoli(["merchant", "admin"], "/login?redirect=/merchant");
  const storesResult = await getMerchantStoresForUser(user.id);

  return (
    <>
      <div style={{background:"#2563eb",color:"white",padding:"20px",textAlign:"center",fontSize:"28px",fontWeight:"900",fontFamily:"monospace",position:"sticky",top:0,zIndex:9999}}>
        ═══ MERCHANT LAYOUT ═══ app/(merchant)/merchant/layout.tsx ═══
      </div>
      <MerchantShell
      user={user}
      stores={storesResult.data}
      banner={storesResult.setupRequired ? storesResult.errorMessage : storesResult.errorMessage}
    >
      {children}
    </MerchantShell>
  );
}
