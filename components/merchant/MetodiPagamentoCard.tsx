import Link from "next/link";
import { CreditCard } from "lucide-react";

/**
 * Card "Metodo di pagamento" — collegamento alla pagina dedicata
 * /merchant/[negozioId]/pagamenti. Condivisa tra la dashboard
 * (MerchantQuickActions) e la sezione "Vendita" di /impostazioni:
 * un'unica card, un unico collegamento.
 */
export default function MetodiPagamentoCard({ storeId }: { storeId: string }) {
  return (
    <Link
      href={`/merchant/${storeId}/pagamenti`}
      className="group flex items-center gap-4 rounded-2xl border border-yellow-300 bg-gradient-to-br from-yellow-50 to-yellow-100/60 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-yellow-400 hover:shadow-lg hover:shadow-yellow-500/15"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-blue-800 transition group-hover:bg-yellow-300">
        <CreditCard className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-slate-900">
          Metodo di pagamento
        </h2>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">
          Gestisci Stripe, PayPal, Klarna, Scalapay e Bonifico.
        </p>
      </div>
    </Link>
  );
}
