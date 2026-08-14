import Link from "next/link";
import { Edit3, FolderOpen, Store as StoreIcon } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantProductsForStore, getMerchantStoreForUser } from "@/lib/merchant/data";

export const metadata = {
  title: "Negozio — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Dashboard del singolo negozio nell'Area Amministratore.
 * Punto di accesso rapido all'editor e alla libreria media del negozio.
 */
export default async function AdminNegozioDashboardPage({
  params,
}: {
  params: Promise<{ negozioId: string }>;
}) {
  const { negozioId } = await params;
  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired || !storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Il negozio non esiste oppure è stato eliminato."
      />
    );
  }

  const productsResult = await getMerchantProductsForStore(user.id, negozioId);
  const prodotti = productsResult.data.length;

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <StoreIcon className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Area Amministratore — Negozio
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900">
              {storeResult.data.nome}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {storeResult.data.categoria ?? "Categoria non definita"}
            </p>
            {storeResult.data.descrizione && (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {storeResult.data.descrizione}
              </p>
            )}
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-500">
          {prodotti} {prodotti === 1 ? "prodotto" : "prodotti"} nel catalogo.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/amministratore/negozi/${negozioId}/edit`}
          className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-md">
            <Edit3 className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-black text-slate-900">
              Apri editor
            </span>
            <span className="block text-[11px] text-slate-400">
              Modifica e salva il negozio
            </span>
          </span>
        </Link>

        <Link
          href={`/amministratore/negozi/${negozioId}/media`}
          className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md">
            <FolderOpen className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-black text-slate-900">
              Libreria Media
            </span>
            <span className="block text-[11px] text-slate-400">
              Immagini e file del negozio
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
