import IncassiClient from "@/components/incassi/IncassiClient";
import PayoutVenditoreClient from "@/components/merchant/PayoutVenditoreClient";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";
import { Coins } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Pagina "Guadagni" dell'area venditore: unica destinazione per la parte
 * economica del negozio. Accorpa la vecchia pagina Incassi (rendiconto:
 * pagato, commissioni, rimborsi, netto) e la vecchia pagina Payout (netto
 * da erogare per periodo). Le vecchie route /incassi e /payout reindirizzano
 * qui (permanent redirect) — nessuna funzione persa.
 */
export default async function MerchantGuadagniPage({
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
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area venditore."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non hai accesso ai guadagni di questo negozio."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Intestazione Guadagni */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Coins className="h-7 w-7" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Area venditore
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Guadagni
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Tutta la parte economica del tuo negozio in un&apos;unica pagina:
              il rendiconto degli incassi (pagato, commissioni e netto) e il
              payout del periodo da erogare.
            </p>
          </div>
        </div>
      </div>

      {/* Rendiconto incassi */}
      <IncassiClient
        apiUrl={`/api/merchant/stores/${negozioId}/incassi`}
        dettaglioBase={`/merchant/${negozioId}/ordini`}
        intestazione="Rendiconto"
      />

      {/* Payout del periodo */}
      <PayoutVenditoreClient apiUrl={`/api/merchant/stores/${negozioId}/payout`} />
    </div>
  );
}
