import Link from "next/link";
import { redirect } from "next/navigation";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoresForUser } from "@/lib/merchant/data";

export default async function MerchantHomePage() {
  const user = await requireCurrentUser("/login");
  const storesResult = await getMerchantStoresForUser(user.id);

  if (storesResult.setupRequired) {
    return (
      <MerchantEmptyState
        title="Merchant Foundation da configurare"
        description={storesResult.errorMessage ?? "Esegui la migrazione SQL iniziale per attivare membership, prodotti merchant e dashboard autenticata."}
      />
    );
  }

  if (storesResult.data.length === 1) {
    redirect(`/merchant/${storesResult.data[0].id}`);
  }

  if (storesResult.data.length === 0) {
    return (
      <MerchantEmptyState
        title="Nessun negozio associato"
        description="Questo utente non ha ancora membership attive. Collega l'account a uno o più negozi in Supabase per iniziare a gestire il catalogo."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          Area negozianti
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
          I tuoi negozi
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Scegli il negozio da gestire. Da qui partiranno il catalogo manuale e la futura funzione Pubblica con AI.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {storesResult.data.map((store) => (
          <Link
            key={store.id}
            href={`/merchant/${store.id}`}
            className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_20px_40px_-32px_rgba(37,99,235,0.45)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              {store.role}
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">
              {store.nome}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {store.categoria ?? "Categoria non definita"}
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              {store.descrizione ?? "Nessuna descrizione disponibile per questo negozio."}
            </p>
            <span className="mt-6 inline-flex rounded-2xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
              Gestisci negozio
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
