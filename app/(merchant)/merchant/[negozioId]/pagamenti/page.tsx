import { CreditCard } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import PagamentiModule from "@/components/merchant/modules/PagamentiModule";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export const dynamic = "force-dynamic";

/**
 * Pagina "Pagamenti" dell'area venditore: stato del collegamento Stripe
 * Connect (collega/scollega account), configurazione provider e attivazione
 * dei metodi mostrati al checkout. OWNERSHIP server-side (canManageStore +
 * RLS): il venditore gestisce solo i propri negozi. Stripe Connect è
 * per-negozio: il collegamento avviene via OAuth con callback a path fisso
 * (/api/merchant/pagamenti/stripe/callback) e binding allo store dallo
 * `state` firmato HMAC.
 */
export default async function MerchantPagamentiPage({
  params,
}: {
  params: Promise<{ negozioId: string }>;
}) {
  const { negozioId } = await params;
  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return (
      <MerchantEmptyState
        title="Configurazione database richiesta"
        description={
          storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area venditore."
        }
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non hai accesso ai pagamenti di questo negozio."
      />
    );
  }

  const store = storeResult.data;

  return (
    <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 sm:h-12 sm:w-12">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                Pagamenti
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                {store.nome ?? "Negozio"}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Collega Stripe Connect e configura i metodi di pagamento accettati.
              </p>
            </div>
          </div>
        </div>

        <PagamentiModule storeId={negozioId} />
      </div>
    </div>
  );
}
