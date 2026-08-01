"use client";

import { Package, ArrowRight, Plus, Camera } from "lucide-react";
import Link from "next/link";
import ModuleShell from "./ModuleShell";

type Props = { storeId: string };

export default function ProdottiModule({ storeId }: Props) {
  return (
    <ModuleShell icon={<Package className="h-4 w-4" />} title="Prodotti" subtitle="Catalogo prodotti e servizi del negozio" id="prodotti">
      <div className="space-y-3">
        <Link
          href={`/merchant/${storeId}/prodotti`}
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <span>Gestisci catalogo prodotti</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href={`/merchant/${storeId}/prodotti/nuovo`}
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <span>Aggiungi prodotto manualmente</span>
          <Plus className="h-4 w-4" />
        </Link>
        <Link
          href={`/merchant/${storeId}/prodotti/ai`}
          className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:from-blue-100 hover:to-blue-200"
        >
          <span>Scansiona con AI</span>
          <Camera className="h-4 w-4" />
        </Link>
      </div>
    </ModuleShell>
  );
}
