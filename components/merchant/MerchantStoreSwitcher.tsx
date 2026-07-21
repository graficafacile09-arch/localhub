import Link from "next/link";
import type { MerchantStoreSummary } from "@/lib/merchant/types";

export default function MerchantStoreSwitcher({ stores, currentStoreId }: { stores: MerchantStoreSummary[]; currentStoreId?: string }) {
  if (stores.length === 0) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        I tuoi negozi
      </p>
      <div className="mt-4 space-y-2">
        {stores.map((store) => {
          const active = store.id === currentStoreId;

          return (
            <Link
              key={store.id}
              href={`/merchant/${store.id}`}
              className={`block rounded-2xl border px-4 py-3 text-sm transition ${
                active
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200 hover:bg-blue-50/60"
              }`}
            >
              <div className="font-semibold">{store.nome}</div>
              <div className="mt-1 text-xs text-slate-500">{store.categoria ?? "Categoria non definita"}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
